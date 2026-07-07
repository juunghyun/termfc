import { EventEmitter } from "node:events";
import { EventDiffer } from "../core/diff.js";
import {
  CELEBRATION_TYPES,
  type Lang,
  type Match,
  type MatchState,
  type TimelineEvent,
} from "../core/model.js";
import type { MatchDataProvider } from "../data/provider.js";

export interface NetInfo {
  down: boolean;
  retryInMs?: number;
  lastOkAt?: number;
}

export interface PollingOptions {
  /** Base polling interval for a live match. */
  intervalMs?: number;
  /** Extra random jitter added to every wait. */
  jitterMs?: number;
}

/**
 * Polls a provider for one match and emits typed events:
 *
 *  - "state"      (MatchState)          score / phase / clock snapshot
 *  - "events"     (TimelineEvent[])     fresh commentary lines, sorted
 *  - "goal"       (TimelineEvent)       celebration-worthy event
 *  - "cancelled"  (TimelineEvent)       VAR-disallowed goal correction
 *  - "sourceSwitched" ()                differ crossed a source switch
 *  - "net"        (NetInfo)             connectivity up/down + retry hint
 *  - "finished"   ()                    match ended (engine stops itself)
 */
export class PollingEngine extends EventEmitter {
  private readonly differ = new EventDiffer();
  private readonly intervalMs: number;
  private readonly jitterMs: number;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private errorStreak = 0;
  private lastOkAt: number | undefined;
  private finishedPolls = 0;

  constructor(
    private readonly provider: MatchDataProvider,
    private readonly match: Match,
    private readonly lang: Lang,
    opts: PollingOptions = {},
  ) {
    super();
    this.intervalMs = opts.intervalMs ?? 10_000;
    this.jitterMs = opts.jitterMs ?? 2_000;
  }

  start(): void {
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const [state, timeline] = await Promise.all([
        this.provider.fetchMatchState(this.match, this.lang),
        this.provider.fetchTimeline(this.match, this.lang),
      ]);
      if (this.errorStreak > 0) {
        this.emit("net", { down: false, lastOkAt: Date.now() } as NetInfo);
      }
      this.errorStreak = 0;
      this.lastOkAt = Date.now();

      if (state) {
        this.match.score = state.score;
        this.match.phase = state.phase;
        this.emit("state", state);
      }

      const { fresh, cancelled, sourceSwitched } =
        this.differ.reconcile(timeline);
      if (sourceSwitched) this.emit("sourceSwitched");
      if (fresh.length > 0) {
        this.emit("events", fresh);
        for (const e of fresh) {
          if (CELEBRATION_TYPES.has(e.type)) this.emit("goal", e);
        }
      }
      for (const c of cancelled) this.emit("cancelled", c);

      if (state?.phase === "FINISHED" || state?.phase === "ABANDONED") {
        // A couple of grace polls to catch trailing timeline entries.
        if (++this.finishedPolls >= 2) {
          this.emit("finished");
          this.stop();
          return;
        }
      }
      this.schedule(this.intervalMs + Math.random() * this.jitterMs);
    } catch {
      this.errorStreak++;
      const backoff = Math.min(
        this.intervalMs * 2 ** Math.min(this.errorStreak - 1, 3),
        60_000,
      );
      this.emit("net", {
        down: true,
        retryInMs: backoff,
        lastOkAt: this.lastOkAt,
      } as NetInfo);
      this.schedule(backoff + Math.random() * this.jitterMs);
    }
  }
}

export interface MatchFeed extends EventEmitter {
  start(): void;
  stop(): void;
}

export type { MatchState, TimelineEvent };
