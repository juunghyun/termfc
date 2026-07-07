import { eventSentence } from "../core/i18n.js";
import {
  parseMatchMinute,
  type EventType,
  type Lang,
  type Match,
  type MatchState,
  type TimelineEvent,
} from "../core/model.js";
import { mapEspnPhase } from "../core/state.js";
import espnEventMap from "./espn-event-map.json" with { type: "json" };
import { getJson, SchemaError, type MatchDataProvider } from "./provider.js";
import { flagEmoji } from "./teams.js";

export const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";
const BASE = ESPN_BASE;
export const ESPN_WC_SLUG = "fifa.world";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

export class EspnProvider implements MatchDataProvider {
  readonly name = "espn" as const;

  constructor(
    private readonly league = ESPN_WC_SLUG,
    private readonly base = BASE,
  ) {}

  private scoreboardUrl(): string {
    const from = fmtDate(new Date(Date.now() - 36 * 3600_000));
    const to = fmtDate(new Date(Date.now() + 8 * 86400_000));
    return `${this.base}/${this.league}/scoreboard?dates=${from}-${to}`;
  }

  async fetchSchedule(_lang: Lang): Promise<Match[]> {
    const data = await getJson(this.scoreboardUrl());
    if (!Array.isArray(data?.events))
      throw new SchemaError("espn", "scoreboard events is not an array");
    return data.events
      .map((e: any) => this.normalizeEvent(e))
      .filter((m: Match | null): m is Match => m !== null)
      .sort((a: Match, b: Match) => a.kickoff.localeCompare(b.kickoff));
  }

  private normalizeEvent(e: any): Match | null {
    const comp = e.competitions?.[0];
    if (!comp) return null;
    const homeC = comp.competitors?.find((c: any) => c.homeAway === "home");
    const awayC = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!homeC || !awayC) return null;
    const status = comp.status ?? e.status ?? {};
    const phase = mapEspnPhase(
      status.type?.name ?? "",
      status.type?.state ?? "",
      status.period ?? 0,
    );
    const team = (c: any) => {
      const code = c.team?.abbreviation ?? "TBD";
      return {
        code,
        name: c.team?.displayName ?? code,
        flag: flagEmoji(code),
      };
    };
    return {
      id: String(e.id),
      stage: e.season?.slug ?? comp.altGameNote ?? "",
      kickoff: comp.date ?? e.date,
      home: team(homeC),
      away: team(awayC),
      score: {
        home: Number(homeC.score ?? 0),
        away: Number(awayC.score ?? 0),
      },
      phase,
      matchTime: status.displayClock,
      sourceRefs: { espn: { eventId: String(e.id) } },
    };
  }

  async fetchMatchState(match: Match, _lang: Lang): Promise<MatchState | null> {
    const ref = match.sourceRefs.espn;
    if (!ref) return null;
    const data = await getJson(this.scoreboardUrl());
    const e = (data?.events ?? []).find(
      (ev: any) => String(ev.id) === ref.eventId,
    );
    if (!e) return null;
    const comp = e.competitions?.[0];
    const status = comp?.status ?? e.status ?? {};
    const homeC = comp?.competitors?.find((c: any) => c.homeAway === "home");
    const awayC = comp?.competitors?.find((c: any) => c.homeAway === "away");
    const clockSec: number | undefined =
      typeof status.clock === "number" ? status.clock : undefined;
    const { injury } = parseMatchMinute(status.displayClock);
    return {
      score: {
        home: Number(homeC?.score ?? 0),
        away: Number(awayC?.score ?? 0),
      },
      phase: mapEspnPhase(
        status.type?.name ?? "",
        status.type?.state ?? "",
        status.period ?? 0,
      ),
      minute:
        clockSec !== undefined
          ? Math.floor(clockSec / 60)
          : parseMatchMinute(status.displayClock).minute,
      ...(clockSec !== undefined ? { second: Math.floor(clockSec % 60) } : {}),
      ...(injury !== undefined ? { injury } : {}),
    };
  }

  /**
   * ESPN commentary is copyrighted prose — we never redistribute it. We map
   * the structured play data (type, clock, team, players) to internal events
   * and generate our own sentences via i18n templates.
   */
  async fetchTimeline(match: Match, lang: Lang): Promise<TimelineEvent[]> {
    const ref = match.sourceRefs.espn;
    if (!ref) throw new SchemaError("espn", "match has no espn source ref");
    const data = await getJson(
      `${this.base}/${this.league}/summary?event=${ref.eventId}`,
    );
    const commentary = data?.commentary;
    if (!Array.isArray(commentary))
      throw new SchemaError("espn", "summary commentary is not an array");

    // Map ESPN team display names -> home/away side.
    const sideByName = new Map<string, "home" | "away">();
    for (const c of data?.header?.competitions?.[0]?.competitors ?? []) {
      const side = c.homeAway === "home" ? "home" : "away";
      for (const n of [
        c.team?.displayName,
        c.team?.shortDisplayName,
        c.team?.name,
      ])
        if (n) sideByName.set(n, side);
    }

    const map = espnEventMap as Record<string, string>;
    return commentary.map((item: any, i: number): TimelineEvent => {
      const play = item.play ?? {};
      const slug: string = play.type?.type ?? "";
      const type = (map[slug] ?? "UNKNOWN") as EventType;
      const totalSec: number =
        typeof item.time?.value === "number" ? item.time.value : 0;
      const { minute: dispMin, injury } = parseMatchMinute(
        item.time?.displayValue,
      );
      const minute = dispMin || Math.floor(totalSec / 60);
      const teamName: string | undefined = play.team?.displayName;
      const teamSide = teamName ? sideByName.get(teamName) : undefined;
      const player: string | undefined =
        play.participants?.[0]?.athlete?.displayName;
      return {
        id: `espn:${play.id ?? `c${item.sequence ?? i}`}`,
        type,
        minute,
        ...(injury !== undefined ? { injury } : {}),
        second: Math.floor(totalSec % 60),
        period: play.period?.number,
        ...(teamSide
          ? { teamSide, teamCode: match[teamSide].code }
          : {}),
        ...(player ? { player } : {}),
        text: eventSentence({ type }, lang, {
          player,
          team: teamSide ? match[teamSide].name : teamName,
        }),
        source: "espn",
        seq: i,
      };
    });
  }
}
