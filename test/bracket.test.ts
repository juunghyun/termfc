import { describe, expect, it } from "vitest";
import { buildBracket, placeholderLabel } from "../src/core/bracket.js";
import type { Match, StageKind } from "../src/core/model.js";

function km(
  stageKind: StageKind | undefined,
  matchNumber: number | undefined,
  over: Partial<Match> = {},
): Match {
  return {
    id: `m${matchNumber ?? Math.random()}`,
    stage: "",
    kickoff: "2026-07-04T17:00:00Z",
    home: { code: "TBD", name: "W73", flag: "🏳️" },
    away: { code: "TBD", name: "W75", flag: "🏳️" },
    score: { home: 0, away: 0 },
    phase: "SCHEDULED",
    ...(stageKind ? { stageKind } : {}),
    ...(matchNumber !== undefined ? { matchNumber } : {}),
    sourceRefs: {},
    ...over,
  };
}

describe("buildBracket", () => {
  it("orders rounds R32→FINAL and matches by match number", () => {
    const rounds = buildBracket([
      km("FINAL", 104),
      km("R16", 96),
      km("R16", 89),
      km("R32", 73),
      km("THIRD", 103),
      km("SF", 101),
      km("QF", 97),
      km("GROUP", 1, { group: "A" }),
      km(undefined, undefined), // ESPN best-effort miss — excluded
    ]);
    expect(rounds.map((r) => r.kind)).toEqual([
      "R32",
      "R16",
      "QF",
      "SF",
      "THIRD",
      "FINAL",
    ]);
    const r16 = rounds.find((r) => r.kind === "R16")!;
    expect(r16.matches.map((m) => m.matchNumber)).toEqual([89, 96]);
  });

  it("falls back to kickoff order when match numbers are missing", () => {
    const rounds = buildBracket([
      km("QF", undefined, { id: "b", kickoff: "2026-07-10T19:00:00Z" }),
      km("QF", undefined, { id: "a", kickoff: "2026-07-09T20:00:00Z" }),
    ]);
    expect(rounds[0]!.matches.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("returns no rounds for group-stage-only input", () => {
    expect(buildBracket([km("GROUP", 5, { group: "B" })])).toEqual([]);
  });
});

describe("placeholderLabel", () => {
  it("labels winner/loser slots in both languages", () => {
    expect(placeholderLabel("W89", "ko")).toBe("89번 승자");
    expect(placeholderLabel("W89", "en")).toBe("Winner M89");
    expect(placeholderLabel("RU101", "ko")).toBe("101번 패자");
    expect(placeholderLabel("RU101", "en")).toBe("Loser M101");
  });

  it("labels group-position slots (R32 seeds)", () => {
    expect(placeholderLabel("1A", "ko")).toBe("A조 1위");
    expect(placeholderLabel("2C", "en")).toBe("Group C #2");
    expect(placeholderLabel("3ABCDF", "ko")).toBe("A/B/C/D/F조 중 3위");
    expect(placeholderLabel("3ABCDF", "en")).toBe("3rd of A/B/C/D/F");
  });

  it("passes unknown formats through unchanged", () => {
    expect(placeholderLabel("TBD", "ko")).toBe("TBD");
    expect(placeholderLabel("WINNER-X", "ko")).toBe("WINNER-X");
  });
});
