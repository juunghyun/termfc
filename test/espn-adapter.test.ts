import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Match } from "../src/core/model.js";
import { EspnProvider } from "../src/data/espn.js";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

afterEach(() => vi.unstubAllGlobals());

function mockFetch(routes: Array<[RegExp, string]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      for (const [re, body] of routes) {
        if (re.test(String(url))) return new Response(body, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

const match: Match = {
  id: "760506",
  stage: "round-of-16",
  kickoff: "2026-07-06T19:00:00Z",
  home: { code: "POR", name: "포르투갈", flag: "🇵🇹" },
  away: { code: "ESP", name: "스페인", flag: "🇪🇸" },
  score: { home: 0, away: 0 },
  phase: "FINISHED",
  sourceRefs: { espn: { eventId: "760506" } },
};

describe("EspnProvider.fetchTimeline (real summary fixture)", () => {
  it("generates template sentences instead of redistributing ESPN prose", async () => {
    mockFetch([[/summary/, fixture("espn-summary.json")]]);
    const events = await new EspnProvider().fetchTimeline(match, "ko");
    expect(events.length).toBeGreaterThan(50);

    const goal = events.find((e) => e.type === "GOAL")!;
    expect(goal.player).toBe("Mikel Merino");
    expect(goal.text).toContain("득점"); // our Korean template
    expect(goal.text).not.toContain("left footed shot"); // not ESPN's prose
    expect(goal.second).toBeDefined(); // ESPN gives second precision
    expect(goal.id).toMatch(/^espn:/);

    const en = await new EspnProvider().fetchTimeline(match, "en");
    const goalEn = en.find((e) => e.type === "GOAL")!;
    expect(goalEn.text).toMatch(/scores/i);
    expect(goalEn.text).not.toContain("bottom left corner");
  });
});

describe("EspnProvider.fetchSchedule (real scoreboard fixture)", () => {
  it("normalizes scoreboard events with refs and scores", async () => {
    mockFetch([[/scoreboard/, fixture("espn-scoreboard.json")]]);
    const matches = await new EspnProvider().fetchSchedule("ko");
    const porEsp = matches.find((m) => m.id === "760506")!;
    expect(porEsp.sourceRefs.espn?.eventId).toBe("760506");
    expect(porEsp.score).toEqual({ home: 0, away: 1 });
    expect(porEsp.phase).toBe("FINISHED");
  });

  it("filters events without competitors instead of crashing", async () => {
    const doc = JSON.parse(fixture("espn-scoreboard.json"));
    doc.events.push({ id: "999", competitions: [{}] });
    mockFetch([[/scoreboard/, JSON.stringify(doc)]]);
    const matches = await new EspnProvider().fetchSchedule("ko");
    expect(matches.find((m) => m.id === "999")).toBeUndefined();
  });

  it("throws SchemaError on malformed payloads", async () => {
    mockFetch([[/scoreboard/, JSON.stringify({ events: {} })]]);
    await expect(new EspnProvider().fetchSchedule("ko")).rejects.toThrow(
      /scoreboard/,
    );
    mockFetch([[/summary/, JSON.stringify({ commentary: {} })]]);
    await expect(
      new EspnProvider().fetchTimeline(match, "ko"),
    ).rejects.toThrow(/commentary/);
  });
});

describe("EspnProvider.fetchMatchState (real scoreboard fixture)", () => {
  it("reads clock seconds and phase from the scoreboard", async () => {
    mockFetch([[/scoreboard/, fixture("espn-scoreboard.json")]]);
    const state = await new EspnProvider().fetchMatchState(match, "ko");
    expect(state).not.toBeNull();
    expect(state!.phase).toBe("FINISHED");
    expect(state!.score).toEqual({ home: 0, away: 1 });
    expect(state!.minute).toBeGreaterThanOrEqual(90);
  });
});
