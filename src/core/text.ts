/**
 * Player-name normalization. The FIFA feed carries names in ALL CAPS
 * ("JOAO CANCELO", "Mikel MERINO") — normalize before display or
 * transliteration. (Sentence-level cleanup for feed prose was removed in
 * v0.4: sentences are generated locally from structure, so there is no feed
 * prose to clean.)
 */

const ALL_CAPS_WORD = /^[A-Z]{2,}$/;

function titleCaseWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/(^|[-'’])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Player names stand alone, so title-case every all-caps word ("RONALDO"). */
export function normalizePlayerName(s: string): string {
  return s
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(" ")
    .map((w) => (ALL_CAPS_WORD.test(w.replace(/['’-]/g, "")) ? titleCaseWord(w) : w))
    .join(" ");
}
