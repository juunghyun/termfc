import { describe, expect, it } from "vitest";
import type { Match, Team } from "../src/core/model.js";
import { computeGroupStandings } from "../src/core/standings.js";

const T = (code: string): Team => ({ code, name: code, flag: "🏳️" });

let seq = 0;
function played(
  group: string,
  home: string,
  away: string,
  hs: number,
  as: number,
): Match {
  return {
    id: `m${++seq}`,
    stage: "First Stage",
    kickoff: "2026-06-11T19:00:00Z",
    home: T(home),
    away: T(away),
    score: { home: hs, away: as },
    phase: "FINISHED",
    stageKind: "GROUP",
    group,
    sourceRefs: {},
  };
}

describe("computeGroupStandings", () => {
  it("ranks by points, counts W/D/L and goal stats", () => {
    const tables = computeGroupStandings([
      played("A", "AAA", "BBB", 2, 0),
      played("A", "CCC", "DDD", 1, 1),
      played("A", "AAA", "CCC", 1, 0),
      played("A", "BBB", "DDD", 0, 3),
    ]);
    expect(tables).toHaveLength(1);
    const rows = tables[0]!.rows;
    expect(rows.map((r) => r.team.code)).toEqual(["AAA", "DDD", "CCC", "BBB"]);
    const top = rows[0]!;
    expect(top).toMatchObject({
      played: 2,
      won: 2,
      drawn: 0,
      lost: 0,
      goalsFor: 3,
      goalsAgainst: 0,
      goalDiff: 3,
      points: 6,
      rank: 1,
      tiedWithNext: false,
    });
  });

  it("breaks equal points by goal diff, then goals for", () => {
    // AAA (3pts, +3) over BBB (3pts, +1) — goal diff decides.
    const gdTables = computeGroupStandings([
      played("B", "AAA", "CCC", 3, 0),
      played("B", "BBB", "CCC", 1, 0),
    ]);
    expect(gdTables[0]!.rows.map((r) => r.team.code)).toEqual([
      "AAA",
      "BBB",
      "CCC",
    ]);

    // Same points and gd — goals for decides (AAA gf2 over BBB gf1).
    const gfTables = computeGroupStandings([
      played("F", "AAA", "CCC", 2, 1),
      played("F", "BBB", "DDD", 1, 0),
    ]);
    const codes = gfTables[0]!.rows.map((r) => r.team.code);
    expect(codes.indexOf("AAA")).toBeLessThan(codes.indexOf("BBB"));
  });

  it("resolves full ties via head-to-head among the tied teams", () => {
    // AAA and BBB both: 3pts, gd 0, gf 2 — identical overall record.
    // AAA won the direct match 2-1, so head-to-head puts AAA first.
    const tables = computeGroupStandings([
      played("C", "AAA", "BBB", 2, 1),
      played("C", "CCC", "AAA", 1, 0),
      played("C", "BBB", "CCC", 1, 0),
    ]);
    const rows = tables[0]!.rows;
    expect(rows[0]!.team.code).toBe("AAA");
    expect(rows[1]!.team.code).toBe("BBB");
    expect(rows[0]!.points).toBe(rows[1]!.points);
    expect(rows[0]!.goalDiff).toBe(rows[1]!.goalDiff);
    expect(rows[0]!.goalsFor).toBe(rows[1]!.goalsFor);
    expect(rows[0]!.tiedWithNext).toBe(false); // resolved, not a coin flip
  });

  it("marks unresolved ties instead of guessing", () => {
    // Two teams: identical records, drew head-to-head — unresolvable.
    const tables = computeGroupStandings([
      played("D", "AAA", "BBB", 1, 1),
      played("D", "CCC", "AAA", 0, 2),
      played("D", "CCC", "BBB", 0, 2),
    ]);
    const rows = tables[0]!.rows;
    expect(rows[0]!.tiedWithNext).toBe(true);
    expect(rows[1]!.tiedWithNext).toBe(false);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(2);
  });

  it("lists teams of unfinished matches without tallying, skips knockouts", () => {
    const live = played("E", "AAA", "BBB", 1, 0);
    live.phase = "SECOND_HALF";
    const knockout = played("", "CCC", "DDD", 2, 0);
    knockout.stageKind = "R16";
    knockout.group = undefined;
    const tables = computeGroupStandings([live, knockout]);
    expect(tables).toHaveLength(1); // knockout contributes no table
    const rows = tables[0]!.rows;
    expect(rows.map((r) => r.team.code).sort()).toEqual(["AAA", "BBB"]);
    // live score must not count yet
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("sorts groups alphabetically", () => {
    const tables = computeGroupStandings([
      played("L", "AAA", "BBB", 1, 0),
      played("A", "CCC", "DDD", 1, 0),
    ]);
    expect(tables.map((t) => t.group)).toEqual(["A", "L"]);
  });
});
