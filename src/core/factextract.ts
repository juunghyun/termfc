/**
 * Fact extraction from event sentence text. The FIFA feed carries some facts
 * (substitution in/out, assist taker, added-time amount) only inside its
 * prose sentence — these helpers pull the facts out so events can be
 * rendered from structure alone. Patterns cover both the live FIFA feed
 * (ko/en) and the synthetic sentences written by pre-v0.4 termfc (recordings
 * and fixtures), so old replay files can be enriched on load.
 *
 * The prose itself is never displayed; it is a parse source only.
 */

const SUB_PATTERNS: readonly RegExp[] = [
  /^(.+?) \(in\) comes off the bench to replace (.+?) \(out\)/, // FIFA en
  /^(.+?) \(in\) 선수가 (.+?)\s*\(교체\)/, // FIFA ko
  /^(?:선수 교체|Substitution)(?: \(.+?\))?: (.+?) (?:IN|in), (.+?) (?:OUT|out)$/, // v0.3 synthetic
];

export function subPlayersFrom(
  text: string | undefined,
): { playerIn: string; playerOut: string } | undefined {
  for (const re of SUB_PATTERNS) {
    const m = re.exec(text ?? "");
    if (m) return { playerIn: m[1]!.trim(), playerOut: m[2]!.trim() };
  }
  return undefined;
}

const ASSIST_PATTERNS: readonly RegExp[] = [
  /^Assisted by (.+?)\.?$/, // FIFA en
  /^(.+?) 선수의 어시스트/, // FIFA ko
  /^(?:어시스트|Assist): (.+)$/, // v0.3 synthetic
];

export function assistPlayerFrom(text: string | undefined): string | undefined {
  for (const re of ASSIST_PATTERNS) {
    const m = re.exec(text ?? "");
    if (m) return m[1]!.trim();
  }
  return undefined;
}

/** Added-time amount from a stored ADDED_TIME sentence ("추가시간 +4분", "+4 minutes added"). */
export function addedTimeFrom(text: string | undefined): number | undefined {
  const m = /\+\s*(\d+)\s*(?:분|minute)/.exec(text ?? "");
  return m ? Number(m[1]) : undefined;
}

/** Leading "PLAYER (TEAM)" name — the shape FIFA prose uses for actor events. */
export function leadingPlayerFrom(text: string | undefined): string | undefined {
  if (!text) return undefined;
  // FIFA-ko booking sentences lead with the referee, not the player
  // ("주심이 X (팀) 에게 경고…") — drop that prefix before matching.
  const cleaned = text.replace(/^(?:주심|부심|심판)이\s*/, "");
  const m = /^(.{2,40}?)\s*\(/.exec(cleaned);
  return m?.[1]?.trim() || undefined;
}

/** Strip the referee prefix old recordings baked into extracted player names. */
export function cleanPlayerFact(player: string | undefined): string | undefined {
  if (!player) return undefined;
  const cleaned = player.replace(/^(?:주심|부심|심판)이\s*/, "").trim();
  return cleaned || undefined;
}
