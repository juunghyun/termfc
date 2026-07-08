import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Match } from "../src/core/model.js";
import { EspnProvider, parseEspnStage } from "../src/data/espn.js";

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
  it("emits structured events and never redistributes ESPN prose", async () => {
    mockFetch([[/summary/, fixture("espn-summary.json")]]);
    const events = await new EspnProvider().fetchTimeline(match, "ko");
    expect(events.length).toBeGreaterThan(50);

    const goal = events.find((e) => e.type === "GOAL")!;
    expect(goal.player).toBe("Mikel Merino");
    expect(goal.second).toBeDefined(); // ESPN gives second precision
    expect(goal.id).toMatch(/^espn:/);

    // license guard: the fixture's commentary text must never reach events
    // (sentences are rendered from structure at view time)
    expect(events.every((e) => e.text === undefined)).toBe(true);
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

describe("parseEspnStage (best-effort round/group hints)", () => {
  it("maps stage text to normalized rounds", () => {
    expect(parseEspnStage("round-of-16")).toEqual({ stageKind: "R16" });
    expect(parseEspnStage("Round of 32")).toEqual({ stageKind: "R32" });
    expect(parseEspnStage(undefined, "Quarterfinals")).toEqual({
      stageKind: "QF",
    });
    expect(parseEspnStage("Semifinal 1")).toEqual({ stageKind: "SF" });
    expect(parseEspnStage("Third place game")).toEqual({
      stageKind: "THIRD",
    });
    expect(parseEspnStage("Final")).toEqual({ stageKind: "FINAL" });
  });

  it("extracts the group letter and defaults safely", () => {
    expect(parseEspnStage("Group A - Matchday 2")).toEqual({
      stageKind: "GROUP",
      group: "A",
    });
    expect(parseEspnStage("group-stage")).toEqual({ stageKind: "GROUP" });
    expect(parseEspnStage("regular-season")).toEqual({});
    expect(parseEspnStage(undefined, undefined)).toEqual({});
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
