/**
 * Tone presets — every commentary sentence a user can see is assembled here
 * from structured event facts, at render time. Three tones: official
 * (broadcast register, roman player names), community (light Korean fan
 * register, hangul surnames), brief (widget-minimal).
 *
 * Content policy (requirements §3): all templates live in the exported
 * tables below so the banned-lexicon test can scan every sentence form.
 * Emotion always targets the situation, never the person. Sensitive events
 * (own goal / penalty miss / red card) draw community sentences only from
 * COMMUNITY_NEUTRAL. Template edits must keep the lexicon gate green.
 */
import { hangulSurname } from "./hangul.js";
import type { EventType, Score, TimelineEvent } from "./model.js";
import { normalizePlayerName } from "./text.js";

export type Tone = "official" | "community" | "brief";
export const TONES = ["official", "community", "brief"] as const satisfies readonly Tone[];

export function isTone(v: unknown): v is Tone {
  return v === "official" || v === "community" || v === "brief";
}

/**
 * Template forms per event type. `full` needs the type's primary facts
 * (player / in+out / added minutes), `team` needs a team name, `bare` always
 * resolves. Placeholders: {p} {t} {s} {in} {out} {n} {per} {sp}, optional
 * josa suffix `{t:이가}`, optional group `[ ... ]` kept only when every
 * placeholder inside resolves.
 */
export interface ToneForms {
  full?: readonly string[];
  team?: readonly string[];
  bare: readonly string[];
}

type ToneTable = Record<EventType, ToneForms>;

const OFFICIAL: ToneTable = {
  GOAL: { full: ["골! {p}![ {sp}]"], bare: ["골이 들어갑니다![ {sp}]"] },
  OWN_GOAL: { full: ["{p}의 자책골입니다[ {sp}]"], bare: ["자책골입니다[ {sp}]"] },
  PENALTY_GOAL: { full: ["{p}, 페널티킥을 성공시킵니다[ {sp}]"], bare: ["페널티킥 성공[ {sp}]"] },
  PENALTY_MISS: { full: ["{p}, 페널티킥을 성공시키지 못합니다"], bare: ["페널티킥 실패"] },
  ASSIST: { full: ["어시스트: {p}"], bare: ["어시스트가 기록됩니다"] },
  SHOT: { full: ["{p}의 슈팅"], team: ["{t}의 슈팅 시도"], bare: ["슈팅 시도"] },
  SAVE: { team: ["{t} 골키퍼가 막아냅니다"], bare: ["골키퍼 선방"] },
  FOUL: { full: ["{p}의 파울"], team: ["{t}의 파울"], bare: ["파울"] },
  YELLOW: { full: ["{p}, 경고를 받습니다"], team: ["{t}에 경고가 나옵니다"], bare: ["경고 (옐로카드)"] },
  RED: { full: ["{p}, 퇴장당합니다 (레드카드)"], team: ["{t}에서 퇴장자가 나옵니다"], bare: ["퇴장 (레드카드)"] },
  CORNER: { full: ["{p}의 코너킥"], team: ["{t} 코너킥"], bare: ["코너킥"] },
  OFFSIDE: { full: ["{p}, 오프사이드입니다"], team: ["{t} 오프사이드"], bare: ["오프사이드"] },
  SUBSTITUTION: {
    full: ["교체 ({t}): {in} 투입, {out} 아웃", "교체: {in} 투입, {out} 아웃"],
    team: ["{t} 선수 교체"],
    bare: ["선수 교체"],
  },
  VAR: { bare: ["VAR 판독이 진행됩니다"] },
  PERIOD_START: { bare: ["{per} 시작"] },
  PERIOD_END: { bare: ["{per} 종료"] },
  FULLTIME: { bare: ["경기 종료"] },
  COIN_TOSS: { team: ["동전 던지기 — {t} 선축"], bare: ["동전 던지기"] },
  BREAK: { bare: ["경기가 잠시 중단됩니다 (수분 섭취)"] },
  RESUMED: { bare: ["경기 재개"] },
  ADDED_TIME: { full: ["추가시간 +{n}분"], bare: ["추가시간이 표시됩니다"] },
  UNKNOWN: { bare: ["경기 상황"] },
};

/**
 * Sensitive events stay neutral in every tone — no exclamation at a person,
 * no mockery (content policy §3-3). Community draws these from this table
 * only; the lexicon test pins that structurally.
 */
export const SENSITIVE_TYPES: ReadonlySet<EventType> = new Set([
  "OWN_GOAL",
  "PENALTY_MISS",
  "RED",
]);

export const COMMUNITY_NEUTRAL: Partial<Record<EventType, ToneForms>> = {
  OWN_GOAL: {
    full: ["{p}의 자책골이 나왔습니다... 이런 장면은 아프네요"],
    bare: ["자책골이 나왔습니다..."],
  },
  PENALTY_MISS: {
    full: ["{p} 페널티킥 실축... 아쉽습니다"],
    bare: ["페널티킥 실축... 아쉽네요"],
  },
  RED: {
    full: ["{p} 퇴장입니다... 남은 시간 수적 열세네요"],
    team: ["{t}에서 퇴장이 나왔습니다..."],
    bare: ["퇴장이 나왔습니다..."],
  },
};

