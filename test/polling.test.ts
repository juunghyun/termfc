import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Match,
  MatchState,
  TimelineEvent,
} from "../src/core/model.js";
import type { MatchDataProvider } from "../src/data/provider.js";
import { nextPollDelay, PollingEngine } from "../src/engine/polling.js";

describe("nextPollDelay (waiting cadence)", () => {
  it("uses 5m far out, 60s inside the last hour, 15s past kickoff", () => {
    expect(nextPollDelay(2 * 3600_000)).toBe(5 * 60_000);
    expect(nextPollDelay(60 * 60_000 + 1)).toBe(5 * 60_000);
    expect(nextPollDelay(60 * 60_000)).toBe(60_000);
    expect(nextPollDelay(1)).toBe(60_000);
    expect(nextPollDelay(0)).toBe(15_000);
    expect(nextPollDelay(-5 * 60_000)).toBe(15_000);
  });
});

function scheduledMatch(kickoffMs: number): Match {
  return {
    id: "97",
    stage: "Quarter-final",
    kickoff: new Date(kickoffMs).toISOString(),
    home: { code: "FRA", name: "France", flag: "🇫🇷" },
    away: { code: "MAR", name: "Morocco", flag: "🇲🇦" },
    score: { home: 0, away: 0 },
    phase: "SCHEDULED",
    sourceRefs: { fifa: { idMatch: "97" } as never },
  };
}

const liveState: MatchState = {
  score: { home: 1, away: 0 },
  phase: "FIRST_HALF",
  minute: 3,
};

interface MockOpts {
  liveIds?: () => Promise<Set<string>>;
  state?: () => Promise<MatchState | null>;
}

function mockProvider(opts: MockOpts = {}) {
  const calls = { liveIds: 0, state: 0, timeline: 0 };
  const p: MatchDataProvider = {
    name: "fifa",
    fetchSchedule: async () => [],
    fetchMatchState: async () => {
      calls.state++;
      return opts.state ? opts.state() : liveState;
    },
    fetchTimeline: async () => {
      calls.timeline++;
      return [] as TimelineEvent[];
    },
    fetchLiveMatchIds: async () => {
      calls.liveIds++;
      return opts.liveIds ? opts.liveIds() : new Set<string>();
    },
  };
  return { p, calls };
}

/** Let queued microtasks run (the engine's ticks are async). */
const flush = () => new Promise<void>((r) => setImmediate(r));

describe("PollingEngine waiting mode", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("probes only live-ids while waiting, never state/timeline", async () => {
    const kickoff = Date.now() + 2 * 3600_000;
    const { p, calls } = mockProvider();
    const engine = new PollingEngine(p, scheduledMatch(kickoff), "ko");
    engine.start();
    await flush();
    expect(calls.liveIds).toBe(1);
    expect(calls.state).toBe(0);
    expect(calls.timeline).toBe(0);

    await vi.advanceTimersByTimeAsync(5 * 60_000 + 2_000); // one 5m cadence step
    expect(calls.liveIds).toBe(2);
    expect(calls.state).toBe(0);
    engine.stop();
  });

  it("hands off to the live loop when the match appears in live ids", async () => {
    const kickoff = Date.now() + 30_000;
    let appeared = false;
    const { p, calls } = mockProvider({
      liveIds: async () => (appeared ? new Set(["97"]) : new Set()),
    });
    const engine = new PollingEngine(p, scheduledMatch(kickoff), "ko");
    const states: MatchState[] = [];
    engine.on("state", (s: MatchState) => states.push(s));
    engine.start();
    await flush();
    expect(calls.state).toBe(0);

    appeared = true;
    await vi.advanceTimersByTimeAsync(60_000 + 2_000); // next probe fires
    await flush();
    expect(calls.state).toBe(1); // normal tick ran immediately
    expect(calls.timeline).toBe(1);
    expect(states[0]?.phase).toBe("FIRST_HALF");
    engine.stop();
  });

  it("re-verifies via full state at most every 10 minutes past kickoff", async () => {
    const kickoff = Date.now() - 30 * 60_000; // kickoff long past, never live
    const { p, calls } = mockProvider({ state: async () => null });
    const engine = new PollingEngine(p, scheduledMatch(kickoff), "ko");
    engine.start();
    await flush();
    expect(calls.state).toBe(1); // first probe already past T0+10m -> reverify

    // 15s cadence: many probes, but no second reverify within 10 minutes.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(calls.state).toBe(1);
    await vi.advanceTimersByTimeAsync(6 * 60_000); // crosses the 10m gap
    expect(calls.state).toBe(2);
    engine.stop();
  });

  it("leaves waiting mode when re-verification reports a non-scheduled phase", async () => {
    const kickoff = Date.now() - 30 * 60_000;
    const finished: MatchState = {
      score: { home: 0, away: 3 },
      phase: "FINISHED",
      minute: 90,
    };
    const { p, calls } = mockProvider({ state: async () => finished });
    const engine = new PollingEngine(p, scheduledMatch(kickoff), "ko");
    const states: MatchState[] = [];
    engine.on("state", (s: MatchState) => states.push(s));
    engine.start();
    await flush();
    await flush();
    // reverify saw FINISHED -> normal tick ran -> state emitted + timeline hit
    expect(calls.timeline).toBe(1);
    expect(states[0]?.phase).toBe("FINISHED");
    engine.stop();
  });

  it("synthesizes the added-time event once through the events path", async () => {
    const kickoff = Date.now() - 3600_000;
    const withInjury: MatchState = { ...liveState, minute: 45, injury: 4 };
    const { p } = mockProvider({ state: async () => withInjury });
    const match = { ...scheduledMatch(kickoff), phase: "FIRST_HALF" as const };
    const engine = new PollingEngine(p, match, "ko");
    const batches: TimelineEvent[][] = [];
    engine.on("events", (es: TimelineEvent[]) => batches.push(es));
    engine.start();
    await flush();
    await vi.advanceTimersByTimeAsync(12_000); // second live tick
    const added = batches.flat().filter((e) => e.type === "ADDED_TIME");
    expect(added).toHaveLength(1); // once per phase, recorded via onEvents
    expect(added[0]!.injury).toBe(4);
    engine.stop();
  });

  it("never lets error backoff shorten the waiting cadence", async () => {
    const kickoff = Date.now() + 3 * 3600_000; // 5m cadence zone
    const { p, calls } = mockProvider({
      liveIds: async () => {
        throw new Error("down");
      },
    });
    const engine = new PollingEngine(p, scheduledMatch(kickoff), "ko");
    const nets: Array<{ down: boolean; retryInMs?: number }> = [];
    engine.on("net", (n: { down: boolean; retryInMs?: number }) =>
      nets.push(n),
    );
    engine.start();
    await flush();
    expect(nets[0]?.down).toBe(true);
    // backoff for streak 1 would be 10s — must be raised to the 5m cadence
    expect(nets[0]?.retryInMs).toBe(5 * 60_000);

    // No retry happens before the 5-minute mark.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.liveIds).toBe(1);
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 2_000);
    expect(calls.liveIds).toBe(2);
    engine.stop();
  });
});
