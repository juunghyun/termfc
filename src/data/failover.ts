import type {
  Lang,
  Match,
  MatchState,
  SourceName,
  TimelineEvent,
} from "../core/model.js";
import { SchemaError, type MatchDataProvider } from "./provider.js";

export interface FailoverOptions {
  /** Consecutive failures before switching sources. */
  threshold?: number;
  onSwitch?: (to: SourceName) => void;
}

/**
 * Decorator that fronts a primary + secondary provider.
 *
 * - N consecutive failures (default 3) OR a single schema-validation failure
 *   switches to the secondary.
 * - The switch is sticky for the session (no flip-flopping mid-match).
 */
export class FailoverProvider implements MatchDataProvider {
  private fails = 0;
  private active: MatchDataProvider;
  private readonly threshold: number;

  constructor(
    private readonly primary: MatchDataProvider,
    private readonly secondary: MatchDataProvider | null,
    private readonly opts: FailoverOptions = {},
  ) {
    this.active = primary;
    this.threshold = opts.threshold ?? 3;
  }

  get name(): SourceName {
    return this.active.name;
  }

  get activeSource(): SourceName {
    return this.active.name;
  }

  fetchSchedule(lang: Lang): Promise<Match[]> {
    return this.call((p) => p.fetchSchedule(lang));
  }

  fetchMatchState(match: Match, lang: Lang): Promise<MatchState | null> {
    return this.call((p) => p.fetchMatchState(match, lang));
  }

  fetchTimeline(match: Match, lang: Lang): Promise<TimelineEvent[]> {
    return this.call((p) => p.fetchTimeline(match, lang));
  }

  private async call<T>(fn: (p: MatchDataProvider) => Promise<T>): Promise<T> {
    try {
      const result = await fn(this.active);
      this.fails = 0;
      return result;
    } catch (err) {
      this.fails++;
      const schemaBroken = err instanceof SchemaError;
      const canSwitch =
        this.secondary !== null && this.active === this.primary;
      if (canSwitch && (schemaBroken || this.fails >= this.threshold)) {
        this.active = this.secondary!;
        this.fails = 0;
        this.opts.onSwitch?.(this.active.name);
        return fn(this.active);
      }
      throw err;
    }
  }
}

/**
 * Pre-link ESPN refs onto FIFA-sourced matches at schedule-fetch time
 * (decision doc: never match ids at failover time). Keyed by team-code pair,
 * with kickoff proximity as tie-breaker.
 */
export function linkSourceRefs(
  primaryMatches: Match[],
  espnMatches: Match[],
): void {
  const byPair = new Map<string, Match[]>();
  for (const em of espnMatches) {
    const key = [em.home.code, em.away.code].sort().join("|");
    const list = byPair.get(key) ?? [];
    list.push(em);
    byPair.set(key, list);
  }
  for (const m of primaryMatches) {
    if (m.sourceRefs.espn) continue;
    const key = [m.home.code, m.away.code].sort().join("|");
    const candidates = byPair.get(key);
    if (!candidates?.length) continue;
    const k = new Date(m.kickoff).getTime();
    const best = candidates.reduce((a, b) =>
      Math.abs(new Date(a.kickoff).getTime() - k) <=
      Math.abs(new Date(b.kickoff).getTime() - k)
        ? a
        : b,
    );
    if (Math.abs(new Date(best.kickoff).getTime() - k) <= 90 * 60_000) {
      m.sourceRefs.espn = best.sourceRefs.espn;
    }
  }
}
