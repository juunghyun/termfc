import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Match, TimelineEvent } from "../src/core/model.js";
import { ReplayFeed, parseReplay } from "../src/replay/player.js";
import { ReplayRecorder } from "../src/replay/recorder.js";

const match: Match = {
  id: "400021529",
  stage: "16강전",
  kickoff: "2026-07-06T19:00:00Z",
  home: { code: "POR", name: "포르투갈", flag: "🇵🇹" },
  away: { code: "ESP", name: "스페인", flag: "🇪🇸" },
  score: { home: 0, away: 0 },
  phase: "FIRST_HALF",
  sourceRefs: {},
};

const ev = (
  id: string,
  over: Partial<TimelineEvent> = {},
): TimelineEvent => ({
  id: `fifa:${id}`,
  type: "SHOT",
  minute: 1,
  source: "fifa",
  seq: 0,
  ...over,
});

describe("recorder + player round-trip", () => {
  it("records JSONL and replays events in clock order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "termfc-test-"));
    const rec = new ReplayRecorder(match, dir);
    rec.append([ev("1", { minute: 2, period: 3 })]);
    rec.append([
      ev("2", {
        type: "GOAL",
        minute: 30,
        period: 3,
        teamSide: "away",
        scoreAfter: { home: 0, away: 1 },
      }),
      ev("1", { minute: 2, period: 3 }), // duplicate line (re-watch)
    ]);

    const parsed = parseReplay(readFileSync(rec.file, "utf8"));
    expect(parsed.match.id).toBe("400021529");
    expect(parsed.events).toHaveLength(2); // dedup by id

    const feed = new ReplayFeed(parsed, 1_000_000);
    const got: TimelineEvent[] = [];
    let goalEmitted = false;
    let finished = false;
    let lastScore = { home: 0, away: 0 };
    feed.on("events", (es: TimelineEvent[]) => got.push(...es));
    feed.on("goal", () => (goalEmitted = true));
    feed.on("state", (s: { score: typeof lastScore }) => (lastScore = s.score));
    feed.on("finished", () => (finished = true));
    feed.start();
    await new Promise((r) => setTimeout(r, 200));

    expect(got.map((e) => e.id)).toEqual(["fifa:1", "fifa:2"]);
    expect(goalEmitted).toBe(true);
    expect(finished).toBe(true);
    expect(lastScore).toEqual({ home: 0, away: 1 });
  });

  it("rejects files that are not termfc replays", () => {
    expect(() => parseReplay('{"foo":1}\n')).toThrow(/not a termfc replay/);
  });

  it("derives the shoot-out phase from FIFA period 11", async () => {
    const feed = new ReplayFeed(
      {
        match: { ...match },
        events: [ev("p1", { type: "PENALTY_GOAL", minute: 120, period: 11 })],
      },
      1_000_000,
    );
    const phases: string[] = [];
    feed.on("state", (s: { phase: string }) => phases.push(s.phase));
    feed.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(phases).toContain("PENALTIES");
  });
});

describe("bundled demo", () => {
  it("is a valid replay payload with Korean commentary and one goal", async () => {
    const demo = (await import("../src/data/demo-match.json")) as unknown as {
      default: { match: Match; events: TimelineEvent[] };
    };
    const { match: dm, events } = demo.default;
    expect(dm.home.name).toBe("포르투갈");
    expect(events.length).toBeGreaterThan(80);
    const goals = events.filter((e) => e.type === "GOAL");
    expect(goals).toHaveLength(1);
    expect(goals[0]!.scoreAfter).toEqual({ home: 0, away: 1 });
  });
});
