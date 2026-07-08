import envPaths from "env-paths";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  isLivePhase,
  type Lang,
  type Match,
  type SourceName,
} from "../core/model.js";

const paths = envPaths("termfc", { suffix: "" });

export const CONFIG_FILE = join(paths.config, "config.json");
export const CACHE_DIR = paths.cache;
export const REPLAY_DIR = join(paths.cache, "replays");

const SCHEDULE_CACHE_FILE = join(CACHE_DIR, "schedule-17-285023.json");
// v2: cache holds the full-tournament snapshot + source/coverage metadata.
const SCHEMA_VERSION = 2;
export const SCHEDULE_TTL_MS = 30 * 60_000;

/** How long around kickoff a match makes the cache "hot" (see freshness). */
const LIVE_WINDOW_BEFORE_MS = 5 * 60_000;
const LIVE_WINDOW_AFTER_MS = 3.5 * 3600_000;

/** Atomic write: tmp file + rename, so Ctrl-C never half-writes JSON. */
export function atomicWrite(file: string, data: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

export interface Config {
  lang?: Lang;
  /** Commentary tone preset (v0.4+). Consumers validate with isTone(). */
  tone?: string;
}

export function readConfig(): Config {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    return typeof cfg === "object" && cfg !== null ? cfg : {};
  } catch {
    return {};
  }
}

export function writeConfig(cfg: Config): void {
  atomicWrite(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

/** "full" = whole-tournament snapshot (FIFA) · "window" = near-term (ESPN). */
export type Coverage = "full" | "window";

export interface ScheduleCache {
  fetchedAt: number;
  lang: Lang;
  source: SourceName;
  coverage: Coverage;
  matches: Match[];
}

/** Pure v2 validation — exported for tests. */
export function parseScheduleCache(raw: any, lang: Lang): ScheduleCache | null {
  // Version/language mismatch -> just discard and refetch (it's a cache).
  if (raw?.schemaVersion !== SCHEMA_VERSION || raw?.lang !== lang) return null;
  if (!Array.isArray(raw.matches) || typeof raw.fetchedAt !== "number")
    return null;
  if (raw.coverage !== "full" && raw.coverage !== "window") return null;
  return {
    fetchedAt: raw.fetchedAt,
    lang: raw.lang,
    source: raw.source === "espn" ? "espn" : "fifa",
    coverage: raw.coverage,
    matches: raw.matches,
  };
}

function readRawScheduleCache(): any {
  try {
    if (!existsSync(SCHEDULE_CACHE_FILE)) return null;
    return JSON.parse(readFileSync(SCHEDULE_CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function readScheduleCache(lang: Lang): ScheduleCache | null {
  const raw = readRawScheduleCache();
  return raw ? parseScheduleCache(raw, lang) : null;
}

/**
 * A window snapshot (ESPN fallback) must never clobber the full-tournament
 * snapshot — bracket/schedule need the full one even when it's stale.
 */
export function shouldReplaceCache(
  existingCoverage: Coverage | null,
  incoming: Coverage,
): boolean {
  return !(incoming === "window" && existingCoverage === "full");
}

export function writeScheduleCache(
  matches: Match[],
  lang: Lang,
  source: SourceName,
  coverage: Coverage,
): void {
  const raw = readRawScheduleCache();
  const existingCoverage: Coverage | null =
    raw?.schemaVersion === SCHEMA_VERSION &&
    (raw?.coverage === "full" || raw?.coverage === "window")
      ? raw.coverage
      : null;
  if (!shouldReplaceCache(existingCoverage, coverage)) return;
  atomicWrite(
    SCHEDULE_CACHE_FILE,
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      fetchedAt: Date.now(),
      lang,
      source,
      coverage,
      matches,
    }),
  );
}

/**
 * TTL plus content-based freshness: while any cached match is live — or we
 * are inside its kickoff window and it isn't finished — always refetch, so
 * scores shown for this run are current ("실행 시점 1회 조회").
 */
export function isScheduleFresh(
  cache: ScheduleCache,
  now = Date.now(),
): boolean {
  if (now - cache.fetchedAt >= SCHEDULE_TTL_MS) return false;
  for (const m of cache.matches) {
    if (isLivePhase(m.phase)) return false;
    if (m.phase === "FINISHED" || m.phase === "ABANDONED") continue;
    const k = new Date(m.kickoff).getTime();
    if (now >= k - LIVE_WINDOW_BEFORE_MS && now <= k + LIVE_WINDOW_AFTER_MS)
      return false;
  }
  return true;
}
