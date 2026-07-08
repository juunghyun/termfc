import { describe, expect, it } from "vitest";
import {
  boundaryPhaseOf,
  deriveHighlights,
  FOLD_SURVIVORS,
  foldTimeline,
  synthesizeAddedTime,
} from "../src/core/digest.js";
import type {
  EventType,
  MatchState,
  TimelineEvent,
} from "../src/core/model.js";

const st = (over: Partial<MatchState>): MatchState => ({
  score: { home: 0, away: 0 },
  phase: "FIRST_HALF",
  minute: 45,
  ...over,
});

let seq = 0;
const ev = (
  type: EventType,
  minute: number,
  over: Partial<TimelineEvent> = {},
): TimelineEvent => ({
  id: `fifa:${++seq}`,
  type,
  minute,
  source: "fifa",
  seq,
  ...over,
});

type Line =
  | { kind: "event"; e: TimelineEvent }
  | { kind: "sep" }
  | { kind: "boundary" };
const eLine = (e: TimelineEvent): Line => ({ kind: "event", e });
const eventOf = (l: Line) => (l.kind === "event" ? l.e : null);

describe("synthesizeAddedTime", () => {
  it("emits once when injury first appears in a phase", () => {
    const e = synthesizeAddedTime(st({}), st({ injury: 4 }), {
      lang: "ko",
      source: "fifa",
    });
    expect(e).not.toBeNull();
    expect(e!.type).toBe("ADDED_TIME");
    expect(e!.id).toBe("local:added-time-FIRST_HALF");
    expect(e!.text).toBe("추가시간 +4분");
    expect(e!.period).toBe(3); // sorts correctly in replay files
  });

  it("emits on the very first state when injury is already set", () => {
    const e = synthesizeAddedTime(null, st({ injury: 3 }), {
      lang: "en",
      source: "espn",
    });
    expect(e!.text).toBe("+3 minutes added");
    expect(e!.source).toBe("espn");
  });

  it("suppresses repeats and revisions within the same phase", () => {
    const announced = st({ injury: 4 });
    expect(
      synthesizeAddedTime(announced, st({ injury: 4 }), {
        lang: "ko",
        source: "fifa",
      }),
    ).toBeNull();
    // revised upwards mid-stoppage — still the same phase, still silent
    expect(
      synthesizeAddedTime(announced, st({ injury: 6 }), {
        lang: "ko",
        source: "fifa",
      }),
    ).toBeNull();
  });

  it("announces again in a new phase", () => {
    const e = synthesizeAddedTime(
      st({ injury: 4 }),
      st({ phase: "SECOND_HALF", minute: 90, injury: 5 }),
      { lang: "ko", source: "fifa" },
    );
    expect(e!.id).toBe("local:added-time-SECOND_HALF");
    expect(e!.period).toBe(5);
  });

  it("stays silent without injury time", () => {
    expect(
      synthesizeAddedTime(null, st({}), { lang: "ko", source: "fifa" }),
    ).toBeNull();
    expect(
      synthesizeAddedTime(null, st({ injury: 0 }), {
        lang: "ko",
        source: "fifa",
      }),
    ).toBeNull();
  });
});

describe("foldTimeline (readability a)", () => {
  it("folds routine events older than 15 match minutes", () => {
    const lines: Line[] = [
      eLine(ev("SHOT", 10)),
      eLine(ev("FOUL", 20)),
      eLine(ev("SHOT", 30)),
    ];
    const { visible, foldedCount } = foldTimeline(lines, 40, eventOf);
    expect(foldedCount).toBe(2); // 10' and 20' fold, 30' inside the window
    expect(visible.map((l) => eventOf(l)?.minute)).toEqual([30]);
  });

  it("keeps the exact 15-minute edge visible", () => {
    const lines: Line[] = [eLine(ev("SHOT", 25))];
    expect(foldTimeline(lines, 40, eventOf).foldedCount).toBe(0);
    expect(foldTimeline(lines, 41, eventOf).foldedCount).toBe(1);
  });

  it("never folds any survivor type, however old", () => {
    const lines: Line[] = [...FOLD_SURVIVORS].map((t) => eLine(ev(t, 1)));
    const { visible, foldedCount } = foldTimeline(lines, 90, eventOf);
    expect(foldedCount).toBe(0);
    expect(visible).toHaveLength(FOLD_SURVIVORS.size);
  });

  it("always keeps non-event lines (separators, boundary blocks)", () => {
    const lines: Line[] = [
      { kind: "sep" },
      eLine(ev("OFFSIDE", 1)),
      { kind: "boundary" },
    ];
    const { visible, foldedCount } = foldTimeline(lines, 90, eventOf);
    expect(foldedCount).toBe(1);
    expect(visible.map((l) => l.kind)).toEqual(["sep", "boundary"]);
  });

  it("does not mutate the backing store", () => {
    const lines: Line[] = [eLine(ev("SHOT", 1)), eLine(ev("GOAL", 2))];
    foldTimeline(lines, 90, eventOf);
    expect(lines).toHaveLength(2); // append-only store untouched
  });
});

describe("deriveHighlights (readability b)", () => {
  it("keeps goals and cards in clock order, dropping duplicates", () => {
    const goal = ev("GOAL", 23, { period: 3, player: "Merino" });
    const card = ev("YELLOW", 64, { period: 5, player: "Kim" });
    const out = deriveHighlights(
      [card, ev("SHOT", 10), goal, goal],
      new Set(),
    );
    expect(out.map((e) => e.type)).toEqual(["GOAL", "YELLOW"]);
  });

  it("removes VAR-cancelled goals via the cancelled id set", () => {
    const goal = ev("GOAL", 23, { period: 3 });
    expect(deriveHighlights([goal], new Set([goal.id]))).toEqual([]);
  });
});

describe("boundaryPhaseOf (readability c)", () => {
  it("maps only unambiguous whistle events", () => {
    expect(boundaryPhaseOf(ev("FULLTIME", 90))).toBe("FINISHED");
    expect(boundaryPhaseOf(ev("PERIOD_END", 45, { period: 3 }))).toBe(
      "HALFTIME",
    );
    // end of period 5 could be ET or FT — left to the phase transition
    expect(boundaryPhaseOf(ev("PERIOD_END", 90, { period: 5 }))).toBeNull();
    expect(boundaryPhaseOf(ev("GOAL", 10))).toBeNull();
  });
});
