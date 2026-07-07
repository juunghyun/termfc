import { describe, expect, it } from "vitest";
import { ClockInterpolator, formatClock } from "../src/core/clock.js";

function fakeNow(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("ClockInterpolator", () => {
  it("interpolates seconds between minute-granularity updates", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 10, phase: "FIRST_HALF" });
    c.advance(30_000);
    const d = clock.display();
    expect(d.minute).toBe(10);
    expect(d.second).toBe(30);
    expect(d.running).toBe(true);
  });

  it("never moves backwards when the source repeats an older minute", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 10, phase: "FIRST_HALF" });
    c.advance(90_000); // interpolated to 11:30
    clock.update({ minute: 11, phase: "FIRST_HALF" }); // source behind display
    expect(clock.display().totalSeconds).toBeGreaterThanOrEqual(11 * 60 + 30);
  });

  it("freezes at half-time and resumes at 45:00 for the second half", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 45, injury: 2, phase: "FIRST_HALF" });
    clock.update({ minute: 45, phase: "HALFTIME" });
    const frozen = clock.display().totalSeconds;
    c.advance(10 * 60_000);
    expect(clock.display().totalSeconds).toBe(frozen);
    expect(clock.display().running).toBe(false);
    clock.update({ minute: 45, phase: "SECOND_HALF" });
    c.advance(1_000);
    expect(clock.display().totalSeconds).toBeGreaterThanOrEqual(45 * 60);
  });

  it("renders stoppage time past the regulation cap", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 90, injury: 1, phase: "SECOND_HALF" });
    c.advance(30_000);
    const s = formatClock(clock.display());
    expect(s).toMatch(/^90:00 \+1:3\d$/);
  });

  it("never rewinds when FT arrives with a broken minute value", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 90, injury: 9, phase: "SECOND_HALF" });
    c.advance(30_000);
    const before = clock.display().totalSeconds;
    clock.update({ minute: 0, phase: "FINISHED" }); // degenerate source snapshot
    expect(clock.display().totalSeconds).toBeGreaterThanOrEqual(before);
    c.advance(60_000);
    expect(clock.display().running).toBe(false);
  });

  it("snaps to 45:00 when half-time starts mid-stoppage", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 45, injury: 3, phase: "FIRST_HALF" }); // 48:00
    clock.update({ minute: 45, phase: "HALFTIME" });
    expect(clock.display().totalSeconds).toBe(45 * 60);
  });

  it("pins the shoot-out clock at 120:00", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now);
    clock.update({ minute: 0, phase: "PENALTIES" });
    expect(clock.display().totalSeconds).toBe(120 * 60);
    expect(clock.display().running).toBe(false);
  });

  it("supports accelerated rate for replays", () => {
    const c = fakeNow();
    const clock = new ClockInterpolator(c.now, 60);
    clock.update({ minute: 0, phase: "FIRST_HALF" });
    c.advance(1_000); // 1 real second = 60 match seconds
    expect(clock.display().minute).toBe(1);
  });
});
