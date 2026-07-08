/**
 * Content-policy gate (requirements §3-4). Three layers:
 *   1. static scan of every template string in the exported tables
 *   2. rendered-output matrix: every tone × every event type × representative
 *      fact contexts, scanned AFTER transliteration (final sentences)
 *   3. structural gate: community sentences for sensitive events must come
 *      from COMMUNITY_NEUTRAL and carry no exclamation/mockery
 *
 * ANY template edit in src/core/tone.ts must keep this file green — that is
 * the mechanism by which future template additions inherit the policy.
 */
import { describe, expect, it } from "vitest";
import { ALL_EVENT_TYPES, type Score, type TimelineEvent } from "../src/core/model.js";
import {
  COMMUNITY_NEUTRAL,
  SCORE_PHRASES,
  SENSITIVE_TYPES,
  TONES,
  TONE_TEMPLATES,
  toneSentence,
  type ToneForms,
} from "../src/core/tone.js";
import { BANNED_EVERYWHERE, BANNED_IN_SENSITIVE } from "./fixtures/banned-lexicon.js";

const allTemplateStrings = (): string[] => {
  const out: string[] = [];
  const collect = (forms: ToneForms | undefined) => {
    if (!forms) return;
    for (const pool of [forms.full, forms.team, forms.bare])
      if (pool) out.push(...pool);
  };
  for (const tone of TONES)
    for (const type of ALL_EVENT_TYPES) collect(TONE_TEMPLATES[tone][type]);
  for (const type of Object.keys(COMMUNITY_NEUTRAL))
    collect(COMMUNITY_NEUTRAL[type as keyof typeof COMMUNITY_NEUTRAL]);
  out.push(...Object.values(SCORE_PHRASES));
  return out;
};

describe("layer 1 — every template string is clean", () => {
  it("contains no banned expression", () => {
    for (const tpl of allTemplateStrings()) {
      for (const banned of BANNED_EVERYWHERE) {
        expect(tpl.includes(banned), `template "${tpl}" contains "${banned}"`).toBe(
          false,
        );
      }
    }
  });
});

// Representative fact contexts: with/without player (roman names that
// transliterate), team names with/without 받침, score lead/tie/behind,
// substitution facts, added-time amount, period codes.
const PLAYERS = [undefined, "Mikel MERINO", "Harry KANE", "N'Golo KANTE"];
const TEAMS = [undefined, "스페인", "독일", "잉글랜드", "포르투갈"];
const SCORES: Array<Score | undefined> = [
  undefined,
  { home: 0, away: 1 },
  { home: 1, away: 1 },
  { home: 3, away: 1 },
];

const contextsFor = (type: (typeof ALL_EVENT_TYPES)[number]) => {
  const events: Array<{ e: TimelineEvent; team?: string; score?: Score }> = [];
  let n = 0;
  for (const player of PLAYERS)
    for (const team of TEAMS)
      for (const score of SCORES)
        for (const teamSide of ["home", "away"] as const) {
          events.push({
            e: {
              id: `t:${n++}`,
              type,
              minute: 90,
              period: [3, 5, 7, 9, undefined][n % 5],
              teamSide,
              player,
              ...(type === "SUBSTITUTION"
                ? { playerIn: "Fabian RUIZ", playerOut: "PEDRI" }
                : {}),
              ...(type === "ADDED_TIME" ? { injury: (n % 6) + 1 } : {}),
              source: "fifa",
              seq: 0,
            },
            team,
            score,
          });
        }
  return events;
};

describe("layer 2 — rendered output matrix is clean and non-empty", () => {
  for (const tone of TONES) {
    it(`tone=${tone}: every type × context`, () => {
      for (const type of ALL_EVENT_TYPES) {
        for (const { e, team, score } of contextsFor(type)) {
          const s = toneSentence(e, tone, { team, score });
          expect(s.length, `${tone}/${type} produced empty output`).toBeGreaterThan(0);
          for (const banned of BANNED_EVERYWHERE) {
            expect(
              s.includes(banned),
              `${tone}/${type} → "${s}" contains "${banned}"`,
            ).toBe(false);
          }
        }
      }
    });
  }
});

describe("layer 3 — sensitive events stay neutral in community tone", () => {
  it("community table entries for sensitive types ARE the neutral subset", () => {
    for (const type of SENSITIVE_TYPES) {
      expect(
        TONE_TEMPLATES.community[type],
        `community[${type}] must reference COMMUNITY_NEUTRAL`,
      ).toBe(COMMUNITY_NEUTRAL[type]);
    }
  });

  it("sensitive community output carries no exclamation burst or mockery", () => {
    for (const type of SENSITIVE_TYPES) {
      for (const { e, team, score } of contextsFor(type)) {
        const s = toneSentence(e, "community", { team, score });
        for (const banned of [...BANNED_EVERYWHERE, ...BANNED_IN_SENSITIVE]) {
          expect(
            s.includes(banned),
            `community/${type} → "${s}" contains "${banned}"`,
          ).toBe(false);
        }
      }
    }
  });
});
