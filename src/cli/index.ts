import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { labels } from "../core/i18n.js";
import {
  isLivePhase,
  type Lang,
  type Match,
  type TimelineEvent,
} from "../core/model.js";
import { isTone, type Tone } from "../core/tone.js";
import { EspnProvider } from "../data/espn.js";
import { FailoverProvider, linkSourceRefs } from "../data/failover.js";
import { FifaProvider } from "../data/fifa.js";
import { fetchPreMatchLambdas } from "../data/odds.js";
import demoData from "../data/demo-match.json" with { type: "json" };
import { PollingEngine } from "../engine/polling.js";
import { ReplayFeed, parseReplay, type ParsedReplay } from "../replay/player.js";
import { ReplayRecorder } from "../replay/recorder.js";
import {
  isScheduleFresh,
  readConfig,
  readScheduleCache,
  REPLAY_DIR,
  writeConfig,
  writeScheduleCache,
  type Config,
  type Coverage,
} from "../store/store.js";
import { bold, cyan, dim, red, yellow } from "../ui/ansi.js";
import { renderBanner } from "../ui/banner.js";
import { renderBracket } from "../ui/bracketScreen.js";
import { renderFullSchedule, renderList, pickMatch } from "../ui/listScreen.js";
import { MatchScreen } from "../ui/matchScreen.js";
import pkg from "../../package.json" with { type: "json" };

interface Flags {
  lang?: Lang;
  tone?: Tone;
  speed?: number;
  anim: boolean;
  record: boolean;
}

function parseArgv(argv: string[]): { cmd?: string; args: string[]; flags: Flags } {
  const flags: Flags = { anim: true, record: true };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--lang") {
      const v = argv[++i];
      if (v === "ko" || v === "en") flags.lang = v;
    } else if (a.startsWith("--lang=")) {
      const v = a.slice(7);
      if (v === "ko" || v === "en") flags.lang = v;
    } else if (a === "--tone") {
      const v = argv[++i];
      if (isTone(v)) flags.tone = v;
    } else if (a.startsWith("--tone=")) {
      const v = a.slice(7);
      if (isTone(v)) flags.tone = v;
    } else if (a === "--speed") {
      flags.speed = Number(argv[++i]);
    } else if (a.startsWith("--speed=")) {
      flags.speed = Number(a.slice(8));
    } else if (a === "--no-anim") flags.anim = false;
    else if (a === "--no-record") flags.record = false;
    else if (a === "--version" || a === "-v") {
      console.log(pkg.version);
      process.exit(0);
    } else if (a === "--help" || a === "-h") rest.unshift("help");
    else rest.push(a);
  }
  return { cmd: rest[0], args: rest.slice(1), flags };
}

const HELP = `
  ${bold("termfc")} — unofficial World Cup 2026 live text commentary in your terminal

  ${bold("usage")}
    termfc                     ${dim("live + upcoming matches, pick one to join")}
    termfc live                ${dim("matches in progress")}
    termfc schedule            ${dim("full tournament schedule, pick one to join")}
    termfc bracket             ${dim("group tables + knockout bracket")}
    termfc watch <team|id>     ${dim("join a match (e.g. termfc watch KOR)")}
    termfc replay [file]       ${dim("replay a recorded match (no arg: list recordings)")}
    termfc demo                ${dim("bundled demo match (no network needed)")}

  ${bold("options")}
    --lang ko|en               ${dim("commentary language (default: ko, persisted)")}
    --tone official|community|brief  ${dim("commentary tone, ko only (persisted; t key toggles)")}
    --speed N                  ${dim("replay/demo speed multiplier")}
    --no-anim                  ${dim("skip entrance/goal animations")}
    --no-record                ${dim("don't record watched matches for replay")}
`;

