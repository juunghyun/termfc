import { describe, expect, it } from "vitest";
import { EventDiffer } from "../src/core/diff.js";
import type { SourceName, TimelineEvent } from "../src/core/model.js";

let seq = 0;
const ev = (
  id: string,
  over: Partial<TimelineEvent> = {},
  source: SourceName = "fifa",
): TimelineEvent => ({
  id: `${source}:${id}`,
  type: "SHOT",
  minute: 10,
  source,
  seq: seq++,
  ...over,
});

describe("EventDiffer", () => {
  it("emits only unseen events on repeated snapshots", () => {
    const d = new EventDiffer();
    const a = ev("1");
    const b = ev("2", { minute: 12 });
    expect(d.reconcile([a]).fresh).toHaveLength(1);
    const r = d.reconcile([a, b]);
    expect(r.fresh.map((e) => e.id)).toEqual(["fifa:2"]);
    expect(d.reconcile([a, b]).fresh).toHaveLength(0);
  });

  it("sorts fresh events by match clock", () => {
    const d = new EventDiffer();
    const later = ev("2", { period: 5, minute: 50 });
    const earlier = ev("1", { period: 3, minute: 44 });
    const r = d.reconcile([later, earlier]);
    expect(r.fresh.map((e) => e.id)).toEqual(["fifa:1", "fifa:2"]);
  });

  it("reports VAR-cancelled goals when they vanish from the snapshot", () => {
    const d = new EventDiffer();
    const goal = ev("g", { type: "GOAL", minute: 30 });
    const foul = ev("f", { minute: 29 });
    d.reconcile([foul, goal]);
    const r = d.reconcile([foul]); // goal removed by VAR
    expect(r.cancelled.map((e) => e.id)).toEqual(["fifa:g"]);
    // once cancelled, not reported again
    expect(d.reconcile([foul]).cancelled).toHaveLength(0);
  });

  it("cancels vanished penalty and own goals exactly once", () => {
    for (const type of ["PENALTY_GOAL", "OWN_GOAL"] as const) {
      const d = new EventDiffer();
      const goal = ev("g", { type, minute: 70 });
      const other = ev("o", { minute: 69 });
      d.reconcile([other, goal]);
      expect(d.reconcile([other]).cancelled).toHaveLength(1);
      expect(d.reconcile([other]).cancelled).toHaveLength(0);
    }
  });

  it("suppresses duplicate high-salience events across a source switch", () => {
    const d = new EventDiffer();
    const fifaGoal = ev("g", {
      type: "GOAL",
      minute: 30,
      period: 3,
      teamCode: "ESP",
    });
    d.reconcile([fifaGoal]);
    const espnGoal = ev(
      "999",
      { type: "GOAL", minute: 31, period: 3, teamCode: "ESP" },
      "espn",
    );
    const espnOldShot = ev("998", { minute: 5, period: 3 }, "espn");
    const espnNewShot = ev("1000", { minute: 33, period: 3 }, "espn");
    const r = d.reconcile([espnOldShot, espnGoal, espnNewShot]);
    expect(r.sourceSwitched).toBe(true);
    // same goal (±1 min, same team) suppressed; old low-salience history cut off
    expect(r.fresh.map((e) => e.id)).toEqual(["espn:1000"]);
  });
});