const COMMUNITY: ToneTable = {
  GOAL: {
    full: [
      "{p} 골!!! 이 시간에 터지네요",
      "{p} 골!!! 드디어 터집니다",
      "{p} 골!!! 제대로 꽂아넣습니다",
    ],
    bare: ["골!!! 터졌습니다"],
  },
  OWN_GOAL: COMMUNITY_NEUTRAL.OWN_GOAL!,
  PENALTY_GOAL: {
    full: ["{p} 페널티킥 성공! 침착했습니다"],
    bare: ["페널티킥 성공! 침착하네요"],
  },
  PENALTY_MISS: COMMUNITY_NEUTRAL.PENALTY_MISS!,
  ASSIST: { full: ["어시스트는 {p}"], bare: ["어시스트까지 깔끔했네요"] },
  SHOT: {
    full: ["{p} 슛! 아깝네요", "{p} 때려봅니다!", "{p} 슛! 이번엔 빗나갑니다"],
    team: ["{t} 슈팅 기회!"],
    bare: ["슛! 아깝습니다"],
  },
  SAVE: {
    team: ["{t} 골키퍼 선방! 좋았습니다", "{t} 골키퍼가 잘 막아냅니다"],
    bare: ["키퍼 선방! 좋네요"],
  },
  FOUL: {
    full: ["{p} 파울이네요", "{p} 파울, 성급했습니다"],
    team: ["{t} 파울"],
    bare: ["파울이네요"],
  },
  YELLOW: {
    full: ["{p} 카드 받았네요, 급했습니다", "{p} 옐로카드, 조심해야겠는데요"],
    team: ["{t}에 카드가 나옵니다"],
    bare: ["옐로카드 나옵니다"],
  },
  RED: COMMUNITY_NEUTRAL.RED!,
  CORNER: {
    full: ["{p} 코너킥 준비합니다"],
    team: ["{t} 코너킥 기회!"],
    bare: ["코너킥 기회"],
  },
  OFFSIDE: {
    full: ["{p} 오프사이드네요, 타이밍이 빨랐습니다"],
    team: ["{t} 오프사이드"],
    bare: ["오프사이드네요"],
  },
  SUBSTITUTION: {
    full: ["교체 카드 ({t}) — {in} 들어가고 {out} 나옵니다", "교체 카드 — {in} 들어가고 {out} 나옵니다"],
    team: ["{t} 교체 카드 꺼냅니다"],
    bare: ["선수 교체입니다"],
  },
  VAR: { bare: ["VAR 봅니다... 떨리네요"] },
  PERIOD_START: { bare: ["{per} 시작합니다!"] },
  PERIOD_END: { bare: ["{per} 끝! 잠시 쉬어갑니다"] },
  FULLTIME: { bare: ["경기 끝! 수고하셨습니다"] },
  COIN_TOSS: { team: ["동전 던지기는 {t} — 선축 가져갑니다"], bare: ["동전 던지기"] },
  BREAK: { bare: ["수분 타임! 잠시 쉬어갑니다"] },
  RESUMED: { bare: ["다시 갑니다!"] },
  ADDED_TIME: { full: ["추가시간 +{n}분! 끝까지 갑니다"], bare: ["추가시간 들어갑니다"] },
  UNKNOWN: { bare: ["경기 상황"] },
};

const BRIEF: ToneTable = {
  GOAL: { full: ["{p}[ ({s})]"], bare: ["골[ ({s})]"] },
  OWN_GOAL: { full: ["{p} 자책골[ ({s})]"], bare: ["자책골[ ({s})]"] },
  PENALTY_GOAL: { full: ["{p} PK골[ ({s})]"], bare: ["PK골[ ({s})]"] },
  PENALTY_MISS: { full: ["{p} PK 실축"], bare: ["PK 실축"] },
  ASSIST: { full: ["도움 {p}"], bare: ["도움"] },
  SHOT: { full: ["{p} 슛"], team: ["{t} 슛"], bare: ["슛"] },
  SAVE: { team: ["{t} 선방"], bare: ["선방"] },
  FOUL: { full: ["{p} 파울"], team: ["{t} 파울"], bare: ["파울"] },
  YELLOW: { full: ["{p}"], team: ["{t} 경고"], bare: ["경고"] },
  RED: { full: ["{p} 퇴장"], team: ["{t} 퇴장"], bare: ["퇴장"] },
  CORNER: { full: ["{p} CK"], team: ["{t} CK"], bare: ["CK"] },
  OFFSIDE: { full: ["{p} 오프사이드"], team: ["{t} 오프사이드"], bare: ["오프사이드"] },
  SUBSTITUTION: { full: ["{in} ↔ {out}"], team: ["{t} 교체"], bare: ["교체"] },
  VAR: { bare: ["VAR"] },
  PERIOD_START: { bare: ["{per} 시작"] },
  PERIOD_END: { bare: ["{per} 종료"] },
  FULLTIME: { full: ["FT {s}"], bare: ["FT"] },
  COIN_TOSS: { team: ["{t} 선축"], bare: ["동전 던지기"] },
  BREAK: { bare: ["중단"] },
  RESUMED: { bare: ["재개"] },
  ADDED_TIME: { full: ["+{n}'"], bare: ["추가시간"] },
  UNKNOWN: { bare: ["경기 상황"] },
};