async function main(): Promise<void> {
  const { cmd, args, flags } = parseArgv(process.argv.slice(2));
  const config = readConfig();
  const lang: Lang = flags.lang ?? config.lang ?? "ko";
  // Unknown stored values (edited by hand / written by a future version)
  // degrade to the default instead of leaking into rendering.
  flags.tone =
    flags.tone ?? (isTone(config.tone) ? config.tone : undefined) ?? "official";
  const persist: Partial<Config> = {};
  if (flags.lang && flags.lang !== config.lang) persist.lang = flags.lang;
  if (flags.tone !== (config.tone ?? "official")) persist.tone = flags.tone;
  if (Object.keys(persist).length > 0) {
    try {
      writeConfig({ ...config, ...persist });
    } catch {
      /* non-fatal */
    }
  }
  const l = labels(lang);

  if (cmd === "help") {
    console.log(renderBanner(pkg.version));
    console.log(HELP);
    return;
  }

  console.log(renderBanner(pkg.version));

  const fifa = new FifaProvider();
  const espn = new EspnProvider();
  const provider = new FailoverProvider(fifa, espn);

  if (cmd === "demo") {
    await runReplay(demoData as unknown as ParsedReplay, lang, flags, 120);
    return;
  }
  if (cmd === "replay") {
    await replayCommand(args[0], lang, flags);
    return;
  }

  const { matches, staleAt, coverage } = await loadSchedule(provider, espn, lang);
  if (matches.length === 0) {
    console.log(red(`  ${l.noData}\n`));
    process.exitCode = 1;
    return;
  }

  if (cmd === "bracket") {
    // The bracket needs the whole tournament; an ESPN-fallback window fetch
    // can't build it — prefer the (possibly stale) full FIFA snapshot then.
    let data: LoadedSchedule = { matches, staleAt, coverage };
    if (data.coverage !== "full") {
      const cachedFull = readScheduleCache(lang);
      if (cachedFull?.coverage === "full") {
        data = {
          matches: cachedFull.matches,
          staleAt: cachedFull.fetchedAt,
          coverage: "full",
        };
      } else {
        console.log(red(`  ${l.noBracketData}\n`));
        process.exitCode = 1;
        return;
      }
    }
    const pickable = renderBracket(data.matches, {
      lang,
      staleAt: data.staleAt,
    });
    if (process.stdin.isTTY && pickable.length > 0) {
      const choice = await pickMatch(pickable, lang);
      if (choice) await enterMatch(choice, provider, espn, lang, flags);
    }
    return;
  }
  if (cmd === "schedule") {
    const pickable = renderFullSchedule(matches, { lang, staleAt });
    // Piped/scripted use stays view-only and exits immediately (backcompat).
    if (process.stdin.isTTY && pickable.length > 0) {
      const choice = await pickMatch(pickable, lang);
      if (choice) await enterMatch(choice, provider, espn, lang, flags);
    }
    return;
  }
  if (cmd === "live") {
    const near = nearWindow(matches);
    const live = near.filter((m) => isLivePhase(m.phase));
    const pickable = renderList(
      live.length > 0 ? live : near.filter((m) => m.phase === "SCHEDULED").slice(0, 5),
      { lang, staleAt },
    );
    if (live.length === 0) return;
    const choice = await pickMatch(pickable, lang);
    if (choice) await enterMatch(choice, provider, espn, lang, flags);
    return;
  }
  if (cmd === "watch") {
    const ident = args[0];
    if (!ident) {
      console.log(HELP);
      return;
    }
    const match = findMatch(matches, ident);
    if (!match) {
      console.log(red(`  match not found: ${ident}\n`));
      process.exitCode = 1;
      return;
    }
    await enterMatch(match, provider, espn, lang, flags);
    return;
  }
  if (cmd !== undefined) {
    console.log(HELP);
    return;
  }

  // Default flow: list + picker (near window, as before v0.3)
  const pickable = renderList(nearWindow(matches), { lang, staleAt });
  const choice = await pickMatch(pickable, lang);
  if (choice) await enterMatch(choice, provider, espn, lang, flags);
}

interface LoadedSchedule {
  matches: Match[];
  staleAt: number | null;
  coverage: Coverage;
}

async function loadSchedule(
  provider: FailoverProvider,
  espn: EspnProvider,
  lang: Lang,
): Promise<LoadedSchedule> {
  const cached = readScheduleCache(lang);
  if (cached && isScheduleFresh(cached)) {
    return { matches: cached.matches, staleAt: null, coverage: cached.coverage };
  }
  try {
    const matches = await provider.fetchSchedule(lang);
    const source = provider.activeSource;
    // FIFA returns the whole tournament; ESPN fallback only a near window.
    const coverage: Coverage = source === "fifa" ? "full" : "window";
    // Pre-link ESPN refs now (decision doc: never map ids at failover time).
    if (source === "fifa") {
      try {
        linkSourceRefs(matches, await espn.fetchSchedule(lang));
      } catch {
        /* best-effort */
      }
    }
    writeScheduleCache(matches, lang, source, coverage);
    return { matches, staleAt: null, coverage };
  } catch {
    if (cached)
      return {
        matches: cached.matches,
        staleAt: cached.fetchedAt,
        coverage: cached.coverage,
      };
    return { matches: [], staleAt: null, coverage: "window" };
  }
}

/**
 * The pre-v0.3 view: recent results + the coming week. Default/live flows
 * keep this window; `schedule`/`bracket` show the whole tournament.
 */
