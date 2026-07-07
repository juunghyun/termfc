import { EventEmitter } from "node:events";
import {
  CELEBRATION_TYPES,
  compareEvents,
  regulationCap,
  type Match,
  type MatchState,
  type TimelineEvent,
} from "../core/model.js";
import type { ReplayHeader } from "./recorder.js";

export interface ParsedReplay {
  match: Match;
  events: TimelineEvent[];
}

export function parseReplay(content: string): ParsedReplay {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("empty replay file");
  const header = JSON.parse(lines[0]!) as ReplayHeader;
  if (header.kind !== "termfc-replay" || typeof header.v !== "number")
    throw new Error("not a termfc replay file");
  const seen = new Set<string>();
  const events: TimelineEvent[] = [];
  for (const line of lines.slice(1)) {
    const e = JSON.parse(line) as TimelineEvent;
    if (seen.has(e.id)) continue; // re-watch sessions may duplicate lines
    seen.add(e.id);
    events.push(e);
  }
  events.sort(compareEvents);
  return { match: header.match, events };
}

function elapsedSeconds(e: TimelineEvent): number {
  return (e.minute + (e.injury ?? 0)) * 60 + (e.second ?? 0);
}

function phaseFor(e: TimelineEvent, current: MatchState["phase"]) {
  // Derive coarse phase from event period when available (FIFA periods).
  switch (e.period) {
    case 3:
      return "FIRST_HALF" as const;
    case 4:
      return "HALFTIME" as const;
    case 5:
      return "SECOND_HALF" as const;
    case 7:
      return "ET_FIRST" as const;
    case 9:
      return "ET_SECOND" as const;
    case 11:
      return "PENALTIES" as const;
    case 10:
      return "FINISHED" as const;
  }
  if (e.type === "FULLTIME") return "FINISHED" as const;
  return current;
}

/**
 * Replays a recorded (or bundled demo) match through the same event surface
 * as PollingEngine, so the match screen works unchanged. Delays between
 * events are proportional to match-clock gaps divided by `speed`.
 */
export class ReplayFeed extends EventEmitter {
  private stopped = false;

  constructor(
    private readonly replay: ParsedReplay,
    private readonly speed = 60,
  ) {
    super();
  }

  start(): void {
    void this.run();
  }

  stop(): void {
    this.stopped = true;
  }

  private async run(): Promise<void> {
    const { match, events } = this.replay;
    let score = { home: 0, away: 0 };
    let phase: MatchState["phase"] = "FIRST_HALF";
    let prevElapsed = 0;

    for (const e of events) {
      if (this.stopped) return;
      const elapsed = elapsedSeconds(e);
      const gapMs = (Math.max(0, elapsed - prevElapsed) * 1000) / this.speed;
      const capMs = this.speed <= 1 ? Infinity : 5_000;
      await sleep(Math.min(gapMs, capMs));
      if (this.stopped) return;
      prevElapsed = Math.max(prevElapsed, elapsed);

      phase = phaseFor(e, phase);
      if (e.scoreAfter) {
        score = { ...e.scoreAfter };
      } else if (CELEBRATION_TYPES.has(e.type) && e.teamSide) {
        const side = e.type === "OWN_GOAL"
          ? e.teamSide === "home" ? "away" : "home"
          : e.teamSide;
        score = { ...score, [side]: score[side] + 1 };
      }

      const cap = regulationCap(phase);
      const state: MatchState = {
        score,
        phase,
        minute: cap !== undefined ? Math.min(e.minute, cap) : e.minute,
        ...(e.injury !== undefined ? { injury: e.injury } : {}),
        ...(e.second !== undefined ? { second: e.second } : {}),
      };
      this.emit("state", state);
      this.emit("events", [e]);
      if (CELEBRATION_TYPES.has(e.type)) this.emit("goal", e);
      match.score = score;
      match.phase = phase;
    }
    this.emit("finished");
  }
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}
