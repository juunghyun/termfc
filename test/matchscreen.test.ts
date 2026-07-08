import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Match, MatchState, TimelineEvent } from "../src/core/model.js";
import { MatchScreen } from "../src/ui/matchScreen.js";

const match: Match = {
  id: "1",
  stage: "Quarter-final",
  kickoff: "2026-07-09T20:00:00Z",
  home: { code: "FRA", name: "프랑스", flag: "🇫🇷" },
  away: { code: "MAR", name: "모로코", flag: "🇲🇦" },
  score: { home: 0, away: 0 },
  phase: "FIRST_HALF",
  sourceRefs: {},
};

const state = (over: Partial<MatchState>): MatchState => ({
  score: { home: 1, away: 0 },
  phase: "FIRST_HALF",
  minute: 45,
  ...over,
});

const periodEnd: TimelineEvent = {
  id: "fifa:pe",
  type: "PERIOD_END",
  minute: 45,
  period: 3,
  source: "fifa",
  seq: 0,
};

function makeScreen() {
  const feed = Object.assign(new EventEmitter(), {
    start: () => {},
    stop: () => {},
  });
  const screen = new MatchScreen(match, feed, {
    lang: "ko",
    mode: "live",
    animations: false,
    lambdas: null,
  });
  (screen as any).subscribe();
  const boundaries = () =>
    (screen as any).lines.filter(
      (l: { kind: string }) => l.kind === "boundary",
    );
  return { feed, screen, boundaries };
}

describe("MatchScreen period-boundary blocks (readability c)", () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes the event + phase-transition double trigger", () => {
    const { feed, boundaries } = makeScreen();
    feed.emit("state", state({}));
    feed.emit("events", [periodEnd]); // FIFA-style: explicit whistle event
    feed.emit("state", state({ phase: "HALFTIME" })); // then the phase flips
    expect(boundaries()).toHaveLength(1);
    expect(boundaries()[0].phase).toBe("HALFTIME");
    expect(boundaries()[0].score).toEqual({ home: 1, away: 0 });
  });

  it("marks the boundary from phase transition alone (ESPN-style)", () => {
    const { feed, boundaries } = makeScreen();
    feed.emit("state", state({}));
    feed.emit("state", state({ phase: "HALFTIME" }));
    feed.emit("state", state({ phase: "SECOND_HALF", minute: 46 }));
    feed.emit("state", state({ phase: "FINISHED", minute: 90, score: { home: 2, away: 1 } }));
    const marks = boundaries();
    expect(marks.map((b: { phase: string }) => b.phase)).toEqual([
      "HALFTIME",
      "FINISHED",
    ]);
    expect(marks[1].score).toEqual({ home: 2, away: 1 });
  });
});
