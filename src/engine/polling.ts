import { EventEmitter } from "node:events";
import { EventDiffer } from "../core/diff.js";
import { synthesizeAddedTime } from "../core/digest.js";
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
 * Kickoff-probe cadence while a SCHEDULED match is waited on:
 * far out 5 min → last hour 60 s → past kickoff 15 s (decision doc).
 */
export function nextPollDelay(msToKickoff: number): number {
  if (msToKickoff > 60 * 60_000) return 5 * 60_000;
  if (msToKickoff > 0) return 60_000;
  return 15_000;
}

/** How long past kickoff before we start bounded full-state re-checks. */
const REVERIFY_AFTER_MS = 10 * 60_000;
/** Minimum gap between those re-checks (the calendar fallback is pricey). */
const REVERIFY_EVERY_MS = 10 * 60_000;

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
  private waiting: boolean;
  private lastReverifyAt = 0;
  private prevState: MatchState | null = null;

  constructor(
    private readonly provider: MatchDataProvider,
    private readonly match: Match,
    private readonly lang: Lang,
    opts: PollingOptions = {},
  ) {
    super();
    this.intervalMs = opts.intervalMs ?? 10_000;
    this.jitterMs = opts.jitterMs ?? 2_000;
    this.waiting = match.phase === "SCHEDULED";
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

  /**
   * Waiting mode: probe the cheap live-ids endpoint only — never state or
   * timeline (their SCHEDULED fallback hits the calendar every tick). The
   * match appearing in the live list IS the kickoff signal; long past
   * kickoff with no appearance, do a bounded full re-check to catch
   * postponements/abandonment.
   */
  private async waitTick(): Promise<void> {
    try {
      const ids = await this.provider.fetchLiveMatchIds(this.lang);
      if (this.errorStreak > 0) {
        this.emit("net", { down: false, lastOkAt: Date.now() } as NetInfo);
      }
      this.errorStreak = 0;
      this.lastOkAt = Date.now();

      if (this.isOurs(ids)) {
        this.waiting = false;
        void this.tick(); // hand off to the normal live loop right away
        return;
      }

      const msToKickoff =
        new Date(this.match.kickoff).getTime() - Date.now();
      if (
        msToKickoff < -REVERIFY_AFTER_MS &&
        Date.now() - this.lastReverifyAt >= REVERIFY_EVERY_MS
      ) {
        this.lastReverifyAt = Date.now();
        const state = await this.provider.fetchMatchState(
          this.match,
          this.lang,
        );
        if (state && state.phase !== "SCHEDULED") {
          // Kicked off unnoticed, finished, or abandoned — the normal tick
          // handles every one of those.
          this.waiting = false;
          void this.tick();
          return;
        }
      }
      this.schedule(nextPollDelay(msToKickoff) + Math.random() * this.jitterMs);
    } catch {
      this.errorStreak++;
      const backoff = Math.min(
        this.intervalMs * 2 ** Math.min(this.errorStreak - 1, 3),
        60_000,
      );
      // While waiting, the probe cadence is already slow — never let the
      // error backoff *shorten* it.
      const msToKickoff =
        new Date(this.match.kickoff).getTime() - Date.now();
      const delay = Math.max(nextPollDelay(msToKickoff), backoff);
      this.emit("net", {
        down: true,
        retryInMs: delay,
        lastOkAt: this.lastOkAt,
      } as NetInfo);
      this.schedule(delay + Math.random() * this.jitterMs);
    }
  }

  /** The probe returns active-source native ids; match against every ref. */
  private isOurs(ids: Set<string>): boolean {
    const fifaId = this.match.sourceRefs.fifa?.idMatch;
    const espnId = this.match.sourceRefs.espn?.eventId;
    return (
      ids.has(this.match.id) ||
      (fifaId !== undefined && ids.has(fifaId)) ||
      (espnId !== undefined && ids.has(espnId))
    );
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    if (this.waiting) return this.waitTick();
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
        // Neither source emits an added-time timeline event — synthesize it
        // from the injury field, once per phase (bypasses the differ: local
        // events are never subject to source-switch cancellation).
        const addedTime = synthesizeAddedTime(this.prevState, state, {
          lang: this.lang,
          source: this.provider.name,
        });
        this.prevState = state;
        this.emit("state", state);
        if (addedTime) this.emit("events", [addedTime]);
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
