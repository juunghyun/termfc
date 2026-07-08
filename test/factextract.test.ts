import { describe, expect, it } from "vitest";
import {
  addedTimeFrom,
  assistPlayerFrom,
  leadingPlayerFrom,
  subPlayersFrom,
} from "../src/core/factextract.js";

describe("subPlayersFrom", () => {
  it("parses the live FIFA ko sentence", () => {
    expect(
      subPlayersFrom(
        "NELSON SEMEDO (in) 선수가 NUNO MENDES(교체)(포르투갈) 선수 대신 교체되어 경기장에 들어갑니다.",
      ),
    ).toEqual({ playerIn: "NELSON SEMEDO", playerOut: "NUNO MENDES" });
  });

  it("parses the live FIFA en sentence", () => {
    expect(
      subPlayersFrom(
        "NELSON SEMEDO (in) comes off the bench to replace NUNO MENDES (out) (Portugal)",
      ),
    ).toEqual({ playerIn: "NELSON SEMEDO", playerOut: "NUNO MENDES" });
  });

  it("parses the v0.3 synthetic sentence (old recordings)", () => {
    expect(
      subPlayersFrom("선수 교체 (포르투갈): NELSON SEMEDO IN, NUNO MENDES OUT"),
    ).toEqual({ playerIn: "NELSON SEMEDO", playerOut: "NUNO MENDES" });
  });

  it("returns undefined for unrelated text", () => {
    expect(subPlayersFrom("파울")).toBeUndefined();
    expect(subPlayersFrom(undefined)).toBeUndefined();
  });
});

describe("assistPlayerFrom", () => {
  it("parses ko/en/synthetic shapes", () => {
    expect(assistPlayerFrom("Ferran TORRES 선수의 어시스트입니다.")).toBe(
      "Ferran TORRES",
    );
    expect(assistPlayerFrom("Assisted by Ferran TORRES.")).toBe("Ferran TORRES");
    expect(assistPlayerFrom("어시스트: Ferran TORRES")).toBe("Ferran TORRES");
  });

  it("returns undefined otherwise", () => {
    expect(assistPlayerFrom("골!")).toBeUndefined();
  });
});

describe("addedTimeFrom", () => {
  it("parses ko and en added-time sentences", () => {
    expect(addedTimeFrom("추가시간 +4분")).toBe(4);
    expect(addedTimeFrom("+3 minutes added")).toBe(3);
    expect(addedTimeFrom("경기 재개")).toBeUndefined();
  });
});

describe("leadingPlayerFrom", () => {
  it("extracts the leading PLAYER (TEAM) name", () => {
    expect(leadingPlayerFrom("Lamine YAMAL (스페인) 파울")).toBe("Lamine YAMAL");
    expect(leadingPlayerFrom("골!")).toBeUndefined();
  });
});
