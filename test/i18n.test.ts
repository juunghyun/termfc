import { describe, expect, it } from "vitest";
import { enEventSentence } from "../src/core/i18n.js";

// Korean sentences are owned by the tone presets (see tone.test.ts /
// lexicon.test.ts) — i18n keeps the English single-register generator.
describe("enEventSentence templates", () => {
  it("generates English sentences with player and team", () => {
    expect(
      enEventSentence({ type: "RED" }, { player: "Ramos" }),
    ).toContain("sent off");
    expect(
      enEventSentence({ type: "GOAL" }, { player: "Son", team: "Korea Republic" }),
    ).toBe("Goal! Son (Korea Republic) scores!");
  });

  it("uses structured substitution and added-time facts", () => {
    expect(
      enEventSentence(
        { type: "SUBSTITUTION", playerIn: "Semedo", playerOut: "Mendes" },
        { team: "Portugal" },
      ),
    ).toBe("Substitution (Portugal): Semedo in, Mendes out");
    expect(enEventSentence({ type: "ADDED_TIME", injury: 4 })).toBe(
      "+4 minutes added",
    );
  });

  it("degrades gracefully without context", () => {
    expect(enEventSentence({ type: "GOAL" })).toBe("Goal!");
    expect(enEventSentence({ type: "UNKNOWN" })).toBe("Match event");
  });
});
