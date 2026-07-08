#!/usr/bin/env node
/**
 * Build src/data/demo-match.json (bundled offline demo) from the recorded
 * FIFA fixtures: Portugal 0-1 Spain, Round of 16, 2026-07-06.
 * Normalization mirrors src/data/fifa.ts (kept minimal on purpose).
 *
 * Event sentences are NOT copied from the source feed — they are synthesized
 * from structured facts via the shared templates in sanitize-fixtures.mjs,
 * so the npm package never redistributes FIFA prose. If fixtures were
 * re-recorded, run `node scripts/sanitize-fixtures.mjs` first.
 *
 * Usage: node scripts/make-demo.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  assistPlayerFrom,
  playerFrom,
  subPlayersFrom,
  synthDescription,
} from "./sanitize-fixtures.mjs";

const timeline = JSON.parse(
  readFileSync(new URL("../test/fixtures/fifa-timeline-ko.json", import.meta.url)),
);
const rawMatch = JSON.parse(
  readFileSync(new URL("../test/fixtures/fifa-match-finished.json", import.meta.url)),
);
const eventMap = JSON.parse(
  readFileSync(new URL("../src/data/fifa-event-map.json", import.meta.url)),
);

// Try to localize team/stage names to Korean (demo default lang) — offline fallback: English fixture names.
let koMatch = null;
try {
  const noMs = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const from = noMs(new Date(rawMatch.Date).getTime() - 3600e3);
  const to = noMs(new Date(rawMatch.Date).getTime() + 6 * 3600e3);
  const res = await fetch(
    `https://api.fifa.com/api/v3/calendar/matches?from=${from}&to=${to}&idCompetition=17&idSeason=285023&count=50&language=ko`,
    { headers: { "user-agent": "termfc demo builder" } },
  );
  const data = await res.json();
  koMatch = (data.Results ?? []).find((m) => m.IdMatch === rawMatch.IdMatch) ?? null;
} catch {
  /* offline — use fixture */
}
const src = koMatch ?? rawMatch;

const FLAGS = { POR: "🇵🇹", ESP: "🇪🇸" };
// Offline fallbacks keep the demo deterministic in Korean (its fixed lang)
// even when the localization fetch above fails.
const KO_NAMES = { POR: "포르투갈", ESP: "스페인" };
const KO_STAGES = { "Round of 16": "16강전" };
const team = (raw) => ({
  code: raw.Abbreviation,
  name:
    (koMatch ? raw.TeamName?.[0]?.Description : KO_NAMES[raw.Abbreviation]) ??
    raw.TeamName?.[0]?.Description ??
    raw.Abbreviation,
  flag: FLAGS[raw.Abbreviation] ?? "🏳️",
});

const rawStage = src.StageName?.[0]?.Description ?? "Round of 16";
const match = {
  id: String(src.IdMatch),
  stage: (koMatch ? rawStage : KO_STAGES[rawStage]) ?? rawStage,
  kickoff: src.Date,
  home: team(src.Home),
  away: team(src.Away),
  score: { home: 0, away: 0 },
  phase: "FIRST_HALF",
  sourceRefs: {
    fifa: {
      idCompetition: String(src.IdCompetition),
      idSeason: String(src.IdSeason),
      idStage: String(src.IdStage),
      idMatch: String(src.IdMatch),
    },
  },
};

const PLAYER_TYPES = new Set([
  "GOAL", "OWN_GOAL", "PENALTY_GOAL", "PENALTY_MISS",
  "YELLOW", "RED", "SHOT", "OFFSIDE", "FOUL",
]);
const parseMinute = (raw) => {
  const m = /^(\d+)'(?:\s*\+\s*(\d+)')?/.exec(raw ?? "");
  return m
    ? { minute: Number(m[1]), injury: m[2] !== undefined ? Number(m[2]) : undefined }
    : { minute: 0 };
};

const homeId = String(rawMatch.Home.IdTeam);
const awayId = String(rawMatch.Away.IdTeam);

const events = timeline.Event.map((e, i) => {
  const type = eventMap[String(e.Type)] ?? "UNKNOWN";
  const { minute, injury } = parseMinute(e.MatchMinute);
  const srcText = e.EventDescription?.[0]?.Description ?? "";
  const teamSide =
    String(e.IdTeam) === homeId ? "home" : String(e.IdTeam) === awayId ? "away" : undefined;
  const teamName = teamSide ? match[teamSide].name : undefined;
  const player = PLAYER_TYPES.has(type) || type === "CORNER"
    ? playerFrom(srcText)
    : undefined;
  const text = synthDescription(type, "ko", {
    period: e.Period,
    team: teamName,
    player: type === "ASSIST" ? assistPlayerFrom(srcText) : player,
    ...(type === "SUBSTITUTION" ? subPlayersFrom(srcText) : {}),
  });
  const isGoal = type === "GOAL" || type === "OWN_GOAL" || type === "PENALTY_GOAL";
  return {
    id: `fifa:${e.EventId ?? i}`,
    type,
    minute,
    ...(injury !== undefined ? { injury } : {}),
    period: e.Period,
    ...(teamSide ? { teamSide, teamCode: match[teamSide].code } : {}),
    ...(player && PLAYER_TYPES.has(type) ? { player } : {}),
    text,
    ...(isGoal && typeof e.HomeGoals === "number"
      ? { scoreAfter: { home: e.HomeGoals, away: e.AwayGoals } }
      : {}),
    source: "fifa",
    seq: i,
  };
});

writeFileSync(
  new URL("../src/data/demo-match.json", import.meta.url),
  JSON.stringify({ match, events }, null, 1),
);
console.log(`demo-match.json written: ${events.length} events, ${match.home.name} vs ${match.away.name}`);
