import { describe, expect, it } from "vitest";
import { normalizeEventText, normalizePlayerName } from "../src/core/text.js";

describe("normalizeEventText", () => {
  it("collapses doubled spaces", () => {
    expect(
      normalizeEventText("BRUNO FERNANDES (포르투갈)  선수가 코너킥을 얻었습니다."),
    ).toBe("Bruno Fernandes (포르투갈) 선수가 코너킥을 얻었습니다.");
  });

  it("reattaches detached particles", () => {
    expect(normalizeEventText("포르투갈 의 골키퍼가 선방을 기록합니다.")).toBe(
      "포르투갈의 골키퍼가 선방을 기록합니다.",
    );
    expect(
      normalizeEventText("주심이 Bernardo Silva (포르투갈) 에게 경고 조치를 합니다."),
    ).toBe("주심이 Bernardo Silva (포르투갈)에게 경고 조치를 합니다.");
  });

  it("title-cases all-caps names inside multi-word runs", () => {
    expect(normalizeEventText("Lamine YAMAL (스페인) 선수가 파울을 범했습니다.")).toBe(
      "Lamine Yamal (스페인) 선수가 파울을 범했습니다.",
    );
    expect(normalizeEventText("JOAO CANCELO, 골문을 향해 슈팅을 시도합니다.")).toBe(
      "Joao Cancelo, 골문을 향해 슈팅을 시도합니다.",
    );
  });

  it("keeps standalone short acronyms untouched", () => {
    expect(normalizeEventText("VAR 판독 중")).toBe("VAR 판독 중");
    expect(normalizeEventText("(PSO 4-3)")).toBe("(PSO 4-3)");
  });

  it("title-cases standalone single-name players of 4+ letters", () => {
    expect(normalizeEventText("RODRI (스페인), 골문을 향해 슈팅을 시도합니다.")).toBe(
      "Rodri (스페인), 골문을 향해 슈팅을 시도합니다.",
    );
  });

  it("handles hyphenated and apostrophe names", () => {
    expect(normalizeEventText("Saad AL-OWAIS 심판이 경고를 줍니다")).toBe(
      "Saad Al-Owais 심판이 경고를 줍니다",
    );
  });
});

describe("normalizePlayerName", () => {
  it("title-cases even single all-caps words", () => {
    expect(normalizePlayerName("RONALDO")).toBe("Ronaldo");
    expect(normalizePlayerName("JOAO CANCELO")).toBe("Joao Cancelo");
  });

  it("leaves already-cased names alone", () => {
    expect(normalizePlayerName("Lamine Yamal")).toBe("Lamine Yamal");
  });
});
