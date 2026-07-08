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

describe("MatchScreen tone rendering (v0.4)", () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const goal: TimelineEvent = {
    id: "fifa:g1",
    type: "GOAL",
    minute: 45,
    teamSide: "home",
    player: "Kylian MBAPPE",
    source: "fifa",
    seq: 1,
  };

  it("captures the receive-time score on goal lines (ESPN goals lack scoreAfter)", () => {
    const { feed, screen } = makeScreen();
    feed.emit("state", state({ score: { home: 1, away: 0 } }));
    feed.emit("events", [goal]);
    const line = (screen as any).lines.find(
      (l: { kind: string }) => l.kind === "event",
    );
    expect(line.score).toEqual({ home: 1, away: 0 });
  });

  it("re-renders the same stored line in the toggled tone", () => {
    const { feed, screen } = makeScreen();
    feed.emit("state", state({ score: { home: 1, away: 0 } }));
    feed.emit("events", [goal]);
    const line = (screen as any).lines.find(
      (l: { kind: string }) => l.kind === "event",
    );
    const official = (screen as any).renderLine(line, 100) as string;
    expect(official).toContain("Kylian Mbappe");
    expect(official).toContain("프랑스가 앞서갑니다 1:0");

    (screen as any).tone = "community";
    const community = (screen as any).renderLine(line, 100) as string;
    expect(community).toContain("음바페");
    expect(community).not.toContain("Mbappe");

    (screen as any).tone = "brief";
    const brief = (screen as any).renderLine(line, 100) as string;
    expect(brief).toContain("음바페 (1:0)");
  });

  it("keeps cancelled-goal notices structured and tone-rendered", () => {
    const { feed, screen } = makeScreen();
    feed.emit("state", state({}));
    feed.emit("cancelled", goal);
    const line = (screen as any).lines.find(
      (l: { kind: string }) => l.kind === "cancelled",
    );
    expect(line).toBeDefined();
    const rendered = (screen as any).renderLine(line, 120) as string;
    expect(rendered).toContain("골 취소");
  });
});