export const TONE_TEMPLATES: Record<Tone, ToneTable> = {
  official: OFFICIAL,
  community: COMMUNITY,
  brief: BRIEF,
};

/** Official-tone goal score phrases, keyed by the scorer's standing. */
export const SCORE_PHRASES = {
  lead: "{t:이가} 앞서갑니다 {s}",
  tie: "동점입니다 {s}",
  behind: "{t:이가} 추격합니다 {s}",
  plain: "스코어 {s}",
} as const;

/** FIFA period code → Korean label. */
export function periodLabel(period: number | undefined): string | undefined {
  switch (period) {
    case 3: return "전반";
    case 5: return "후반";
    case 7: return "연장 전반";
    case 9: return "연장 후반";
    default: return undefined;
  }
}

/** Deterministic variant pick — FNV-1a over the stable event id. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 받침 유무에 따른 조사 선택. Latin/unknown endings take the vowel form. */
function josa(word: string, withBatchim: string, without: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) {
    return (ch - 0xac00) % 28 > 0 ? withBatchim : without;
  }
  return without;
}

type Facts = Record<string, string | undefined>;

const PLACEHOLDER = /\{(p|t|s|in|out|n|per|sp)(?::(.)(.))?\}/g;

/** Fill a template; null when a mandatory placeholder has no fact. */
function fill(tpl: string, facts: Facts): string | null {
  // optional groups: kept only when everything inside resolves
  const withOptionals = tpl.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    const resolved = fill(inner, facts);
    return resolved ?? "";
  });
  let missing = false;
  const out = withOptionals.replace(
    PLACEHOLDER,
    (_, key: string, j1?: string, j2?: string) => {
      const v = facts[key];
      if (v === undefined || v === "") {
        missing = true;
        return "";
      }
      return j1 && j2 ? v + josa(v, j1, j2) : v;
    },
  );
  return missing ? null : out;
}

export interface ToneCtx {
  /** Display name of the event's team (already localized). */
  team?: string;
  /** Score at the moment of the event (for goal/full-time sentences). */
  score?: Score;
}

function displayPlayer(raw: string | undefined, tone: Tone): string | undefined {
  if (!raw) return undefined;
  const norm = normalizePlayerName(raw);
  return tone === "official" ? norm : hangulSurname(norm);
}

function scorePhrase(
  e: Pick<TimelineEvent, "teamSide">,
  ctx: ToneCtx,
): string | undefined {
  const s = ctx.score;
  if (!s) return undefined;
  const scoreStr = `${s.home}:${s.away}`;
  const facts: Facts = { t: ctx.team, s: scoreStr };
  if (!e.teamSide || !ctx.team) return fill(SCORE_PHRASES.plain, facts) ?? undefined;
  const mine = e.teamSide === "home" ? s.home : s.away;
  const theirs = e.teamSide === "home" ? s.away : s.home;
  const tpl =
    mine > theirs
      ? SCORE_PHRASES.lead
      : mine === theirs
        ? SCORE_PHRASES.tie
        : SCORE_PHRASES.behind;
  return fill(tpl, facts) ?? undefined;
}

/**
 * Render one event as a sentence in the given tone. Pure and deterministic:
 * the same event + tone + ctx always produce the same sentence (variant
 * choice hashes the stable event id).
 */
export function toneSentence(
  e: Pick<
    TimelineEvent,
    "type" | "id" | "teamSide" | "player" | "playerIn" | "playerOut" | "injury" | "period"
  >,
  tone: Tone,
  ctx: ToneCtx = {},
): string {
  const forms = TONE_TEMPLATES[tone][e.type] ?? TONE_TEMPLATES[tone].UNKNOWN;
  const facts: Facts = {
    p: displayPlayer(e.player, tone),
    t: ctx.team,
    s: ctx.score ? `${ctx.score.home}:${ctx.score.away}` : undefined,
    in: displayPlayer(e.playerIn, tone),
    out: displayPlayer(e.playerOut, tone),
    n: e.type === "ADDED_TIME" && e.injury ? String(e.injury) : undefined,
    per: periodLabel(e.period),
    sp: tone === "official" ? scorePhrase(e, ctx) : undefined,
  };
  const hash = fnv1a(e.id);
  for (const pool of [forms.full, forms.team, forms.bare]) {
    if (!pool || pool.length === 0) continue;
    const start = hash % pool.length;
    for (let i = 0; i < pool.length; i++) {
      const s = fill(pool[(start + i) % pool.length]!, facts);
      if (s !== null) return s.replace(/\s{2,}/g, " ").trim();
    }
  }
  return "경기 진행";
}
