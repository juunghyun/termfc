import type {
  Lang,
  Match,
  MatchState,
  SourceName,
  TimelineEvent,
} from "../core/model.js";

/** Thrown when a source responds but the payload shape is unusable. */
export class SchemaError extends Error {
  constructor(
    readonly source: SourceName,
    message: string,
  ) {
    super(`[${source}] ${message}`);
    this.name = "SchemaError";
  }
}

/**
 * The port every data source implements. The rest of the app only ever sees
 * the normalized internal model — source schema differences stop here.
 */
export interface MatchDataProvider {
  readonly name: SourceName;
  /**
   * Every match the source knows, normalized. FIFA covers the whole
   * tournament; ESPN only a near window (documented degradation).
   */
  fetchSchedule(lang: Lang): Promise<Match[]>;
  /** Current live score/clock/phase for a match; null if unavailable. */
  fetchMatchState(match: Match, lang: Lang): Promise<MatchState | null>;
  /** Full commentary timeline snapshot for a match. */
  fetchTimeline(match: Match, lang: Lang): Promise<TimelineEvent[]>;
  /**
   * Cheap kickoff probe: native ids of matches currently in progress.
   * Waiting mode polls only this — never the calendar (decision doc).
   */
  fetchLiveMatchIds(lang: Lang): Promise<Set<string>>;
}

export const POLITE_HEADERS = {
  "user-agent": "termfc (+https://github.com/juunghyun/termfc)",
  accept: "application/json",
};

export async function getJson(url: string, timeoutMs = 12_000): Promise<any> {
  const res = await fetch(url, {
    headers: POLITE_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}
