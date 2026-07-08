import {
  compareEvents,
  type EventType,
  type MatchPhase,
  type MatchState,
  type SourceName,
  type TimelineEvent,
} from "./model.js";

/**
 * Events that never fold away (requirements: 골·경고/퇴장·교체·VAR·PK·부상
 * 중단·추가시간). Deliberately a separate set from salience (HIGH salience
 * styles key moments; this set decides *retention* — different criteria).
 */
export const FOLD_SURVIVORS: ReadonlySet<EventType> = new Set([
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
  "PENALTY_MISS",
  "YELLOW",
  "RED",
  "SUBSTITUTION",
  "VAR",
  "BREAK",
  "RESUMED",
  "ADDED_TIME",
]);

/** Routine events older than this (match minutes) fold away. */
export const FOLD_AFTER_MINUTES = 15;

/**
 * Render-time view transform: routine events whose match minute is more
 * than FOLD_AFTER_MINUTES behind `nowMinute` are dropped from view (the
 * backing store is never mutated). Non-event lines (separators, boundary
 * blocks, notices) always survive — `eventOf` returns null for those.
 */
export function foldTimeline<T>(
  lines: readonly T[],
  nowMinute: number,
  eventOf: (line: T) => TimelineEvent | null,
): { visible: T[]; foldedCount: number } {
  const horizon = nowMinute - FOLD_AFTER_MINUTES;
  const visible: T[] = [];
  let foldedCount = 0;
  for (const line of lines) {
    const e = eventOf(line);
    if (e && !FOLD_SURVIVORS.has(e.type) && e.minute < horizon) {
      foldedCount++;
      continue;
    }
    visible.push(line);
  }
  return { visible, foldedCount };
}

/** FIFA period number for a running phase (replay sorts by period first). */
function fifaPeriodOf(phase: MatchPhase): number | undefined {
  switch (phase) {
    case "FIRST_HALF":
      return 3;
    case "HALFTIME":
      return 4;
    case "SECOND_HALF":
      return 5;
    case "ET_FIRST":
      return 7;
    case "ET_SECOND":
      return 9;
    case "PENALTIES":
      return 11;
    default:
      return undefined;
  }
}

/** Phases whose arrival marks a period boundary (score block inserted). */
export const BOUNDARY_PHASES: ReadonlySet<MatchPhase> = new Set([
  "HALFTIME",
  "ET_BREAK",
  "FINISHED",
]);

/**
 * Event-side boundary trigger. Only the unambiguous cases map — the end of
 * period 5 could mean extra time OR full time, so that one is left to the
 * phase-transition trigger (which is also what covers ESPN, whose
 * PERIOD_END events are unreliable).
 */
export function boundaryPhaseOf(e: TimelineEvent): MatchPhase | null {
  if (e.type === "FULLTIME") return "FINISHED";
  if (e.type === "PERIOD_END" && e.period === 3) return "HALFTIME";
  return null;
}

/** What the pinned highlight strip shows: goals and cards. */
export const HIGHLIGHT_TYPES: ReadonlySet<EventType> = new Set([
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
  "RED",
  "YELLOW",
]);

/**
 * Chronological key events for the header strip. VAR-disallowed goals are
 * removed via `cancelledIds` (the differ emits the original event back).
 */
export function deriveHighlights(
  events: readonly TimelineEvent[],
  cancelledIds: ReadonlySet<string>,
): TimelineEvent[] {
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];
  for (const e of events) {
    if (!HIGHLIGHT_TYPES.has(e.type)) continue;
    if (cancelledIds.has(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort(compareEvents);
}

/**
 * Neither source has an "added time announced" timeline event — but both
 * report it via MatchState.injury. Synthesize one locally (source-neutral,
 * recorded to replay JSONL like any other event) the first time injury
 * shows up in a phase. Local `id` prefix keeps it clear of differ ids.
 */
export function synthesizeAddedTime(
  prev: MatchState | null,
  next: MatchState,
  opts: { source: SourceName },
): TimelineEvent | null {
  if (!next.injury || next.injury <= 0) return null;
  const samePhaseAlreadyAnnounced =
    prev !== null && prev.phase === next.phase && !!prev.injury;
  if (samePhaseAlreadyAnnounced) return null;
  return {
    id: `local:added-time-${next.phase}`,
    type: "ADDED_TIME",
    minute: next.minute,
    // the announced amount rides the injury field — sentences are rendered
    // from it at view time (and recordings keep the structured fact)
    injury: next.injury,
    period: fifaPeriodOf(next.phase),
    source: opts.source,
    seq: 0,
  };
}
