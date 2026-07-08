import * as readline from "node:readline/promises";
import { labels, roundLabel } from "../core/i18n.js";
import {
  isLivePhase,
  type Lang,
  type Match,
  type StageKind,
} from "../core/model.js";
import { phaseLabel } from "../core/state.js";
import { bold, cyan, dim, gray, green, red, yellow } from "./ansi.js";

export function kickoffLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function matchLine(m: Match, lang: Lang): string {
  const l = labels(lang);
  const vs = `${m.home.flag} ${m.home.name}`;
  const vs2 = `${m.away.name} ${m.away.flag}`;
  if (isLivePhase(m.phase)) {
    const t = m.matchTime ? ` ${m.matchTime}` : "";
    return `${red("●")}${bold(t.padEnd(8))} ${vs} ${bold(`${m.score.home} : ${m.score.away}`)} ${vs2}  ${dim(phaseLabel(m.phase, l))}`;
  }
  if (m.phase === "FINISHED") {
    const pens =
      m.score.penHome !== undefined
        ? ` (PSO ${m.score.penHome}-${m.score.penAway})`
        : "";
    return gray(
      `FT        ${m.home.name} ${m.score.home} : ${m.score.away}${pens} ${m.away.name}`,
    );
  }
  return `${dim(kickoffLabel(m.kickoff, lang).padEnd(20))} ${vs} ${dim("vs")} ${vs2}`;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export interface ListOptions {
  lang: Lang;
  /** When set, schedule came from a stale cache written at this timestamp. */
  staleAt?: number | null;
}

interface Section {
  title: string;
  matches: Match[];
}

function sections(matches: Match[], lang: Lang): Section[] {
  const l = labels(lang);
  const live = matches.filter((m) => isLivePhase(m.phase));
  const upcoming = matches.filter((m) => m.phase === "SCHEDULED");
  const finished = matches
    .filter((m) => m.phase === "FINISHED" || m.phase === "ABANDONED")
    .slice(-6);
  return [
    { title: l.liveNow, matches: live },
    { title: l.upcoming, matches: upcoming },
    { title: l.recentResults, matches: finished },
  ];
}

/**
 * Render the schedule / live list. Returns the numbered pick targets
 * (live + upcoming + recent) in display order.
 */
export function renderList(matches: Match[], opts: ListOptions): Match[] {
  const l = labels(opts.lang);
  const out = process.stdout;
  const pickable: Match[] = [];
  if (opts.staleAt) {
    const at = new Date(opts.staleAt).toTimeString().slice(0, 5);
    out.write(yellow(`  ⚠ ${l.offline} · ${at} ${l.staleData}\n\n`));
  }
  for (const sec of sections(matches, opts.lang)) {
    if (sec.matches.length === 0) continue;
    out.write(`  ${bold(cyan(sec.title))}\n`);
    for (const m of sec.matches) {
      pickable.push(m);
      const no = String(pickable.length).padStart(2);
      out.write(`  ${dim(no + ".")} ${matchLine(m, opts.lang)}\n`);
    }
    out.write("\n");
  }
  const anyLive = matches.some((m) => isLivePhase(m.phase));
  if (!anyLive) {
    const next = matches
      .filter((m) => m.phase === "SCHEDULED")
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
    if (next) {
      const ms = new Date(next.kickoff).getTime() - Date.now();
      out.write(
        `  ${green("⏳")} ${l.noLiveMatches} — ${l.nextMatchIn} ${bold(fmtCountdown(ms))} (${next.home.name} vs ${next.away.name})\n\n`,
      );
    } else {
      out.write(`  ${dim(l.noLiveMatches)}\n\n`);
    }
  }
  return pickable;
}

const FULL_ORDER: readonly (StageKind | "OTHER")[] = [
  "GROUP",
  "R32",
  "R16",
  "QF",
  "SF",
  "THIRD",
  "FINAL",
  "OTHER",
];

/**
 * Whole-tournament schedule grouped by round (v0.3): every match is
 * numbered and pickable — live joins now, upcoming enters waiting mode.
 */
export function renderFullSchedule(
  matches: Match[],
  opts: ListOptions,
): Match[] {
  const l = labels(opts.lang);
  const out = process.stdout;
  const pickable: Match[] = [];
  if (opts.staleAt) {
    const at = new Date(opts.staleAt).toTimeString().slice(0, 5);
    out.write(yellow(`  ⚠ ${l.offline} · ${at} ${l.staleData}\n\n`));
  }
  const byStage = new Map<StageKind | "OTHER", Match[]>();
  for (const m of matches) {
    const key = m.stageKind ?? "OTHER";
    const list = byStage.get(key) ?? [];
    list.push(m);
    byStage.set(key, list);
  }
  for (const kind of FULL_ORDER) {
    const list = byStage.get(kind);
    if (!list?.length) continue;
    list.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    const title =
      kind === "OTHER" ? l.schedule : roundLabel(kind, l);
    out.write(`  ${bold(cyan(title))}\n`);
    for (const m of list) {
      pickable.push(m);
      const no = String(pickable.length).padStart(3);
      out.write(`  ${dim(no + ".")} ${matchLine(m, opts.lang)}\n`);
    }
    out.write("\n");
  }
  return pickable;
}

export async function pickMatch(
  pickable: Match[],
  lang: Lang,
): Promise<Match | null> {
  if (pickable.length === 0) return null;
  const l = labels(lang);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    while (true) {
      const answer = (await rl.question(`  ${l.pickPrompt}`)).trim();
      if (answer === "q" || answer === "Q" || answer === "") return null;
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= pickable.length) {
        return pickable[n - 1] ?? null;
      }
    }
  } finally {
    rl.close();
  }
}
