import { describe, expect, it } from "vitest";
import { normalizePlayerName } from "../src/core/text.js";

describe("normalizePlayerName", () => {
  it("title-cases all-caps words, including single names", () => {
    expect(normalizePlayerName("RONALDO")).toBe("Ronaldo");
    expect(normalizePlayerName("JOAO CANCELO")).toBe("Joao Cancelo");
    expect(normalizePlayerName("Mikel MERINO")).toBe("Mikel Merino");
  });

  it("handles hyphenated and apostrophe names", () => {
    expect(normalizePlayerName("Saad AL-OWAIS")).toBe("Saad Al-Owais");
    expect(normalizePlayerName("N'GOLO KANTE")).toBe("N'Golo Kante");
  });

  it("collapses doubled spaces and leaves cased names alone", () => {
    expect(normalizePlayerName("Lamine  Yamal")).toBe("Lamine Yamal");
    expect(normalizePlayerName("Lamine Yamal")).toBe("Lamine Yamal");
  });
});
