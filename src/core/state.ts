import type { Labels } from "./i18n.js";
import type { MatchPhase } from "./model.js";

/**
 * FIFA MatchStatus: 0 = finished, 1 = scheduled, 3 = live
 * FIFA Period (verified from 2026 dumps):
 *   2/16/17 pre-match · 3 first half · 4 half-time · 5 second half
 *   7 ET first · 8 ET break · 9 ET second · 10 full-time · 11 penalties
 */
export function mapFifaPhase(
  matchStatus: number,
  period: number | undefined,
  minute: number,
): MatchPhase {
  if (matchStatus === 0) return "FINISHED";
  if (matchStatus === 1) return "SCHEDULED";
  if (matchStatus === 4) return "ABANDONED";
  switch (period) {
    case 3:
      return "FIRST_HALF";
    case 4:
      return "HALFTIME";
    case 5:
      return "SECOND_HALF";
    case 7:
      return "ET_FIRST";
    case 8:
      return "ET_BREAK";
    case 9:
      return "ET_SECOND";
    case 10:
      return "FINISHED";
    case 11:
      return "PENALTIES";
  }
  // Live but period unknown — infer from the minute.
  if (minute > 90) return "ET_FIRST";
  return minute > 45 ? "SECOND_HALF" : "FIRST_HALF";
}

/** ESPN status.type.name + period -> internal phase. */
export function mapEspnPhase(
  statusName: string,
  state: string,
  period: number,
): MatchPhase {
  switch (statusName) {
    case "STATUS_SCHEDULED":
      return "SCHEDULED";
    case "STATUS_HALFTIME":
      return "HALFTIME";
    case "STATUS_FULL_TIME":
    case "STATUS_FINAL":
    case "STATUS_FINAL_PEN":
      return "FINISHED";
    case "STATUS_ABANDONED":
    case "STATUS_CANCELED":
    case "STATUS_POSTPONED":
      return "ABANDONED";
    case "STATUS_END_OF_REGULATION":
    case "STATUS_END_OF_EXTRATIME":
      return "ET_BREAK";
    case "STATUS_SHOOTOUT":
      return "PENALTIES";
    case "STATUS_OVERTIME":
      return period >= 4 ? "ET_SECOND" : "ET_FIRST";
    case "STATUS_FIRST_HALF":
      return "FIRST_HALF";
    case "STATUS_SECOND_HALF":
      return "SECOND_HALF";
    case "STATUS_IN_PROGRESS":
      if (period <= 1) return "FIRST_HALF";
      if (period === 2) return "SECOND_HALF";
      return period === 3 ? "ET_FIRST" : "ET_SECOND";
  }
  if (state === "post") return "FINISHED";
  if (state === "pre") return "SCHEDULED";
  return "UNKNOWN";
}

export function phaseLabel(phase: MatchPhase, l: Labels): string {
  switch (phase) {
    case "SCHEDULED":
      return l.scheduled;
    case "FIRST_HALF":
      return l.firstHalf;
    case "HALFTIME":
      return l.halftime;
    case "SECOND_HALF":
      return l.secondHalf;
    case "ET_FIRST":
      return l.etFirst;
    case "ET_BREAK":
      return l.etBreak;
    case "ET_SECOND":
      return l.etSecond;
    case "PENALTIES":
      return l.penalties;
    case "FINISHED":
      return l.finished;
    case "ABANDONED":
      return "—";
    default:
      return "";
  }
}
