import { describe, expect, it } from "vitest";
import { mapEspnPhase, mapFifaPhase } from "../src/core/state.js";

describe("mapFifaPhase", () => {
  it("maps status codes", () => {
    expect(mapFifaPhase(0, undefined, 99)).toBe("FINISHED");
    expect(mapFifaPhase(1, undefined, 0)).toBe("SCHEDULED");
  });
  it("maps live periods (verified 2026 values)", () => {
    expect(mapFifaPhase(3, 3, 20)).toBe("FIRST_HALF");
    expect(mapFifaPhase(3, 4, 45)).toBe("HALFTIME");
    expect(mapFifaPhase(3, 5, 60)).toBe("SECOND_HALF");
    expect(mapFifaPhase(3, 11, 120)).toBe("PENALTIES");
  });
  it("infers from minute when period is missing", () => {
    expect(mapFifaPhase(3, undefined, 30)).toBe("FIRST_HALF");
    expect(mapFifaPhase(3, undefined, 70)).toBe("SECOND_HALF");
  });
});

describe("mapEspnPhase", () => {
  it("maps status names", () => {
    expect(mapEspnPhase("STATUS_HALFTIME", "in", 1)).toBe("HALFTIME");
    expect(mapEspnPhase("STATUS_FULL_TIME", "post", 2)).toBe("FINISHED");
    expect(mapEspnPhase("STATUS_SCHEDULED", "pre", 0)).toBe("SCHEDULED");
    expect(mapEspnPhase("STATUS_IN_PROGRESS", "in", 2)).toBe("SECOND_HALF");
  });
  it("maps shoot-out states", () => {
    expect(mapEspnPhase("STATUS_SHOOTOUT", "in", 5)).toBe("PENALTIES");
    expect(mapEspnPhase("STATUS_FINAL_PEN", "post", 5)).toBe("FINISHED");
    expect(mapEspnPhase("STATUS_OVERTIME", "in", 3)).toBe("ET_FIRST");
  });

  it("falls back to competition state", () => {
    expect(mapEspnPhase("STATUS_WEIRD", "post", 0)).toBe("FINISHED");
  });
});
