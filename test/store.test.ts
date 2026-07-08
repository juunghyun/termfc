import { describe, expect, it } from "vitest";
import type { Match } from "../src/core/model.js";
import {
  isScheduleFresh,
  parseScheduleCache,
  shouldReplaceCache,
  type ScheduleCache,
} from "../src/store/store.js";

function mkMatch(over: Partial<Match>): Match {
  return {
    id: "1",
    stage: "First Stage",
    kickoff: "2026-06-11T19:00:00Z",
    home: { code: "MEX", name: "Mexico", flag: "🇲🇽" },
    away: { code: "RSA", name: "South Africa", flag: "🇿🇦" },
    score: { home: 0, away: 0 },
    phase: "SCHEDULED",
    sourceRefs: {},
    ...over,
  };
}

function mkCache(matches: Match[], fetchedAt: number): ScheduleCache {
  return { fetchedAt, lang: "ko", source: "fifa", coverage: "full", matches };
}

describe("parseScheduleCache (v2 validation)", () => {
  const valid = {
    schemaVersion: 2,
    fetchedAt: 1000,
    lang: "ko",
    source: "fifa",
    coverage: "full",
    matches: [],
  };

  it("accepts a valid v2 payload", () => {
    expect(parseScheduleCache(valid, "ko")).not.toBeNull();
  });

  it("discards v1 caches (schema bump = auto invalidation)", () => {
    expect(
      parseScheduleCache({ ...valid, schemaVersion: 1 }, "ko"),
    ).toBeNull();
  });

  it("discards language mismatches and missing coverage", () => {
    expect(parseScheduleCache(valid, "en")).toBeNull();
    expect(
      parseScheduleCache({ ...valid, coverage: undefined }, "ko"),
    ).toBeNull();
  });
});

describe("shouldReplaceCache (window must not clobber full)", () => {
  it("blocks a window snapshot over a full one", () => {
    expect(shouldReplaceCache("full", "window")).toBe(false);
  });

  it("allows every other combination", () => {
    expect(shouldReplaceCache("full", "full")).toBe(true);
    expect(shouldReplaceCache("window", "full")).toBe(true);
    expect(shouldReplaceCache("window", "window")).toBe(true);
    expect(shouldReplaceCache(null, "window")).toBe(true);
  });
});

describe("isScheduleFresh (TTL + content-based)", () => {
  const now = new Date("2026-06-11T18:00:00Z").getTime();

  it("respects the 30-minute TTL", () => {
    const cache = mkCache([mkMatch({ kickoff: "2026-06-20T19:00:00Z" })], now);
    expect(isScheduleFresh(cache, now + 60_000)).toBe(true);
    expect(isScheduleFresh(cache, now + 31 * 60_000)).toBe(false);
  });

  it("is stale whenever a cached match is live", () => {
    const cache = mkCache(
      [mkMatch({ phase: "SECOND_HALF", kickoff: "2026-06-11T17:00:00Z" })],
      now,
    );
    expect(isScheduleFresh(cache, now)).toBe(false);
  });

  it("is stale inside a kickoff window of a not-yet-finished match", () => {
    const kickoff = "2026-06-11T18:03:00Z"; // 3 minutes from `now`
    const cache = mkCache([mkMatch({ kickoff })], now);
    expect(isScheduleFresh(cache, now)).toBe(false); // T-3m, inside T-5m
    // 3.5h after kickoff still inside the hot window
    const during = new Date(kickoff).getTime() + 3 * 3600_000;
    expect(isScheduleFresh(mkCache([mkMatch({ kickoff })], during), during)).toBe(
      false,
    );
  });

  it("stays fresh when the windowed match is already finished", () => {
    const cache = mkCache(
      [mkMatch({ phase: "FINISHED", kickoff: "2026-06-11T15:30:00Z" })],
      now,
    );
    expect(isScheduleFresh(cache, now)).toBe(true);
  });

  it("stays fresh when all matches are far from kickoff", () => {
    const cache = mkCache(
      [
        mkMatch({ kickoff: "2026-06-12T19:00:00Z" }),
        mkMatch({ id: "2", phase: "FINISHED", kickoff: "2026-06-10T19:00:00Z" }),
      ],
      now,
    );
    expect(isScheduleFresh(cache, now)).toBe(true);
  });
});
