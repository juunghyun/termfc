import type { Lang, Match, StageKind } from "./model.js";

/** Knockout rounds in bracket display order (2026: R32 exists). */
export const KNOCKOUT_ORDER: readonly StageKind[] = [
  "R32",
  "R16",
  "QF",
  "SF",
  "THIRD",
  "FINAL",
];

export interface BracketRound {
  kind: StageKind;
  matches: Match[];
}

/**
 * Round sections ordered R32 → FINAL, matches by official match number.
 * Tree topology comes straight from the source (PlaceHolderA/B + numbers) —
 * we never predict qualification locally (decision doc).
 */
export function buildBracket(matches: Match[]): BracketRound[] {
  const byKind = new Map<StageKind, Match[]>();
  for (const m of matches) {
    if (!m.stageKind || m.stageKind === "GROUP") continue;
    const list = byKind.get(m.stageKind) ?? [];
    list.push(m);
    byKind.set(m.stageKind, list);
  }
  const rounds: BracketRound[] = [];
  for (const kind of KNOCKOUT_ORDER) {
    const list = byKind.get(kind);
    if (!list) continue;
    list.sort(
      (a, b) =>
        (a.matchNumber ?? Number.MAX_SAFE_INTEGER) -
          (b.matchNumber ?? Number.MAX_SAFE_INTEGER) ||
        a.kickoff.localeCompare(b.kickoff),
    );
    rounds.push({ kind, matches: list });
  }
  return rounds;
}

/**
 * Human labels for FIFA slot placeholders ("W89", "RU101", "1A", "3ABCDF").
 * Unknown formats pass through unchanged — the raw code still identifies
 * the slot, so parsing failures only cost polish, never correctness.
 */
export function placeholderLabel(raw: string, lang: Lang): string {
  let m = /^W(\d+)$/.exec(raw);
  if (m) return lang === "ko" ? `${m[1]}번 승자` : `Winner M${m[1]}`;
  m = /^RU(\d+)$/.exec(raw);
  if (m) return lang === "ko" ? `${m[1]}번 패자` : `Loser M${m[1]}`;
  m = /^([12])([A-L])$/.exec(raw);
  if (m)
    return lang === "ko" ? `${m[2]}조 ${m[1]}위` : `Group ${m[2]} #${m[1]}`;
  m = /^3([A-L]{2,})$/.exec(raw);
  if (m) {
    const pool = m[1]!.split("").join("/");
    return lang === "ko" ? `${pool}조 중 3위` : `3rd of ${pool}`;
  }
  return raw;
}
