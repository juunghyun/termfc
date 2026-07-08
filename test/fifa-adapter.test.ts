import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Match } from "../src/core/model.js";
import { FifaProvider } from "../src/data/fifa.js";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

function mockFetch(routes: Array<[RegExp, string]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      for (const [re, body] of routes) {
        if (re.test(String(url)))
          return new Response(body, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

const matchFixture = JSON.parse(fixture("fifa-match-finished.json"));
const match: Match = {
  id: "400021529",
  stage: "Round of 16",
  kickoff: "2026-07-06T19:00:00Z",
  home: { code: "POR", name: "포르투갈", flag: "🇵🇹" },
  away: { code: "ESP", name: "스페인", flag: "🇪🇸" },
  score: { home: 0, away: 0 },
  phase: "FINISHED",
  sourceRefs: {
    fifa: {
      idCompetition: "17",
      idSeason: "285023",
      idStage: "289288",
      idMatch: "400021529",
      idHomeTeam: String(matchFixture.Home.IdTeam),
      idAwayTeam: String(matchFixture.Away.IdTeam),
    } as never,
  },
};

describe("FifaProvider.fetchTimeline (real 2026 fixture)", () => {
  it("normalizes the Korean timeline with the verified event map", async () => {
    mockFetch([[/timelines/, fixture("fifa-timeline-ko.json")]]);
    const events = await new FifaProvider().fetchTimeline(match, "ko");
    expect(events).toHaveLength(88);

    const goal = events.find((e) => e.type === "GOAL");
    expect(goal).toBeDefined();
    expect(goal!.minute).toBe(90);
    expect(goal!.injury).toBe(1);
    expect(goal!.teamSide).toBe("away"); // Spain scored
    expect(goal!.player).toBe("Mikel MERINO");
    expect(goal!.scoreAfter).toEqual({ home: 0, away: 1 });
    expect(goal!.id).toMatch(/^fifa:/);
  });

  it("never emits feed prose — text is absent, facts are structured", async () => {
    mockFetch([[/timelines/, fixture("fifa-timeline-ko.json")]]);
    const events = await new FifaProvider().fetchTimeline(match, "ko");
    // sentences are rendered from structure at view time; the adapter must
    // not leak the feed's prose into events (or, via them, into recordings)
    expect(events.every((e) => e.text === undefined)).toBe(true);

    const sub = events.find((e) => e.type === "SUBSTITUTION");
    expect(sub!.playerIn).toBe("NELSON SEMEDO");
    expect(sub!.playerOut).toBe("NUNO MENDES");

    const assist = events.find((e) => e.type === "ASSIST");
    expect(assist!.player).toBe("Ferran TORRES");

    const corner = events.find((e) => e.type === "CORNER");
    expect(corner!.player).toBe("BRUNO FERNANDES");
  });

  it("passes unknown type codes through as UNKNOWN without text", async () => {
    const doc = JSON.parse(fixture("fifa-timeline-ko.json"));
    doc.Event[0].Type = 9999;
    mockFetch([[/timelines/, JSON.stringify(doc)]]);
    const events = await new FifaProvider().fetchTimeline(match, "ko");
    expect(events[0]!.type).toBe("UNKNOWN");
    expect(events[0]!.text).toBeUndefined();
  });

  it("maps VAR review events via the data-file map", async () => {
    const doc = JSON.parse(fixture("fifa-timeline-ko.json"));
    doc.Event[1].Type = 71; // "Goal disallowed" family
    mockFetch([[/timelines/, JSON.stringify(doc)]]);
    const events = await new FifaProvider().fetchTimeline(match, "ko");
    expect(events[1]!.type).toBe("VAR");
  });

  it("throws SchemaError on malformed payloads", async () => {
    mockFetch([[/timelines/, JSON.stringify({ nope: true })]]);
    await expect(
      new FifaProvider().fetchTimeline(match, "ko"),
    ).rejects.toThrow(/timeline/);
    mockFetch([[/calendar\/matches/, JSON.stringify({ Results: {} })]]);
    await expect(new FifaProvider().fetchSchedule("ko")).rejects.toThrow(
      /calendar/,
    );
  });
});

describe("FifaProvider.fetchMatchState", () => {
  it("carries penalty shoot-out scores through normalization", async () => {
    const doc = { ...matchFixture, HomeTeamPenaltyScore: 3, AwayTeamPenaltyScore: 4 };
    mockFetch([
      [/live\/football\/now/, JSON.stringify({ Results: [] })],
      [/calendar\/matches/, JSON.stringify({ Results: [doc] })],
    ]);
    const state = await new FifaProvider().fetchMatchState(match, "ko");
    expect(state!.score.penHome).toBe(3);
    expect(state!.score.penAway).toBe(4);
  });

  it("falls back to the calendar window when the live endpoint dies", async () => {
    mockFetch([
      // live endpoint unmatched -> 404 from the mock
      [/calendar\/matches/, JSON.stringify({ Results: [matchFixture] })],
    ]);
    const state = await new FifaProvider().fetchMatchState(match, "ko");
    expect(state).not.toBeNull();
    expect(state!.phase).toBe("FINISHED");
    expect(state!.score).toMatchObject({ home: 0, away: 1 });
    expect(state!.minute).toBe(99);
  });
});

describe("FifaProvider.fetchSchedule (real calendar fixture)", () => {
  it("normalizes matches with phases, flags and source refs", async () => {
    mockFetch([[/calendar\/matches/, fixture("fifa-calendar-sample.json")]]);
    const matches = await new FifaProvider().fetchSchedule("en");
    expect(matches.length).toBeGreaterThan(0);
    const qf = matches.find((m) => m.id === "400021536")!; // FRA vs MAR
    expect(qf.home.code).toBe("FRA");
    expect(qf.away.code).toBe("MAR");
    expect(qf.phase).toBe("SCHEDULED");
    expect(qf.stage).toBe("Quarter-final");
    expect(qf.sourceRefs.fifa?.idMatch).toBe("400021536");
    expect(qf.home.flag).toBe("🇫🇷");
  });

  it("handles undecided ties via placeholders", async () => {
    mockFetch([[/calendar\/matches/, fixture("fifa-calendar-sample.json")]]);
    const matches = await new FifaProvider().fetchSchedule("en");
    const semi = matches.find((m) => m.id === "400021541")!; // W97 vs W98
    expect(semi.home.code).toBe("TBD");
    expect(semi.home.name).toBe("W97");
    expect(semi.home.flag).toBe("🏳️");
  });
});

describe("FifaProvider.fetchSchedule (full-tournament fixture)", () => {
  it("maps group, stageKind and matchNumber", async () => {
    mockFetch([
      [/calendar\/matches/, fixture("fifa-calendar-full-sample.json")],
    ]);
    const matches = await new FifaProvider().fetchSchedule("en");
    expect(matches.length).toBe(15);

    const opener = matches.find((m) => m.matchNumber === 1)!;
    expect(opener.stageKind).toBe("GROUP");
    expect(opener.group).toBe("A");

    const r32 = matches.find((m) => m.matchNumber === 74)!;
    expect(r32.stageKind).toBe("R32");
    expect(r32.group).toBeUndefined();

    const final = matches.find((m) => m.matchNumber === 104)!;
    expect(final.stageKind).toBe("FINAL");
    expect(final.home.name).toBe("W101"); // still undecided
  });

  it("falls back to match-number ranges for unknown stage ids", async () => {
    const doc = JSON.parse(fixture("fifa-calendar-full-sample.json"));
    for (const m of doc.Results) m.IdStage = "999999";
    mockFetch([[/calendar\/matches/, JSON.stringify(doc)]]);
    const matches = await new FifaProvider().fetchSchedule("en");
    expect(matches.find((m) => m.matchNumber === 90)!.stageKind).toBe("R16");
    expect(matches.find((m) => m.matchNumber === 103)!.stageKind).toBe(
      "THIRD",
    );
  });

  it("extracts the group letter from Korean group names", async () => {
    const doc = JSON.parse(fixture("fifa-calendar-full-sample.json"));
    for (const m of doc.Results) {
      if (m.GroupName?.[0]) m.GroupName[0].Description = "B조";
    }
    mockFetch([[/calendar\/matches/, JSON.stringify(doc)]]);
    const matches = await new FifaProvider().fetchSchedule("ko");
    expect(matches.find((m) => m.matchNumber === 1)!.group).toBe("B");
  });
});
