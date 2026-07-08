import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../src/core/model.js";
import { isTone, toneSentence } from "../src/core/tone.js";

const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({
  id: "fifa:1",
  type: "GOAL",
  minute: 90,
  source: "fifa",
  seq: 0,
  ...over,
});

describe("toneSentence — official", () => {
  it("renders a goal with roman name and score phrase", () => {
    const s = toneSentence(
      ev({ player: "Mikel MERINO", teamSide: "away" }),
      "official",
      { team: "스페인", score: { home: 0, away: 1 } },
    );
    expect(s).toBe("골! Mikel Merino! 스페인이 앞서갑니다 0:1");
  });

  it("marks an equaliser as 동점", () => {
    const s = toneSentence(
      ev({ player: "Mikel MERINO", teamSide: "away" }),
      "official",
      { team: "스페인", score: { home: 1, away: 1 } },
    );
    expect(s).toContain("동점입니다 1:1");
  });

  it("degrades gracefully without score or player", () => {
    expect(toneSentence(ev({ player: "Mikel MERINO" }), "official")).toBe(
      "골! Mikel Merino!",
    );
    expect(toneSentence(ev({}), "official")).toBe("골이 들어갑니다!");
  });

  it("uses josa by batchim (팀명 받침)", () => {
    const s = toneSentence(
      ev({ player: "Harry KANE", teamSide: "home" }),
      "official",
      { team: "잉글랜드", score: { home: 1, away: 0 } },
    );
    expect(s).toContain("잉글랜드가 앞서갑니다");
    const s2 = toneSentence(
      ev({ player: "Lionel MESSI", teamSide: "home" }),
      "official",
      { team: "아르헨티나", score: { home: 1, away: 0 } },
    );
    expect(s2).toContain("아르헨티나가 앞서갑니다");
    const s3 = toneSentence(
      ev({ player: "Kylian MBAPPE", teamSide: "home" }),
      "official",
      { team: "독일", score: { home: 1, away: 0 } },
    );
    expect(s3).toContain("독일이 앞서갑니다");
  });

  it("renders substitutions from structured in/out facts", () => {
    const s = toneSentence(
      ev({
        type: "SUBSTITUTION",
        player: undefined,
        playerIn: "NELSON SEMEDO",
        playerOut: "NUNO MENDES",
      }),
      "official",
      { team: "포르투갈" },
    );
    expect(s).toBe("교체 (포르투갈): Nelson Semedo 투입, Nuno Mendes 아웃");
  });

  it("renders added time from the injury fact", () => {
    expect(
      toneSentence(ev({ type: "ADDED_TIME", player: undefined, injury: 4 }), "official"),
    ).toBe("추가시간 +4분");
    expect(
      toneSentence(ev({ type: "ADDED_TIME", player: undefined }), "official"),
    ).toBe("추가시간이 표시됩니다");
  });
});

describe("toneSentence — community", () => {
  it("uses hangul surnames", () => {
    const s = toneSentence(
      ev({ player: "Mikel MERINO", teamSide: "away" }),
      "community",
      { team: "스페인", score: { home: 0, away: 1 } },
    );
    expect(s).toContain("메리노");
    expect(s).toContain("골!!!");
    expect(s).not.toContain("Merino");
  });

  it("keeps sensitive events neutral (no laughter, no mockery)", () => {
    for (const type of ["OWN_GOAL", "PENALTY_MISS", "RED"] as const) {
      const s = toneSentence(
        ev({ type, player: "Joao FELIX", teamSide: "home" }),
        "community",
        { team: "포르투갈" },
      );
      expect(s).not.toMatch(/ㅋ|ㄷ|!{2,}/);
    }
  });
});

describe("toneSentence — brief", () => {
  it("is minimal with score", () => {
    expect(
      toneSentence(ev({ player: "Mikel MERINO", teamSide: "away" }), "brief", {
        team: "스페인",
        score: { home: 0, away: 1 },
      }),
    ).toBe("메리노 (0:1)");
    expect(
      toneSentence(
        ev({ type: "YELLOW", player: "Bernardo SILVA", teamSide: "home" }),
        "brief",
      ),
    ).toBe("실바");
    expect(
      toneSentence(
        ev({
          type: "SUBSTITUTION",
          player: undefined,
          playerIn: "Fabian RUIZ",
          playerOut: "PEDRI",
        }),
        "brief",
      ),
    ).toBe("루이스 ↔ 페드리");
  });
});

describe("isTone (config/flag validation)", () => {
  it("accepts only the three known tones — unknown values degrade upstream", () => {
    expect(isTone("official")).toBe(true);
    expect(isTone("community")).toBe(true);
    expect(isTone("brief")).toBe(true);
    expect(isTone("spicy")).toBe(false);
    expect(isTone("")).toBe(false);
    expect(isTone(undefined)).toBe(false);
  });
});

describe("determinism", () => {
  it("same event id → same variant, different ids may differ", () => {
    const base = ev({ player: "Mikel OYARZABAL", type: "SHOT", teamSide: "away" });
    const a1 = toneSentence(base, "community", { team: "스페인" });
    const a2 = toneSentence(base, "community", { team: "스페인" });
    expect(a1).toBe(a2);

    const ids = ["fifa:1", "fifa:2", "fifa:3", "fifa:4", "fifa:5", "fifa:6"];
    const outs = new Set(
      ids.map((id) =>
        toneSentence({ ...base, id }, "community", { team: "스페인" }),
      ),
    );
    expect(outs.size).toBeGreaterThan(1); // variant pool actually used
  });
});
