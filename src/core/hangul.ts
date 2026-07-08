/**
 * Roman-to-Hangul transliteration for player names (community/brief tones).
 * Rule engine follows the spirit of 외래어 표기법 for Latin-script names:
 * CV pairs become syllables, trailing m/n/l/ng/k/p become batchim, other
 * trailing consonants get an ㅡ vowel (트/스/드), r before a consonant
 * becomes 르. Language-specific pronunciation (Spanish j, Portuguese nh…)
 * cannot be inferred from spelling — well-known names are pinned in
 * data/hangul-names.json and everything else degrades to a deterministic,
 * harmless approximation (the requirement gate is determinism + harmlessness,
 * not perfect accuracy).
 */
import exceptionsJson from "../data/hangul-names.json" with { type: "json" };

const EXCEPTIONS = exceptionsJson as Record<string, string>;

// Choseong (onset) indices in the Hangul syllable block.
const CHO = {
  g: 0, n: 2, d: 3, r: 5, m: 6, b: 7, s: 9, ng: 11, j: 12, ch: 14,
  k: 15, t: 16, p: 17, h: 18,
} as const;
// Jungseong (vowel) indices.
const JUNG = {
  a: 0, ya: 2, e: 5, ye: 7, o: 8, wa: 9, yo: 12, u: 13, wo: 14, we: 15,
  wi: 16, yu: 17, eu: 18, i: 20,
} as const;
// Jongseong (batchim) codes for consonants allowed to close a syllable.
const JONG = { k: 1, n: 4, l: 8, m: 16, p: 17, s: 19, ng: 21 } as const;

type Cho = number;
interface Syllable {
  cho: Cho;
  jung: number;
  jong?: number;
}

const compose = (s: Syllable): string =>
  String.fromCharCode(0xac00 + (s.cho * 21 + s.jung) * 28 + (s.jong ?? 0));

/** Non-decomposable Latin letters NFD cannot strip. */
const LETTER_FIXES: Record<string, string> = {
  ø: "o", đ: "d", ł: "l", ß: "ss", æ: "ae", œ: "oe", ð: "d", þ: "th",
};

