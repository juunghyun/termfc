import { describe, expect, it, vi } from "vitest";
import type {
  Lang,
  Match,
  MatchState,
  TimelineEvent,
} from "../src/core/model.js";
import { FailoverProvider, linkSourceRefs } from "../src/data/failover.js";
import { SchemaError, type MatchDataProvider } from "../src/data/provider.js";

function provider(
  name: "fifa" | "espn",
  impl: () => Promise<Match[]>,
  overrides: Partial<
    Pick<
      MatchDataProvider,
      "fetchMatchState" | "fetchTimeline" | "fetchLiveMatchIds"
    >
  > = {},
): MatchDataProvider {
  return {
    name,
    fetchSchedule: impl,
    fetchMatchState: async () => null as MatchState | null,
    fetchTimeline: async () => [] as TimelineEvent[],
    fetchLiveMatchIds: async () => new Set<string>(),
    ...overrides,
  };
}

const timelineEvent = (id: string, source: "fifa" | "espn"): TimelineEvent => ({
  id: `${source}:${id}`,
  type: "SHOT",
  minute: 1,
  source,
  seq: 0,
});

const m = (over: Partial<Match>): Match => ({
  id: "1",
  stage: "",
  kickoff: "2026-07-09T16:00:00Z",
  home: { code: "ARG", name: "Argentina", flag: "🇦🇷" },
  away: { code: "EGY", name: "Egypt", flag: "🇪🇬" },
  score: { home: 0, away: 0 },
  phase: "SCHEDULED",
  sourceRefs: {},
  ...over,
});

describe("FailoverProvider", () => {
  it("switches after 3 consecutive failures and stays switched", async () => {
    const onSwitch = vi.fn();
    let fifaCalls = 0;
    const fifa = provider("fifa", async () => {
      fifaCalls++;
      throw new Error("down");
    });
    const espn = provider("espn", async () => [m({})]);
    const f = new FailoverProvider(fifa, espn, { onSwitch });

    await expect(f.fetchSchedule("ko" as Lang)).rejects.toThrow();
    await expect(f.fetchSchedule("ko" as Lang)).rejects.toThrow();
    const result = await f.fetchSchedule("ko" as Lang); // 3rd failure -> switch + retry on espn
    expect(result).toHaveLength(1);
    expect(onSwitch).toHaveBeenCalledWith("espn");
    expect(f.activeSource).toBe("espn");

    await f.fetchSchedule("ko" as Lang);
    expect(fifaCalls).toBe(3); // sticky — fifa never called again
  });

  it("fails over mid-broadcast: timeline schema break switches to espn events", async () => {
    const fifa = provider("fifa", async () => [], {
      fetchTimeline: async () => {
        throw new SchemaError("fifa", "timeline shape drifted");
      },
    });
    const espn = provider("espn", async () => [], {
      fetchTimeline: async () => [timelineEvent("1", "espn")],
    });
    const f = new FailoverProvider(fifa, espn);
    const events = await f.fetchTimeline(m({}), "ko" as Lang);
    expect(events.map((e) => e.id)).toEqual(["espn:1"]);
    expect(f.activeSource).toBe("espn");
  });

  it("fails over match-state polling after repeated network errors", async () => {
    const fifa = provider("fifa", async () => [], {
      fetchMatchState: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const state: MatchState = {
      score: { home: 1, away: 0 },
      phase: "SECOND_HALF",
      minute: 60,
    };
    const espn = provider("espn", async () => [], {
      fetchMatchState: async () => state,
    });
    const f = new FailoverProvider(fifa, espn);
    await expect(f.fetchMatchState(m({}), "ko" as Lang)).rejects.toThrow();
    await expect(f.fetchMatchState(m({}), "ko" as Lang)).rejects.toThrow();
    expect(await f.fetchMatchState(m({}), "ko" as Lang)).toEqual(state);
    expect(f.activeSource).toBe("espn");
  });

  it("delegates the live-ids probe through the same failover path", async () => {
    const fifa = provider("fifa", async () => [], {
      fetchLiveMatchIds: async () => {
        throw new SchemaError("fifa", "live/now shape drifted");
      },
    });
    const espn = provider("espn", async () => [], {
      fetchLiveMatchIds: async () => new Set(["42"]),
    });
    const f = new FailoverProvider(fifa, espn);
    expect(await f.fetchLiveMatchIds("ko" as Lang)).toEqual(new Set(["42"]));
    expect(f.activeSource).toBe("espn");
  });

  it("switches immediately on schema errors", async () => {
    const fifa = provider("fifa", async () => {
      throw new SchemaError("fifa", "shape drifted");
    });
    const espn = provider("espn", async () => [m({})]);
    const f = new FailoverProvider(fifa, espn);
    expect(await f.fetchSchedule("ko" as Lang)).toHaveLength(1);
    expect(f.activeSource).toBe("espn");
  });
});

describe("linkSourceRefs", () => {
  it("pre-links espn refs by team pair + kickoff proximity", () => {
    const primary = [m({ id: "fifa-1", sourceRefs: { fifa: {} as never } })];
    const espn = [
      m({
        id: "espn-9",
        kickoff: "2026-07-09T16:05:00Z",
        sourceRefs: { espn: { eventId: "9" } },
      }),
    ];
    linkSourceRefs(primary, espn);
    expect(primary[0]!.sourceRefs.espn?.eventId).toBe("9");
  });

  it("refuses matches with same teams but distant kickoff", () => {
    const primary = [m({ sourceRefs: {} })];
    const espn = [
      m({
        kickoff: "2026-07-11T16:00:00Z",
        sourceRefs: { espn: { eventId: "9" } },
      }),
    ];
    linkSourceRefs(primary, espn);
    expect(primary[0]!.sourceRefs.espn).toBeUndefined();
  });
});
