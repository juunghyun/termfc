import { isClockRunning, regulationCap, type MatchPhase } from "./model.js";

export interface ClockDisplay {
  /** Total elapsed seconds of the current display value. */
  totalSeconds: number;
  minute: number;
  second: number;
  /** Present when past the regulation cap of the phase (stoppage time). */
  injuryMinute?: number;
  injurySecond?: number;
  running: boolean;
}

/**
 * Interpolates a per-second match clock from minute-granularity source data.
 *
 * Sources report the clock as whole minutes (FIFA) or seconds (ESPN). Between
 * polls we advance the display using the local monotonic clock; when a fresh
 * source value arrives we never move backwards — we only jump forward if the
 * source is ahead. The clock freezes during half-time, breaks, penalties and
 * after full-time.
 */
export class ClockInterpolator {
  private baseSeconds = 0;
  private anchor = 0;
  private phase: MatchPhase = "SCHEDULED";
  private sourceMinute = 0;
  private sourceInjury: number | undefined;

  /** `rate` > 1 makes the clock run faster than wall time (replay mode). */
  constructor(
    private readonly nowMs: () => number = () => performance.now(),
    private readonly rate = 1,
  ) {
    this.anchor = this.nowMs();
  }

  get currentPhase(): MatchPhase {
    return this.phase;
  }

  update(opts: {
    minute: number;
    second?: number;
    injury?: number;
    phase: MatchPhase;
  }): void {
    const now = this.nowMs();
    const running = isClockRunning(opts.phase);
    const cap = regulationCap(opts.phase);
    const effectiveMinute =
      opts.injury !== undefined && cap !== undefined
        ? cap + opts.injury
        : opts.minute;
    let sourceSeconds =
      opts.second !== undefined
        ? opts.minute * 60 + opts.second
        : effectiveMinute * 60;
    // FIFA reports "67'" meaning we are inside the 67th minute; treat the
    // reported minute as a floor, not a target reached in the future.
    const current = this.peekSeconds(now);
    const phaseChanged = opts.phase !== this.phase;
    if (phaseChanged) {
      if (opts.phase === "FINISHED" || opts.phase === "ABANDONED") {
        // Freeze at the final clock; a source reporting minute 0 at FT must
        // never rewind the display.
        this.baseSeconds = Math.max(current, sourceSeconds);
      } else {
        // Re-anchor on phase transitions (e.g. HT snaps to 45:00, 2H starts
        // at 45:00, penalties pin at 120:00).
        this.baseSeconds = Math.max(sourceSeconds, phaseStartSeconds(opts.phase));
      }
      this.anchor = now;
    } else if (sourceSeconds > current) {
      this.baseSeconds = sourceSeconds;
      this.anchor = now;
    } else if (!running) {
      this.baseSeconds = this.peekSeconds(now);
      this.anchor = now;
    }
    this.phase = opts.phase;
    this.sourceMinute = opts.minute;
    this.sourceInjury = opts.injury;
  }

  display(): ClockDisplay {
    const now = this.nowMs();
    const total = Math.floor(this.peekSeconds(now));
    const running = isClockRunning(this.phase);
    const cap = regulationCap(this.phase);
    if (
      cap !== undefined &&
      total >= cap * 60 &&
      (this.sourceInjury !== undefined || total > cap * 60)
    ) {
      const over = total - cap * 60;
      return {
        totalSeconds: total,
        minute: cap,
        second: 0,
        injuryMinute: Math.floor(over / 60),
        injurySecond: over % 60,
        running,
      };
    }
    return {
      totalSeconds: total,
      minute: Math.floor(total / 60),
      second: total % 60,
      running,
    };
  }

  private peekSeconds(now: number): number {
    if (!isClockRunning(this.phase)) return this.baseSeconds;
    return this.baseSeconds + ((now - this.anchor) / 1000) * this.rate;
  }
}

function phaseStartSeconds(phase: MatchPhase): number {
  switch (phase) {
    case "HALFTIME":
    case "SECOND_HALF":
      return 45 * 60;
    case "ET_BREAK":
    case "ET_FIRST":
      return 90 * 60;
    case "ET_SECOND":
      return 105 * 60;
    case "PENALTIES":
      return 120 * 60;
    default:
      return 0;
  }
}

export function formatClock(d: ClockDisplay): string {
  const mm = String(d.minute).padStart(2, "0");
  const ss = String(d.second).padStart(2, "0");
  if (d.injuryMinute !== undefined) {
    const im = d.injuryMinute;
    const is = String(d.injurySecond ?? 0).padStart(2, "0");
    return `${mm}:${ss} +${im}:${is}`;
  }
  return `${mm}:${ss}`;
}
