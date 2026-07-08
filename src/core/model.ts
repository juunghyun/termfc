export type Lang = "ko" | "en";
export type SourceName = "fifa" | "espn";

/** Tournament round, group stage through final (2026: 48 teams, R32 exists). */
export type StageKind =
  | "GROUP"
  | "R32"
  | "R16"
  | "QF"
  | "SF"
  | "THIRD"
  | "FINAL";

export type MatchPhase =
  | "SCHEDULED"
  | "FIRST_HALF"
  | "HALFTIME"
  | "SECOND_HALF"
  | "ET_BREAK"
  | "ET_FIRST"
  | "ET_SECOND"
  | "PENALTIES"
  | "FINISHED"
  | "ABANDONED"
  | "UNKNOWN";

export type EventType =
  | "GOAL"
  | "OWN_GOAL"
  | "PENALTY_GOAL"
  | "PENALTY_MISS"
  | "ASSIST"
  | "SHOT"
  | "SAVE"
  | "FOUL"
  | "YELLOW"
  | "RED"
  | "CORNER"
  | "OFFSIDE"
  | "SUBSTITUTION"
  | "VAR"
  | "PERIOD_START"
  | "PERIOD_END"
  | "FULLTIME"
  | "COIN_TOSS"
  | "BREAK"
  | "RESUMED"
  | "ADDED_TIME"
  | "UNKNOWN";

export type Salience = "high" | "low";

const HIGH_SALIENCE: ReadonlySet<EventType> = new Set([
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
  "PENALTY_MISS",
  "RED",
  "VAR",
]);

/** Event types that trigger the goal celebration animation / flash. */
export const CELEBRATION_TYPES: ReadonlySet<EventType> = new Set([
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
]);

export function salienceOf(type: EventType): Salience {
  return HIGH_SALIENCE.has(type) ? "high" : "low";
}

export interface Team {
  /** FIFA 3-letter code is the canonical key (e.g. "KOR"). */
  code: string;
  name: string;
  flag: string;
}

export interface Score {
  home: number;
  away: number;
  penHome?: number;
  penAway?: number;
}

export interface FifaRef {
  idCompetition: string;
  idSeason: string;
  idStage: string;
  idMatch: string;
}

export interface SourceRefs {
  fifa?: FifaRef;
  espn?: { eventId: string };
}

export interface Match {
  /** Canonical internal id (primary-source native id). */
  id: string;
  stage: string;
  kickoff: string; // ISO-8601 UTC
  home: Team;
  away: Team;
  score: Score;
  phase: MatchPhase;
  /** Raw source match time, e.g. "67'" or "90'+4'". */
  matchTime?: string;
  /** Group letter A–L (group-stage matches only, best-effort for ESPN). */
  group?: string;
  /** Normalized round; undefined when the source doesn't say (ESPN). */
  stageKind?: StageKind;
  /** Official tournament match number 1–104 (FIFA only). */
  matchNumber?: number;
  sourceRefs: SourceRefs;
}

export interface MatchState {
  score: Score;
  phase: MatchPhase;
  minute: number;
  injury?: number;
  /** Only some sources (ESPN) provide second precision. */
  second?: number;
}

export interface TimelineEvent {
  /** Source-prefixed native id, e.g. "fifa:1816196150". */
  id: string;
  type: EventType;
  minute: number;
  injury?: number;
  second?: number;
  period?: number;
  teamCode?: string;
  teamSide?: "home" | "away";
  /** Best-effort player name extracted from source data. */
  player?: string;
  /** Localized display sentence (source-provided or template-generated). */
  text?: string;
  /** Score right after this event, when the source provides it (goals). */
  scoreAfter?: { home: number; away: number };
  source: SourceName;
  /** Local monotonic sequence assigned on receive. */
  seq: number;
}

/** Sort key per decision doc: (period, minute, second?, seq). */
export function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  return (
    (a.period ?? 0) - (b.period ?? 0) ||
    a.minute - b.minute ||
    (a.injury ?? 0) - (b.injury ?? 0) ||
    (a.second ?? 0) - (b.second ?? 0) ||
    a.seq - b.seq
  );
}

/** Parse "90'+4'" / "67'" / "" into minute + injury. */
export function parseMatchMinute(raw: string | undefined | null): {
  minute: number;
  injury?: number;
} {
  if (!raw) return { minute: 0 };
  const m = /^(\d+)'(?:\s*\+\s*(\d+)')?/.exec(raw.trim());
  if (!m) return { minute: 0 };
  const minute = Number(m[1]);
  const injury = m[2] !== undefined ? Number(m[2]) : undefined;
  return injury !== undefined ? { minute, injury } : { minute };
}

export function formatEventClock(e: {
  minute: number;
  injury?: number;
}): string {
  return e.injury !== undefined && e.injury > 0
    ? `${e.minute}'+${e.injury}'`
    : `${e.minute}'`;
}

export function isLivePhase(phase: MatchPhase): boolean {
  return (
    phase === "FIRST_HALF" ||
    phase === "SECOND_HALF" ||
    phase === "ET_FIRST" ||
    phase === "ET_SECOND" ||
    phase === "PENALTIES" ||
    phase === "HALFTIME" ||
    phase === "ET_BREAK"
  );
}

/** Phases in which the clock actually runs. */
export function isClockRunning(phase: MatchPhase): boolean {
  return (
    phase === "FIRST_HALF" ||
    phase === "SECOND_HALF" ||
    phase === "ET_FIRST" ||
    phase === "ET_SECOND"
  );
}

/** Regulation end minute of the running phase (for +injury display). */
export function regulationCap(phase: MatchPhase): number | undefined {
  switch (phase) {
    case "FIRST_HALF":
      return 45;
    case "SECOND_HALF":
      return 90;
    case "ET_FIRST":
      return 105;
    case "ET_SECOND":
      return 120;
    default:
      return undefined;
  }
}
