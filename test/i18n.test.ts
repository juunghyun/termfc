import { describe, expect, it } from "vitest";
import { eventSentence } from "../src/core/i18n.js";

describe("eventSentence templates", () => {
  it("generates Korean sentences with player and team", () => {
    expect(
      eventSentence({ type: "GOAL" }, "ko", {
        player: "손흥민",
        team: "대한민국",
      }),
    ).toBe("골! 손흥민 (대한민국) 득점!");
    expect(eventSentence({ type: "CORNER" }, "ko", { team: "대한민국" })).toBe(
      "대한민국 코너킥",
    );
  });

  it("generates English sentences", () => {
    expect(
      eventSentence({ type: "RED" }, "en", { player: "Ramos" }),
    ).toContain("sent off");
  });

  it("degrades gracefully without context", () => {
    expect(eventSentence({ type: "GOAL" }, "ko")).toBe("골!");
    expect(eventSentence({ type: "UNKNOWN" }, "en")).toBe("Match event");
  });
});