function normalizeRoman(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[øđłßæœðþ]/g, (ch) => LETTER_FIXES[ch] ?? "")
    .replace(/[^a-z'-]/g, "");
}

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

interface Token {
  kind: "c" | "v" | "ngEnd";
  /** consonant: choseong index; vowel: jungseong index */
  code: number;
  /** consonant carries a y-glide onto the next vowel (nh, sh) */
  palatal?: boolean;
  /** consonant carries a w-glide onto the next vowel (qu) */
  labial?: boolean;
  /** letter this consonant came from (batchim eligibility) */
  letter?: string;
  /** geminate l (ll) — closes the previous syllable with ㄹ too */
  geminateL?: boolean;
}

function consonantToken(letter: string, next: string): Token | null {
  const soft = next === "e" || next === "i" || next === "y";
  switch (letter) {
    case "b": case "v": return { kind: "c", code: CHO.b, letter: "b" };
    case "c": return soft
      ? { kind: "c", code: CHO.s, letter: "s" }
      : { kind: "c", code: CHO.k, letter: "k" };
    case "d": return { kind: "c", code: CHO.d, letter: "d" };
    case "f": case "p": return { kind: "c", code: CHO.p, letter: "p" };
    case "g": return { kind: "c", code: CHO.g, letter: "k" };
    case "h": return { kind: "c", code: CHO.h, letter: "h" };
    case "j": return { kind: "c", code: CHO.j, letter: "j" };
    case "k": case "q": return { kind: "c", code: CHO.k, letter: "k" };
    case "l": return { kind: "c", code: CHO.r, letter: "l" };
    case "m": return { kind: "c", code: CHO.m, letter: "m" };
    case "n": return { kind: "c", code: CHO.n, letter: "n" };
    case "r": return { kind: "c", code: CHO.r, letter: "r" };
    case "s": case "z": return { kind: "c", code: CHO.s, letter: "s" };
    case "t": return { kind: "c", code: CHO.t, letter: "t" };
    case "w": return { kind: "c", code: CHO.ng, labial: true, letter: "w" };
    default: return null;
  }
}

/** Tokenize one normalized word into consonant/vowel tokens. */
function tokenize(word: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < word.length) {
    const ch = word[i]!;
    const nx = word[i + 1] ?? "";
    const nx2 = word[i + 2] ?? "";
    if (ch === "'" || ch === "-") {
      i++;
      continue;
    }
    // consonant digraphs
    if (ch === "c" && nx === "h") { out.push({ kind: "c", code: CHO.ch, letter: "t" }); i += 2; continue; }
    if (ch === "s" && nx === "h") { out.push({ kind: "c", code: CHO.s, palatal: true, letter: "s" }); i += 2; continue; }
    if (ch === "t" && nx === "h") { out.push({ kind: "c", code: CHO.t, letter: "t" }); i += 2; continue; }
    if (ch === "p" && nx === "h") { out.push({ kind: "c", code: CHO.p, letter: "p" }); i += 2; continue; }
    if (ch === "k" && nx === "h") { out.push({ kind: "c", code: CHO.k, letter: "k" }); i += 2; continue; }
    if (ch === "g" && nx === "h") { out.push({ kind: "c", code: CHO.g, letter: "k" }); i += 2; continue; }
    if ((ch === "n" || ch === "l") && nx === "h") {
      out.push({ kind: "c", code: ch === "n" ? CHO.n : CHO.r, palatal: true, letter: ch });
      i += 2;
      continue;
    }
    if (ch === "c" && nx === "k") { out.push({ kind: "c", code: CHO.k, letter: "k" }); i += 2; continue; }
    if (ch === "q" && nx === "u") { out.push({ kind: "c", code: CHO.k, labial: true, letter: "k" }); i += 2; continue; }
    if (ch === "x") { // k + s cluster (Felix → 펠릭스)
      out.push({ kind: "c", code: CHO.k, letter: "k" }, { kind: "c", code: CHO.s, letter: "s" });
      i++;
      continue;
    }
    // ng closing a syllable (before a consonant or at word end)
    if (ch === "n" && nx === "g" && (nx2 === "" || !VOWELS.has(nx2))) {
      out.push({ kind: "ngEnd", code: JONG.ng });
      i += 2;
      continue;
    }
    // geminate l → ㄹㄹ; other doubled consonants collapse to one
    if (ch === "l" && nx === "l") {
      out.push({ kind: "c", code: CHO.r, letter: "l", geminateL: true });
      i += 2;
      continue;
    }
    if (!VOWELS.has(ch) && ch === nx) {
      i++;
      continue;
    }
    if (!VOWELS.has(ch)) {
      const tok = consonantToken(ch, nx);
      if (tok) out.push(tok);
      i++;
      continue;
    }
    // vowels — digraphs first
    if ((ch === "o" && (nx === "o" || nx === "u")) ) { out.push({ kind: "v", code: JUNG.u }); i += 2; continue; }
    if (ch === "e" && nx === "e") { out.push({ kind: "v", code: JUNG.i }); i += 2; continue; }
    if (ch === "y" && VOWELS.has(nx) && nx !== "y") {
      const base = { a: JUNG.ya, e: JUNG.ye, o: JUNG.yo, u: JUNG.yu, i: JUNG.i }[nx as "a" | "e" | "o" | "u" | "i"];
      out.push({ kind: "v", code: base });
      i += 2;
      continue;
    }
    const single = { a: JUNG.a, e: JUNG.e, i: JUNG.i, o: JUNG.o, u: JUNG.u, y: JUNG.i }[ch as "a" | "e" | "i" | "o" | "u" | "y"];
    out.push({ kind: "v", code: single });
    i++;
    continue;
  }
  return out;
}

