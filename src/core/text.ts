/**
 * Display-time cleanup for source-provided commentary text. FIFA's feed
 * carries artifacts we don't want on screen: doubled spaces, a detached
 * genitive particle ("포르투갈 의 골키퍼"), and player names in ALL CAPS
 * ("JOAO CANCELO", "Lamine YAMAL"). Applied when rendering, so live,
 * replay and demo paths (including already-recorded files) all benefit.
 */

const ALL_CAPS_WORD = /^[A-Z]{2,}$/;

function titleCaseWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/(^|[-'’])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Title-case ALL-CAPS latin words, but only inside runs of 2+ latin words —
 * standalone acronyms (VAR, PSO) must survive.
 */
function normalizeNamesInText(s: string): string {
  return s.replace(
    /[A-Za-z][A-Za-z'’-]*(?: [A-Za-z][A-Za-z'’-]*)+/g,
    (run) =>
      run
        .split(" ")
        .map((w) => (ALL_CAPS_WORD.test(w.replace(/['’-]/g, "")) ? titleCaseWord(w) : w))
        .join(" "),
  );
}

export function normalizeEventText(s: string): string {
  let t = s.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/(\S) (의|에게) /g, "$1$2 ");
  t = normalizeNamesInText(t);
  // Standalone single-name players ("RODRI"). 4+ letters so short acronyms
  // (VAR, PSO, GK) survive.
  return t.replace(/(?<![A-Za-z'’-])[A-Z]{4,}(?![A-Za-z'’-])/g, titleCaseWord);
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
