import {
  compareEvents,
  salienceOf,
  type SourceName,
  type TimelineEvent,
} from "./model.js";

export interface ReconcileResult {
  /** New events to append to the log, sorted. */
  fresh: TimelineEvent[];
  /** Previously-emitted goal-like events that vanished from the snapshot (VAR). */
  cancelled: TimelineEvent[];
  /** True when this reconcile crossed a source switch. */
  sourceSwitched: boolean;
}

/**
 * Snapshot-reconciling event differ.
 *
 * - Same-source dedup: native event id seen-set.
 * - Never assumes append-only: a previously seen high-salience event missing
 *   from the latest snapshot is reported as cancelled (VAR goal disallowed).
 * - Cross-source switch: seen-set resets, high-salience events are suppressed
 *   via semantic keys (type, period, minute±1, team) so a goal is never
 *   celebrated twice; low-salience history is cut off at the last emitted
 *   match clock instead of being re-merged.
 */
export class EventDiffer {
  private seen = new Set<string>();
  private emittedHigh: TimelineEvent[] = [];
  private currentSource: SourceName | null = null;
  private lastEmittedMinute = 0;

  reconcile(snapshot: TimelineEvent[]): ReconcileResult {
    const source = snapshot[0]?.source ?? this.currentSource;
    const sourceSwitched =
      this.currentSource !== null &&
      source !== null &&
      source !== this.currentSource;

    if (sourceSwitched) {
      this.seen = new Set();
    }

    const snapshotIds = new Set(snapshot.map((e) => e.id));
    const cancelled: TimelineEvent[] = [];
    if (!sourceSwitched) {
      for (const prev of this.emittedHigh) {
        if (
          prev.source === source &&
          this.isCancellable(prev) &&
          !snapshotIds.has(prev.id)
        ) {
          cancelled.push(prev);
        }
      }
      if (cancelled.length > 0) {
        const gone = new Set(cancelled.map((e) => e.id));
        this.emittedHigh = this.emittedHigh.filter((e) => !gone.has(e.id));
      }
    }

    let fresh: TimelineEvent[] = [];
    for (const e of snapshot) {
      if (this.seen.has(e.id)) continue;
      this.seen.add(e.id);
      if (sourceSwitched) {
        if (salienceOf(e.type) === "high") {
          if (this.matchesEmittedHigh(e)) continue;
        } else if (e.minute < this.lastEmittedMinute) {
          continue;
        }
      }
      fresh.push(e);
    }

    fresh = fresh.sort(compareEvents);
    for (const e of fresh) {
      if (salienceOf(e.type) === "high") this.emittedHigh.push(e);
      if (e.minute > this.lastEmittedMinute) this.lastEmittedMinute = e.minute;
    }
    if (source) this.currentSource = source;

    return { fresh, cancelled, sourceSwitched };
  }

  private isCancellable(e: TimelineEvent): boolean {
    return (
      e.type === "GOAL" || e.type === "OWN_GOAL" || e.type === "PENALTY_GOAL"
    );
  }

  private matchesEmittedHigh(e: TimelineEvent): boolean {
    return this.emittedHigh.some(
      (p) =>
        p.type === e.type &&
        (p.period === undefined ||
          e.period === undefined ||
          p.period === e.period) &&
        Math.abs(p.minute - e.minute) <= 1 &&
        (p.teamCode === undefined ||
          e.teamCode === undefined ||
          p.teamCode === e.teamCode),
    );
  }
}
