#!/usr/bin/env node
/**
 * Rewrite the recorded FIFA/ESPN fixtures so no source prose lives in this
 * repo. Facts (players, teams, minutes, event types) are kept; every
 * sentence is re-synthesized locally from those facts. Adapter-parsed
 * patterns are preserved — player-carrying sentences keep the leading
 * "PLAYER (TEAM)" shape that extractPlayer() in src/data/fifa.ts relies on.
 *
 * Run after re-recording any fixture (idempotent):
 *   node scripts/sanitize-fixtures.mjs
 *
 * make-demo.mjs imports the same templates, so the bundled demo match
 * stays prose-free too.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FIXTURES = new URL("../test/fixtures/", import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));

// ---------------------------------------------------------------------------
// Fact extraction — tolerant of both source-original and already-synthesized
// sentences, so the script can be re-run safely.
// ---------------------------------------------------------------------------

/** Leading "PLAYER (TEAM)" name — same pattern as src/data/fifa.ts extractPlayer. */
export const playerFrom = (text) =>
  /^(.{2,40}?)\s*\(/.exec(text ?? "")?.[1]?.trim() || undefined;

export function subPlayersFrom(text) {
  for (const re of [
    /^(.+?) \(in\) comes off the bench to replace (.+?) \(out\)/, // FIFA en
    /^(.+?) \(in\) 선수가 (.+?)\s*\(교체\)/, // FIFA ko
    /^(?:선수 교체|Substitution)(?: \(.+?\))?: (.+?) (?:IN|in), (.+?) (?:OUT|out)$/, // synthetic
  ]) {
    const m = re.exec(text ?? "");
    if (m) return { inP: m[1].trim(), outP: m[2].trim() };
  }
  return {};
}

export function assistPlayerFrom(text) {
  for (const re of [
    /^Assisted by (.+?)\.?$/, // FIFA en
    /^(.+?) 선수의 어시스트/, // FIFA ko
    /^(?:어시스트|Assist): (.+)$/, // synthetic
  ]) {
    const m = re.exec(text ?? "");
    if (m) return m[1].trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Sentence synthesis — our own wording, generated from structured facts.
// Mirrors the spirit of the tone templates in src/core/tone.ts, extended with
// the facts a recorded fixture can carry (player, sub in/out, period).
// ---------------------------------------------------------------------------

const PERIOD_LABEL = {
  ko: { 3: "전반", 5: "후반", 7: "연장 전반", 9: "연장 후반" },
  en: { 3: "First half", 5: "Second half", 7: "ET first half", 9: "ET second half" },
};

/** Event types whose sentence must start with "PLAYER (TEAM)". */
export const PLAYER_TEXT_TYPES = new Set([
  "GOAL", "OWN_GOAL", "PENALTY_GOAL", "PENALTY_MISS",
  "YELLOW", "RED", "SHOT", "OFFSIDE", "FOUL", "CORNER",
]);

export function synthDescription(type, lang, f = {}) {
  const { player: p, team: t, inP, outP, period } = f;
  const who = p ? (t ? `${p} (${t})` : p) : undefined;
  const per = PERIOD_LABEL[lang]?.[period];

  if (lang === "ko") {
    switch (type) {
      case "GOAL": return who ? `${who} 득점!` : "골!";
      case "OWN_GOAL": return who ? `${who} 자책골` : "자책골";
      case "PENALTY_GOAL": return who ? `${who} 페널티킥 득점!` : "페널티킥 득점!";
      case "PENALTY_MISS": return who ? `${who} 페널티킥 실축` : "페널티킥 실축";
      case "SHOT": return who ? `${who} 슈팅 시도` : "슈팅 시도";
      case "SAVE": return t ? `${t} 골키퍼 선방` : "골키퍼 선방";
      case "FOUL": return who ? `${who} 파울` : "파울";
      case "YELLOW": return who ? `${who} 경고 (옐로카드)` : "경고 (옐로카드)";
      case "RED": return who ? `${who} 퇴장 (레드카드)` : "퇴장 (레드카드)";
      case "CORNER": return who ? `${who} 코너킥` : t ? `${t} 코너킥` : "코너킥";
      case "OFFSIDE": return who ? `${who} 오프사이드` : "오프사이드";
      case "SUBSTITUTION":
        if (inP && outP)
          return t ? `선수 교체 (${t}): ${inP} IN, ${outP} OUT` : `선수 교체: ${inP} IN, ${outP} OUT`;
        return t ? `${t} 선수 교체` : "선수 교체";
      case "ASSIST": return p ? `어시스트: ${p}` : "어시스트";
      case "COIN_TOSS": return t ? `동전 던지기 — ${t} 선축` : "동전 던지기";
      case "PERIOD_START": return per ? `${per} 시작` : "경기 시작 휘슬";
      case "PERIOD_END": return per ? `${per} 종료` : "종료 휘슬";
      case "FULLTIME": return "경기 종료";
      case "BREAK": return "수분 섭취 휴식 — 경기 일시 중단";
      case "RESUMED": return "경기 재개";
      case "VAR": return "VAR 판독 중";
      case "ADDED_TIME": return "추가시간 표시";
      default: return "경기 상황";
    }
  }

  switch (type) {
    case "GOAL": return who ? `${who} finds the net!` : "Goal!";
    case "OWN_GOAL": return who ? `${who} — own goal` : "Own goal";
    case "PENALTY_GOAL": return who ? `${who} — penalty scored!` : "Penalty scored!";
    case "PENALTY_MISS": return who ? `${who} — penalty missed` : "Penalty missed";
    case "SHOT": return who ? `${who} — shot at goal` : "Shot at goal";
    case "SAVE": return t ? `Save by the ${t} goalkeeper` : "Goalkeeper save";
    case "FOUL": return who ? `${who} — foul` : "Foul";
    case "YELLOW": return who ? `${who} — yellow card` : "Yellow card";
    case "RED": return who ? `${who} — red card` : "Red card";
    case "CORNER": return who ? `${who} — corner kick` : t ? `Corner kick — ${t}` : "Corner kick";
    case "OFFSIDE": return who ? `${who} — offside` : "Offside";
    case "SUBSTITUTION":
      if (inP && outP)
        return t ? `Substitution (${t}): ${inP} in, ${outP} out` : `Substitution: ${inP} in, ${outP} out`;
      return t ? `Substitution for ${t}` : "Substitution";
    case "ASSIST": return p ? `Assist: ${p}` : "Assist";
    case "COIN_TOSS": return t ? `Coin toss — ${t} to kick off` : "Coin toss";
    case "PERIOD_START": return per ? `${per} under way` : "Period under way";
    case "PERIOD_END": return per ? `${per} over` : "End of period";
    case "FULLTIME": return "Full-time";
    case "BREAK": return "Hydration break — play paused";
    case "RESUMED": return "Play resumes";
    case "VAR": return "VAR review";
    case "ADDED_TIME": return "Added time signalled";
    default: return "Match event";
  }
}

// ---------------------------------------------------------------------------
// Fixture rewriting (runs only when executed directly, not on import)
// ---------------------------------------------------------------------------

function sanitizeFifaTimelines(eventMap) {
  const matchDoc = load("fifa-match-finished.json");
  const TEAM_NAMES = {
    [String(matchDoc.Home.IdTeam)]: { ko: "포르투갈", en: "Portugal" },
    [String(matchDoc.Away.IdTeam)]: { ko: "스페인", en: "Spain" },
  };
  const ko = load("fifa-timeline-ko.json");
  const en = load("fifa-timeline-en.json");

  ko.Event.forEach((e, i) => {
    const ev = en.Event[i];
    if (ev && ev.EventId !== e.EventId)
      throw new Error(`ko/en fixtures out of sync at index ${i}`);
    const type = eventMap[String(e.Type)] ?? "UNKNOWN";
    const enText = ev?.EventDescription?.[0]?.Description ?? "";
    const names = TEAM_NAMES[String(e.IdTeam)];
    const facts = {
      period: e.Period,
      ...(PLAYER_TEXT_TYPES.has(type) ? { player: playerFrom(enText) } : {}),
      ...(type === "ASSIST" ? { player: assistPlayerFrom(enText) } : {}),
      ...(type === "SUBSTITUTION" ? subPlayersFrom(enText) : {}),
    };
    if (e.EventDescription?.[0])
      e.EventDescription[0].Description = synthDescription(type, "ko", { ...facts, team: names?.ko });
    if (ev?.EventDescription?.[0])
      ev.EventDescription[0].Description = synthDescription(type, "en", { ...facts, team: names?.en });
  });

  writeFileSync(new URL("fifa-timeline-ko.json", FIXTURES), JSON.stringify(ko, null, 1));
  writeFileSync(new URL("fifa-timeline-en.json", FIXTURES), JSON.stringify(en, null, 1));
  return ko.Event.length;
}

/** Keep only the fields src/data/espn.ts reads; synthesize every text field. */
function sanitizeEspnSummary() {
  const sum = load("espn-summary.json");
  const comp = sum.header?.competitions?.[0] ?? {};
  const prunePlay = (p, seq) => ({
    ...(p.id !== undefined ? { id: p.id } : {}),
    ...(p.type ? { type: p.type } : {}),
    text: `Synthetic sample play #${p.id ?? seq}`,
    ...(p.period ? { period: p.period } : {}),
    ...(p.clock ? { clock: p.clock } : {}),
    ...(p.team?.displayName ? { team: { displayName: p.team.displayName } } : {}),
    ...(p.participants
      ? { participants: p.participants.map((x) => ({ athlete: { displayName: x.athlete?.displayName } })) }
      : {}),
    ...(p.wallclock ? { wallclock: p.wallclock } : {}),
  });
  const slim = {
    header: {
      competitions: [
        {
          ...(comp.id !== undefined ? { id: comp.id } : {}),
          competitors: (comp.competitors ?? []).map((c) => ({
            homeAway: c.homeAway,
            team: {
              ...(c.team?.displayName ? { displayName: c.team.displayName } : {}),
              ...(c.team?.shortDisplayName ? { shortDisplayName: c.team.shortDisplayName } : {}),
              ...(c.team?.name ? { name: c.team.name } : {}),
            },
          })),
        },
      ],
    },
    commentary: (sum.commentary ?? []).map((item, i) => ({
      ...(item.sequence !== undefined ? { sequence: item.sequence } : {}),
      ...(item.time ? { time: item.time } : {}),
      text: `Synthetic sample commentary #${item.sequence ?? i}`,
      ...(item.play ? { play: prunePlay(item.play, item.sequence ?? i) } : {}),
    })),
  };
  writeFileSync(new URL("espn-summary.json", FIXTURES), JSON.stringify(slim));
  return slim.commentary.length;
}

function sanitizeEspnScoreboard() {
  const sb = load("espn-scoreboard.json");
  let n = 0;
  for (const ev of sb.events ?? [])
    for (const comp of ev.competitions ?? [])
      for (const h of comp.headlines ?? []) {
        if (h.description) h.description = "Synthetic sample match recap.";
        if (h.shortLinkText) h.shortLinkText = "Synthetic sample headline";
        n++;
      }
  writeFileSync(new URL("espn-scoreboard.json", FIXTURES), JSON.stringify(sb));
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const eventMap = JSON.parse(
    readFileSync(new URL("../src/data/fifa-event-map.json", import.meta.url), "utf8"),
  );
  const fifaN = sanitizeFifaTimelines(eventMap);
  const espnN = sanitizeEspnSummary();
  const headN = sanitizeEspnScoreboard();
  console.log(
    `sanitized: fifa-timeline ko/en ${fifaN} events, espn-summary ${espnN} items, espn-scoreboard ${headN} headlines`,
  );
}
