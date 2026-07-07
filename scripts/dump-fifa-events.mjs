#!/usr/bin/env node
/**
 * Dump real FIFA World Cup 2026 timelines to:
 *  1. enumerate every event Type code seen in finished matches (goal code verification)
 *  2. save representative fixtures for adapter tests
 *
 * Usage: node scripts/dump-fifa-events.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";

const UA =
  "termfc/dev (+https://github.com/juunghyun/termfc) event-map bootstrap";
const BASE = "https://api.fifa.com/api/v3";
const WC = { idCompetition: "17", idSeason: "285023" };
const FIXTURE_DIR = new URL("../test/fixtures/", import.meta.url);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

const cal = await get(
  `/calendar/matches?idCompetition=${WC.idCompetition}&idSeason=${WC.idSeason}&count=500&language=en`,
);
const finished = (cal.Results ?? []).filter((m) => m.MatchStatus === 0);
console.log(`finished WC matches: ${finished.length}`);

const typeStats = new Map(); // type -> {count, samples:Set, minutes:Set}
let goalCrossCheck = [];

// Sample the most recent finished matches across rounds (R16 + R32 + groups).
const sample = finished.slice(-12);
for (const m of sample) {
  const home = m.Home?.TeamName?.[0]?.Description ?? "?";
  const away = m.Away?.TeamName?.[0]?.Description ?? "?";
  const tl = await get(
    `/timelines/${m.IdCompetition}/${m.IdSeason}/${m.IdStage}/${m.IdMatch}?language=en`,
  );
  const events = tl.Event ?? [];
  let goalish = 0;
  for (const e of events) {
    const t = String(e.Type);
    if (!typeStats.has(t))
      typeStats.set(t, { count: 0, samples: new Set(), periods: new Set() });
    const s = typeStats.get(t);
    s.count++;
    s.periods.add(e.Period);
    const text = e.EventDescription?.[0]?.Description;
    if (text && s.samples.size < 2) s.samples.add(`[${e.MatchMinute}] ${text}`);
    if (/goal|scores/i.test(text ?? "")) goalish++;
  }
  goalCrossCheck.push({
    match: `${home} ${m.Home?.Score}-${m.Away?.Score} ${away}`,
    events: events.length,
    goalishTexts: goalish,
  });
  console.log(
    `dumped ${home} vs ${away}: ${events.length} events (score ${m.Home?.Score}-${m.Away?.Score})`,
  );
}

console.log("\n=== TYPE CODE TABLE (from real 2026 data) ===");
for (const [t, s] of [...typeStats].sort((a, b) => +a[0] - +b[0])) {
  console.log(
    `type ${t.padStart(3)} | n=${String(s.count).padStart(4)} | periods=${[...s.periods].join(",")} | ${[...s.samples].join(" || ").slice(0, 150)}`,
  );
}
console.log("\n=== GOAL CROSS-CHECK ===");
for (const g of goalCrossCheck) console.log(JSON.stringify(g));

// Fixtures: Portugal vs Spain R16 (known: 0-1, Merino 90'+1) in en + ko, plus calendar page.
const por = finished.find(
  (m) =>
    m.Home?.TeamName?.[0]?.Description === "Portugal" &&
    m.Away?.TeamName?.[0]?.Description === "Spain",
);
await mkdir(FIXTURE_DIR, { recursive: true });
if (por) {
  for (const lang of ["en", "ko"]) {
    const tl = await get(
      `/timelines/${por.IdCompetition}/${por.IdSeason}/${por.IdStage}/${por.IdMatch}?language=${lang}`,
    );
    await writeFile(
      new URL(`fifa-timeline-${lang}.json`, FIXTURE_DIR),
      JSON.stringify(tl, null, 1),
    );
  }
  await writeFile(
    new URL("fifa-match-finished.json", FIXTURE_DIR),
    JSON.stringify(por, null, 1),
  );
}
const live = await get(`/live/football/now?language=en`);
await writeFile(
  new URL("fifa-live-now.json", FIXTURE_DIR),
  JSON.stringify(live, null, 1),
);
await writeFile(
  new URL("fifa-calendar-sample.json", FIXTURE_DIR),
  JSON.stringify({ Results: (cal.Results ?? []).slice(-8) }, null, 1),
);
console.log("\nfixtures written to test/fixtures/");
