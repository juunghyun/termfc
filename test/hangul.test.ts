import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hangulPlayerName,
  hangulSurname,
  romanWordToHangul,
} from "../src/core/hangul.js";

describe("romanWordToHangul (rule engine)", () => {
  it("converts common Latin-name shapes", () => {
    expect(romanWordToHangul("Merino")).toBe("메리노");
    expect(romanWordToHangul("Silva")).toBe("실바");
    expect(romanWordToHangul("Torres")).toBe("토레스");
    expect(romanWordToHangul("Yamal")).toBe("야말");
    expect(romanWordToHangul("Olmo")).toBe("올모");
    expect(romanWordToHangul("Pedri")).toBe("페드리");
    expect(romanWordToHangul("Felix")).toBe("펠릭스");
    expect(romanWordToHangul("Mendes")).toBe("멘데스");
  });

  it("is deterministic", () => {
    for (const w of ["Merino", "Xhaka", "Nusa", "Bernardo"]) {
      expect(romanWordToHangul(w)).toBe(romanWordToHangul(w));
    }
  });

  it("strips diacritics before converting", () => {
    expect(romanWordToHangul("Conceição")).toBe(romanWordToHangul("Conceicao"));
  });
});

describe("exception table", () => {
  it("pins well-known names the rules would get wrong", () => {
    expect(hangulPlayerName("João Cancelo")).toBe("주앙 칸셀루");
    expect(hangulSurname("Cristiano Ronaldo")).toBe("호날두");
    expect(hangulSurname("Kylian Mbappé")).toBe("음바페");
    expect(hangulSurname("Harry Kane")).toBe("케인");
    expect(hangulSurname("Granit Xhaka")).toBe("자카");
  });

  it("passes through names that are already Korean", () => {
    expect(hangulPlayerName("손흥민")).toBe("손흥민");
  });
});

describe("harmlessness over the demo corpus", () => {
  const demo = JSON.parse(
    readFileSync(join(__dirname, "..", "src", "data", "demo-match.json"), "utf8"),
  ) as { events: Array<{ player?: string; text?: string }> };

  const names = new Set<string>();
  for (const e of demo.events) if (e.player) names.add(e.player);

  it("covers every demo player name deterministically with Hangul-only output", () => {
    expect(names.size).toBeGreaterThan(10);
    for (const name of names) {
      const out = hangulSurname(name);
      expect(out.length).toBeGreaterThan(0);
      expect(out).toBe(hangulSurname(name));
      expect(/^[가-힣 ]+$/.test(out), `${name} → ${out}`).toBe(true);
    }
  });
});

describe("arbitrary latin input never throws and yields non-empty output", () => {
  it("handles odd shapes", () => {
    for (const w of ["N'Golo", "Saint-Maximin", "Ødegaard", "McTominay", "Van Dijk", "O'Riley"]) {
      const out = hangulPlayerName(w);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});
