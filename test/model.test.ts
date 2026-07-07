import { describe, expect, it } from "vitest";
import {
  compareEvents,
  formatEventClock,
  parseMatchMinute,
  salienceOf,
  type TimelineEvent,
} from "../src/core/model.js";

describe("parseMatchMinute", () => {
  it("parses plain minutes", () => {
    expect(parseMatchMinute("67'")).toEqual({ minute: 67 });
  });
  it("parses stoppage time", () => {
    expect(parseMatchMinute("90'+4'")).toEqual({ minute: 90, injury: 4 });
  });
  it("handles empty/garbage", () => {
    expect(parseMatchMinute("")).toEqual({ minute: 0 });
    expect(parseMatchMinute(undefined)).toEqual({ minute: 0 });
    expect(parseMatchMinute("HT")).toEqual({ minute: 0 });
  });
});

describe("compareEvents", () => {
  const e = (over: Partial<TimelineEvent>): TimelineEvent => ({
    id: "x",
    type: "SHOT",
    minute: 0,
    source: "fifa",
    seq: 0,
    ...over,
  });
  it("orders by period, minute, injury, seq", () => {
    const events = [
      e({ id: "d", period: 5, minute: 46, seq: 3 }),
      e({ id: "b", period: 3, minute: 45, injury: 2, seq: 1 }),
      e({ id: "a", period: 3, minute: 45, seq: 0 }),
      e({ id: "c", period: 3, minute: 45, injury: 2, seq: 2 }),
    ];
    expect([...events].sort(compareEvents).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("salience / clock format", () => {
  it("marks goals and reds high", () => {
    expect(salienceOf("GOAL")).toBe("high");
    expect(salienceOf("RED")).toBe("high");
    expect(salienceOf("CORNER")).toBe("low");
  });
  it("formats stoppage clock", () => {
    expect(formatEventClock({ minute: 90, injury: 1 })).toBe("90'+1'");
    expect(formatEventClock({ minute: 12 })).toBe("12'");
  });
});
