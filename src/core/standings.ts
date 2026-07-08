import type { Match, Team } from "./model.js";

export interface StandingRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;
  /**
   * Rank vs the next row could not be resolved with computable tie-breakers
   * (points → goal diff → goals for → head-to-head). Fair-play points would
   * need per-match card data, so we surface the tie honestly instead.
   */
  tiedWithNext: boolean;
}

export interface GroupTable {
  group: string; // "A" … "L"
  rows: StandingRow[];
}

interface Agg {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
}

function tally(into: Map<string, Agg>, team: Team, gf: number, ga: number) {
  const agg = into.get(team.code) ?? {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
  };
  agg.played++;
  agg.gf += gf;
  agg.ga += ga;
  if (gf > ga) agg.won++;
  else if (gf === ga) agg.drawn++;
  else agg.lost++;
  into.set(team.code, agg);
}

const points = (a: Agg) => a.won * 3 + a.drawn;
const gd = (a: Agg) => a.gf - a.ga;

/** points → goal diff → goals for (0 = still tied). */
function compareAgg(a: Agg, b: Agg): number {
  return points(b) - points(a) || gd(b) - gd(a) || b.gf - a.gf;
}

function zeroAgg(team: Team): Agg {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
}

/**
 * Teams are seeded from every match (so unplayed groups still list all
 * four sides), but only FINISHED results are tallied.
 */
function aggregate(matches: Match[], teams?: ReadonlySet<string>): Map<string, Agg> {
  const map = new Map<string, Agg>();
  for (const m of matches) {
    if (teams && !(teams.has(m.home.code) && teams.has(m.away.code))) continue;
    for (const t of [m.home, m.away])
      if (!map.has(t.code)) map.set(t.code, zeroAgg(t));
    if (m.phase !== "FINISHED") continue;
    tally(map, m.home, m.score.home, m.score.away);
    tally(map, m.away, m.score.away, m.score.home);
  }
  return map;
}

/**
 * Group standings computed locally from finished results — never from a
 * source standings API, so FIFA and ESPN failover agree and it's testable.
 * Tie-break order (decision doc): points → goal diff → goals for →
 * head-to-head (same three keys restricted to the tied teams). Ties beyond
 * that are marked, not guessed.
 */
export function computeGroupStandings(matches: Match[]): GroupTable[] {
  const byGroup = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.stageKind !== "GROUP" || !m.group) continue;
    const list = byGroup.get(m.group) ?? [];
    list.push(m);
    byGroup.set(m.group, list);
  }

  const tables: GroupTable[] = [];
  for (const group of [...byGroup.keys()].sort()) {
    const groupMatches = byGroup.get(group)!;
    const overall = [...aggregate(groupMatches).values()].sort(compareAgg);

    // Resolve clusters that are fully tied on the overall keys via a
    // head-to-head mini-table restricted to the tied teams.
    const ordered: Array<{ agg: Agg; tiedWithNext: boolean }> = [];
    for (let i = 0; i < overall.length; ) {
      let j = i + 1;
      while (j < overall.length && compareAgg(overall[i]!, overall[j]!) === 0)
        j++;
      const cluster = overall.slice(i, j);
      if (cluster.length === 1) {
        ordered.push({ agg: cluster[0]!, tiedWithNext: false });
      } else {
        const codes = new Set(cluster.map((a) => a.team.code));
        const mini = aggregate(groupMatches, codes);
        // Tied teams may not have met yet — fall back to a zero record.
        const h2h = (a: Agg) => mini.get(a.team.code) ?? zeroAgg(a.team);
        cluster.sort((a, b) => compareAgg(h2h(a), h2h(b)) || compareAgg(a, b));
        for (let k = 0; k < cluster.length; k++) {
          const next = cluster[k + 1];
          ordered.push({
            agg: cluster[k]!,
            tiedWithNext:
              next !== undefined &&
              compareAgg(h2h(cluster[k]!), h2h(next)) === 0,
          });
        }
      }
      i = j;
    }

    tables.push({
      group,
      rows: ordered.map(({ agg, tiedWithNext }, idx) => ({
        team: agg.team,
        played: agg.played,
        won: agg.won,
        drawn: agg.drawn,
        lost: agg.lost,
        goalsFor: agg.gf,
        goalsAgainst: agg.ga,
        goalDiff: gd(agg),
        points: points(agg),
        rank: idx + 1,
        tiedWithNext,
      })),
    });
  }
  return tables;
}
