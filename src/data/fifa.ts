import { eventSentence } from "../core/i18n.js";
import {
  parseMatchMinute,
  type EventType,
  type Lang,
  type Match,
  type MatchState,
  type Team,
  type TimelineEvent,
} from "../core/model.js";
import { mapFifaPhase } from "../core/state.js";
import fifaEventMap from "./fifa-event-map.json" with { type: "json" };
import { getJson, SchemaError, type MatchDataProvider } from "./provider.js";
import { flagEmoji } from "./teams.js";

const BASE = "https://api.fifa.com/api/v3";
export const WORLD_CUP_2026 = { idCompetition: "17", idSeason: "285023" };

function apiLang(lang: Lang): string {
  return lang === "ko" ? "ko" : "en";
}

/**
 * FIFA's calendar endpoint silently returns `null` unless from/to are on
 * clean 30-minute boundaries (and rejects millisecond precision). Floor to
 * the hour to stay safe.
 */
function isoFloorHour(ms: number): string {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toTeam(raw: any, placeholder: string): Team {
  if (!raw) return { code: "TBD", name: placeholder || "TBD", flag: "🏳️" };
  const code: string = raw.Abbreviation ?? "TBD";
  const name: string =
    raw.TeamName?.[0]?.Description ?? raw.ShortClubName ?? code;
  return { code, name, flag: flagEmoji(code) };
}

function normalizeMatch(m: any): Match {
  const { minute } = parseMatchMinute(m.MatchTime);
  const phase = mapFifaPhase(m.MatchStatus, m.Period, minute);
  const home = toTeam(m.Home, m.PlaceHolderA ?? "TBD");
  const away = toTeam(m.Away, m.PlaceHolderB ?? "TBD");
  const match: Match = {
    id: String(m.IdMatch),
    stage: m.StageName?.[0]?.Description ?? "",
    kickoff: m.Date,
    home,
    away,
    score: {
      home: m.Home?.Score ?? m.HomeTeamScore ?? 0,
      away: m.Away?.Score ?? m.AwayTeamScore ?? 0,
      ...(m.HomeTeamPenaltyScore || m.AwayTeamPenaltyScore
        ? {
            penHome: m.HomeTeamPenaltyScore ?? 0,
            penAway: m.AwayTeamPenaltyScore ?? 0,
          }
        : {}),
    },
    phase,
    matchTime: m.MatchTime || undefined,
    sourceRefs: {
      fifa: {
        idCompetition: String(m.IdCompetition),
        idSeason: String(m.IdSeason),
        idStage: String(m.IdStage),
        idMatch: String(m.IdMatch),
        idHomeTeam: m.Home?.IdTeam ? String(m.Home.IdTeam) : undefined,
        idAwayTeam: m.Away?.IdTeam ? String(m.Away.IdTeam) : undefined,
      } as any,
    },
  };
  return match;
}

const PLAYER_TYPES: ReadonlySet<EventType> = new Set([
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
  "PENALTY_MISS",
  "YELLOW",
  "RED",
  "SHOT",
  "OFFSIDE",
  "FOUL",
]);

function extractPlayer(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = /^(.{2,40}?)\s*\(/.exec(text);
  return m?.[1]?.trim() || undefined;
}

export class FifaProvider implements MatchDataProvider {
  readonly name = "fifa" as const;

  constructor(
    private readonly season = WORLD_CUP_2026,
    private readonly base = BASE,
  ) {}

  async fetchSchedule(lang: Lang): Promise<Match[]> {
    const now = Date.now();
    const from = isoFloorHour(now - 36 * 3600_000);
    const to = isoFloorHour(now + 8 * 86400_000 + 3600_000);
    const data = await getJson(
      `${this.base}/calendar/matches?from=${from}&to=${to}&idCompetition=${this.season.idCompetition}&idSeason=${this.season.idSeason}&count=200&language=${apiLang(lang)}`,
    );
    if (!Array.isArray(data?.Results))
      throw new SchemaError("fifa", "calendar Results is not an array");
    return data.Results.map(normalizeMatch).sort((a: Match, b: Match) =>
      a.kickoff.localeCompare(b.kickoff),
    );
  }

  async fetchMatchState(match: Match, lang: Lang): Promise<MatchState | null> {
    const ref = match.sourceRefs.fifa;
    if (!ref) return null;
    // Prefer the live endpoint (cheap, has running MatchTime)…
    try {
      const live = await getJson(
        `${this.base}/live/football/now?language=${apiLang(lang)}`,
      );
      const m = (live?.Results ?? []).find(
        (r: any) => String(r.IdMatch) === ref.idMatch,
      );
      if (m) return this.toState(m);
    } catch {
      // fall through to calendar
    }
    // …fall back to a calendar window around kickoff (pre/post-match state).
    const k = new Date(match.kickoff).getTime();
    const from = isoFloorHour(k - 3600_000);
    const to = isoFloorHour(k + 9 * 3600_000);
    const data = await getJson(
      `${this.base}/calendar/matches?from=${from}&to=${to}&idCompetition=${this.season.idCompetition}&idSeason=${this.season.idSeason}&count=50&language=${apiLang(lang)}`,
    );
    const m = (data?.Results ?? []).find(
      (r: any) => String(r.IdMatch) === ref.idMatch,
    );
    return m ? this.toState(m) : null;
  }

  private toState(m: any): MatchState {
    const { minute, injury } = parseMatchMinute(m.MatchTime);
    return {
      score: {
        home: m.Home?.Score ?? m.HomeTeamScore ?? 0,
        away: m.Away?.Score ?? m.AwayTeamScore ?? 0,
        ...(m.HomeTeamPenaltyScore || m.AwayTeamPenaltyScore
          ? {
              penHome: m.HomeTeamPenaltyScore ?? 0,
              penAway: m.AwayTeamPenaltyScore ?? 0,
            }
          : {}),
      },
      phase: mapFifaPhase(m.MatchStatus, m.Period, minute),
      minute,
      ...(injury !== undefined ? { injury } : {}),
    };
  }

  async fetchTimeline(match: Match, lang: Lang): Promise<TimelineEvent[]> {
    const ref = match.sourceRefs.fifa as any;
    if (!ref) throw new SchemaError("fifa", "match has no fifa source ref");
    const data = await getJson(
      `${this.base}/timelines/${ref.idCompetition}/${ref.idSeason}/${ref.idStage}/${ref.idMatch}?language=${apiLang(lang)}`,
    );
    if (!Array.isArray(data?.Event))
      throw new SchemaError("fifa", "timeline Event is not an array");
    const map = fifaEventMap as Record<string, string>;
    return data.Event.map((e: any, i: number): TimelineEvent => {
      const type = (map[String(e.Type)] ?? "UNKNOWN") as EventType;
      const { minute, injury } = parseMatchMinute(e.MatchMinute);
      const text: string | undefined =
        e.EventDescription?.[0]?.Description || undefined;
      const teamSide =
        e.IdTeam && ref.idHomeTeam && String(e.IdTeam) === ref.idHomeTeam
          ? "home"
          : e.IdTeam && ref.idAwayTeam && String(e.IdTeam) === ref.idAwayTeam
            ? "away"
            : undefined;
      const isGoal =
        type === "GOAL" || type === "OWN_GOAL" || type === "PENALTY_GOAL";
      return {
        id: `fifa:${e.EventId ?? `${e.Type}-${e.MatchMinute}-${i}`}`,
        type,
        minute,
        ...(injury !== undefined ? { injury } : {}),
        period: e.Period,
        ...(e.IdTeam
          ? { teamCode: teamSide ? match[teamSide].code : String(e.IdTeam) }
          : {}),
        ...(teamSide ? { teamSide } : {}),
        ...(PLAYER_TYPES.has(type)
          ? { player: extractPlayer(text) }
          : {}),
        text:
          text ??
          eventSentence({ type }, lang, {
            team: teamSide ? match[teamSide].name : undefined,
          }),
        ...(isGoal && typeof e.HomeGoals === "number"
          ? { scoreAfter: { home: e.HomeGoals, away: e.AwayGoals } }
          : {}),
        source: "fifa",
        seq: i,
      };
    });
  }
}