function nearWindow(matches: Match[], now = Date.now()): Match[] {
  const from = now - 36 * 3600_000;
  const to = now + 8 * 86400_000;
  return matches.filter((m) => {
    const k = new Date(m.kickoff).getTime();
    return k >= from && k <= to;
  });
}

function findMatch(matches: Match[], ident: string): Match | null {
  const byId = matches.find((m) => m.id === ident);
  if (byId) return byId;
  const q = ident.toUpperCase();
  const hits = matches.filter(
    (m) =>
      m.home.code === q ||
      m.away.code === q ||
      m.home.name.toUpperCase().includes(q) ||
      m.away.name.toUpperCase().includes(q),
  );
  if (hits.length === 0) return null;
  return (
    hits.find((m) => isLivePhase(m.phase)) ??
    hits.find((m) => m.phase === "SCHEDULED") ??
    hits[hits.length - 1] ??
    null
  );
}

async function enterMatch(
  match: Match,
  provider: FailoverProvider,
  espn: EspnProvider,
  lang: Lang,
  flags: Flags,
): Promise<void> {
  // Lazy ESPN link: knockout slots are TBD-vs-TBD at schedule time, so the
  // team-pair pre-link can't catch them. By watch time the teams are known —
  // one one-day scoreboard call links the failover ref (best-effort).
  if (!match.sourceRefs.espn && match.home.code !== "TBD") {
    try {
      linkSourceRefs(
        [match],
        await espn.fetchDaySchedule(new Date(match.kickoff), lang),
      );
    } catch {
      /* best-effort */
    }
  }
  const lambdas = await fetchPreMatchLambdas(match);
  const engine = new PollingEngine(provider, match, lang);
  let recorder: ReplayRecorder | null = null;
  if (flags.record) {
    try {
      recorder = new ReplayRecorder(match);
    } catch {
      recorder = null;
    }
  }
  const screen = new MatchScreen(match, engine, {
    lang,
    mode: "live",
    animations: flags.anim,
    tone: flags.tone,
    lambdas,
    sourceLabel: () => provider.activeSource.toUpperCase(),
    onEvents: (events: TimelineEvent[]) => recorder?.append(events),
  });
  persistTone(await screen.run());
}

/** A tone settled on via the t toggle survives into the next run. */
function persistTone(finalTone: Tone): void {
  try {
    const cfg = readConfig();
    if ((cfg.tone ?? "official") === finalTone) return;
    writeConfig({ ...cfg, tone: finalTone });
  } catch {
    /* non-fatal */
  }
}

async function replayCommand(
  arg: string | undefined,
  lang: Lang,
  flags: Flags,
): Promise<void> {
  const l = labels(lang);
  let file = arg;
  if (!file) {
    const files = existsSync(REPLAY_DIR)
      ? readdirSync(REPLAY_DIR).filter((f) => f.endsWith(".jsonl"))
      : [];
    if (files.length === 0) {
      console.log(dim(`  (${l.recorded} 0)  →  ${cyan("termfc demo")}\n`));
      return;
    }
    console.log(`  ${bold(l.replaying)}\n`);
    files.forEach((f, i) =>
      console.log(`  ${dim(`${String(i + 1).padStart(2)}.`)} ${f}`),
    );
    console.log();
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`  ${l.pickPrompt}`)).trim();
    rl.close();
    const n = Number(answer);
    if (!Number.isInteger(n) || n < 1 || n > files.length) return;
    file = join(REPLAY_DIR, files[n - 1]!);
  } else if (!existsSync(file) && existsSync(join(REPLAY_DIR, file))) {
    file = join(REPLAY_DIR, file);
  }
  if (!existsSync(file)) {
    console.log(red(`  file not found: ${file}\n`));
    process.exitCode = 1;
    return;
  }
  const parsed = parseReplay(readFileSync(file, "utf8"));
  await runReplay(parsed, lang, flags, 60);
}

async function runReplay(
  parsed: ParsedReplay,
  lang: Lang,
  flags: Flags,
  defaultSpeed: number,
): Promise<void> {
  const speed =
    flags.speed && Number.isFinite(flags.speed) && flags.speed > 0
      ? flags.speed
      : defaultSpeed;
  const feed = new ReplayFeed(parsed, speed);
  const screen = new MatchScreen(parsed.match, feed, {
    lang,
    mode: "replay",
    animations: flags.anim,
    tone: flags.tone,
    clockRate: speed,
    speedLabel: String(speed),
    lambdas: null,
    sourceLabel: () => `${parsed.events[0]?.source ?? "fifa"} replay`,
  });
  persistTone(await screen.run());
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(red(`\n  termfc error: ${err?.message ?? err}\n`));
    console.error(
      yellow("  data sources may be unavailable — try again shortly\n"),
    );
    process.exit(1);
  });