const glideVowel = (v: number, tok: Token): number => {
  if (tok.palatal) {
    const map: Record<number, number> = {
      [JUNG.a]: JUNG.ya, [JUNG.e]: JUNG.ye, [JUNG.o]: JUNG.yo, [JUNG.u]: JUNG.yu,
    };
    return map[v] ?? v;
  }
  if (tok.labial) {
    const map: Record<number, number> = {
      [JUNG.a]: JUNG.wa, [JUNG.e]: JUNG.we, [JUNG.i]: JUNG.wi, [JUNG.o]: JUNG.wo,
    };
    return map[v] ?? v;
  }
  return v;
};

/** Batchim code for a consonant letter closing a syllable, if allowed. */
const batchimOf = (letter: string | undefined): number | undefined =>
  letter && letter in JONG && letter !== "s" // s before a consonant → 스, not ㅅ batchim
    ? JONG[letter as keyof typeof JONG]
    : undefined;

/** Rule-convert one normalized word. Deterministic; Hangul-only output. */
export function romanWordToHangul(word: string): string {
  const tokens = tokenize(normalizeRoman(word));
  const syls: Syllable[] = [];
  let pending: Token | null = null;

  const flushPendingAsSyllable = () => {
    if (!pending) return;
    // r before a consonant / at end → 르; others → consonant + ㅡ
    syls.push({ cho: pending.code, jung: JUNG.eu });
    pending = null;
  };
  const flushPendingAsBatchim = (): boolean => {
    if (!pending) return true;
    const last = syls[syls.length - 1];
    const jong = pending.letter === "r" ? undefined : batchimOf(pending.letter);
    if (last && last.jong === undefined && jong !== undefined) {
      last.jong = jong;
      pending = null;
      return true;
    }
    return false;
  };

  for (const tok of tokens) {
    if (tok.kind === "ngEnd") {
      if (!flushPendingAsBatchim()) flushPendingAsSyllable();
      const last = syls[syls.length - 1];
      if (last && last.jong === undefined) last.jong = JONG.ng;
      else syls.push({ cho: CHO.ng, jung: JUNG.eu, jong: JONG.ng });
      continue;
    }
    if (tok.kind === "c") {
      if (pending) {
        // stop consonants split with ㅡ before l/r clusters (gl → 글, tr → 트르)
        const cluster =
          (pending.letter === "k" || pending.letter === "p" || pending.letter === "t" || pending.letter === "d") &&
          tok.letter === "l";
        if (cluster || !flushPendingAsBatchim()) flushPendingAsSyllable();
      }
      pending = tok;
      continue;
    }
    // vowel
    const cho = pending?.code ?? CHO.ng;
    const jung = pending ? glideVowel(tok.code, pending) : tok.code;
    // intervocalic [l] is written ㄹㄹ (표기법) — close the previous open
    // syllable with ㄹ before starting the new one (Felix → 펠릭스)
    if (pending?.letter === "l") {
      const last = syls[syls.length - 1];
      if (last && last.jong === undefined) last.jong = JONG.l;
    }
    pending = null;
    syls.push({ cho, jung });
  }
  if (pending) {
    if (!flushPendingAsBatchim()) flushPendingAsSyllable();
  }
  const out = syls.map(compose).join("");
  return out || word;
}

const exceptionKey = (s: string): string => normalizeRoman(s).replace(/['-]/g, "");

/**
 * Transliterate a (possibly multi-word) player name. Exception table wins —
 * full name first, then per word — and the rule engine covers the rest.
 */
export function hangulPlayerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (/[가-힣]/.test(trimmed)) return trimmed; // already Korean
  const full = EXCEPTIONS[exceptionKey(trimmed)];
  if (full) return full;
  return trimmed
    .split(/\s+/)
    .map((w) => EXCEPTIONS[exceptionKey(w)] ?? romanWordToHangul(w))
    .join(" ");
}

/** Surname-style short form used by community/brief tones ("메리노"). */
export function hangulSurname(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  // "De Bruyne" style particles keep the two final words when the last is short
  return hangulPlayerName(last);
}
