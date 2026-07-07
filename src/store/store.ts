import envPaths from "env-paths";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Lang, Match } from "../core/model.js";

const paths = envPaths("termfc", { suffix: "" });

export const CONFIG_FILE = join(paths.config, "config.json");
export const CACHE_DIR = paths.cache;
export const REPLAY_DIR = join(paths.cache, "replays");

const SCHEDULE_CACHE_FILE = join(CACHE_DIR, "schedule-17-285023.json");
const SCHEMA_VERSION = 1;
export const SCHEDULE_TTL_MS = 30 * 60_000;

/** Atomic write: tmp file + rename, so Ctrl-C never half-writes JSON. */
export function atomicWrite(file: string, data: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

export interface Config {
  lang?: Lang;
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

export interface ScheduleCache {
  fetchedAt: number;
  lang: Lang;
  matches: Match[];
}

export function readScheduleCache(lang: Lang): ScheduleCache | null {
  try {
    if (!existsSync(SCHEDULE_CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync(SCHEDULE_CACHE_FILE, "utf8"));
    // Version/language mismatch -> just discard and refetch (it's a cache).
    if (raw?.schemaVersion !== SCHEMA_VERSION || raw?.lang !== lang)
      return null;
    if (!Array.isArray(raw.matches) || typeof raw.fetchedAt !== "number")
      return null;
    return { fetchedAt: raw.fetchedAt, lang: raw.lang, matches: raw.matches };
  } catch {
    return null;
  }
}

export function writeScheduleCache(matches: Match[], lang: Lang): void {
  atomicWrite(
    SCHEDULE_CACHE_FILE,
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      fetchedAt: Date.now(),
      lang,
      matches,
    }),
  );
}

export function isScheduleFresh(cache: ScheduleCache): boolean {
  return Date.now() - cache.fetchedAt < SCHEDULE_TTL_MS;
}
