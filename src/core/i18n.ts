import type { Lang, StageKind, TimelineEvent } from "./model.js";

export const LABELS = {
  ko: {
    live: "LIVE",
    scheduled: "예정",
    halftime: "하프타임",
    etBreak: "연장 준비",
    penalties: "승부차기",
    finished: "경기 종료",
    firstHalf: "전반",
    secondHalf: "후반",
    etFirst: "연장 전반",
    etSecond: "연장 후반",
    winprob: "승률(추정)",
    draw: "무",
    reconnecting: "연결 재시도 중",
    lastUpdate: "마지막 갱신",
    retryIn: "재시도까지",
    offline: "오프라인",
    staleData: "기준 데이터",
    nextMatchIn: "다음 경기까지",
    noLiveMatches: "진행 중인 경기가 없습니다",
    sourceSwitched: "데이터 소스 전환 — 백업 소스로 중계를 계속합니다",
    corrected: "정정",
    goalCancelled: "골 취소",
    quitHint: "q 종료 · t 말투 · s 애니메이션 건너뛰기",
    pickPrompt: "번호를 입력해 경기에 입장하세요 (q 종료): ",
    schedule: "경기 일정",
    liveNow: "진행 중",
    upcoming: "예정된 경기",
    recentResults: "최근 결과",
    replaying: "리플레이",
    speed: "배속",
    recorded: "녹화됨",
    loading: "불러오는 중...",
    noData: "데이터를 가져오지 못했습니다",
    groupStage: "조별리그",
    roundR32: "32강",
    roundR16: "16강",
    roundQF: "8강",
    roundSF: "준결승",
    roundThird: "3위 결정전",
    roundFinal: "결승",
    noBracketData: "대진표를 구성할 대회 전체 데이터를 가져오지 못했습니다",
    standingsCols: ["경기", "승", "무", "패", "득실", "승점"],
    kickoffIn: "킥오프까지",
    waitingKickoff: "킥오프 대기 중 — 시작하면 자동으로 중계가 시작됩니다",
    foldedNotice: "{n}개의 일반 이벤트 접힘",
  },
  en: {
    live: "LIVE",
    scheduled: "Scheduled",
    halftime: "Half-time",
    etBreak: "Break before ET",
    penalties: "Penalty shoot-out",
    finished: "Full-time",
    firstHalf: "1st half",
    secondHalf: "2nd half",
    etFirst: "ET 1st half",
    etSecond: "ET 2nd half",
    winprob: "Win prob (est.)",
    draw: "Draw",
    reconnecting: "Reconnecting",
    lastUpdate: "last update",
    retryIn: "retry in",
    offline: "offline",
    staleData: "data as of",
    nextMatchIn: "Next match in",
    noLiveMatches: "No matches in progress",
    sourceSwitched: "Data source switched — continuing on backup source",
    corrected: "corrected",
    goalCancelled: "Goal disallowed",
    quitHint: "q quit · s skip animation",
    pickPrompt: "Enter a number to join a match (q to quit): ",
    schedule: "Schedule",
    liveNow: "Live now",
    upcoming: "Upcoming",
    recentResults: "Recent results",
    replaying: "Replay",
    speed: "speed",
    recorded: "recorded",
    loading: "Loading...",
    noData: "Failed to fetch data",
    groupStage: "Group stage",
    roundR32: "Round of 32",
    roundR16: "Round of 16",
    roundQF: "Quarter-finals",
    roundSF: "Semi-finals",
    roundThird: "Third place",
    roundFinal: "Final",
    noBracketData: "Couldn't fetch full-tournament data for the bracket",
    standingsCols: ["P", "W", "D", "L", "GD", "Pts"],
    kickoffIn: "Kick-off in",
    waitingKickoff: "Waiting for kick-off — commentary starts automatically",
    foldedNotice: "{n} routine events folded",
  },
} as const;

export type Labels = (typeof LABELS)[Lang];

export function labels(lang: Lang): Labels {
  return LABELS[lang];
}

export function roundLabel(kind: StageKind, l: Labels): string {
  switch (kind) {
    case "GROUP":
      return l.groupStage;
    case "R32":
      return l.roundR32;
    case "R16":
      return l.roundR16;
    case "QF":
      return l.roundQF;
    case "SF":
      return l.roundSF;
    case "THIRD":
      return l.roundThird;
    case "FINAL":
      return l.roundFinal;
  }
}

interface SentenceCtx {
  player?: string;
  team?: string;
}

/**
 * English sentence generator, applied at render time for en sessions.
 * (Korean sentences come from the tone presets in core/tone.ts — the tone
 * feature is ko-only, en keeps this single register.) Generated from
 * structured facts; no source prose is ever displayed or redistributed.
 */
export function enEventSentence(
  e: Pick<TimelineEvent, "type" | "playerIn" | "playerOut" | "injury">,
  ctx: SentenceCtx = {},
): string {
  const who = ctx.player
    ? `${ctx.player}${ctx.team ? ` (${ctx.team})` : ""}`
    : (ctx.team ?? "");
  const team = ctx.team;

  switch (e.type) {
    case "GOAL":
      return who ? `Goal! ${who} scores!` : "Goal!";
    case "OWN_GOAL":
      return who ? `Own goal by ${who}` : "Own goal";
    case "PENALTY_GOAL":
      return who ? `${who} converts the penalty!` : "Penalty scored!";
    case "PENALTY_MISS":
      return who ? `${who} misses the penalty` : "Penalty missed";
    case "ASSIST":
      return who ? `Assisted by ${who}` : "Assist";
    case "SHOT":
      return who ? `${who} attempts a shot` : "Shot attempt";
    case "SAVE":
      return team ? `Save by the ${team} goalkeeper` : "Goalkeeper save";
    case "FOUL":
      return who ? `Foul by ${who}` : "Foul";
    case "YELLOW":
      return who ? `${who} is booked` : "Yellow card";
    case "RED":
      return who ? `${who} is sent off!` : "Red card!";
    case "CORNER":
      return team ? `Corner kick for ${team}` : "Corner kick";
    case "OFFSIDE":
      return who ? `${who} is offside` : "Offside";
    case "SUBSTITUTION":
      if (e.playerIn && e.playerOut)
        return `Substitution${team ? ` (${team})` : ""}: ${e.playerIn} in, ${e.playerOut} out`;
      return team ? `Substitution for ${team}` : "Substitution";
    case "VAR":
      return "VAR review";
    case "PERIOD_START":
      return "The referee starts the period";
    case "PERIOD_END":
      return "End of the period";
    case "FULLTIME":
      return "Full-time";
    case "COIN_TOSS":
      return "Coin toss";
    case "BREAK":
      return "Match paused";
    case "RESUMED":
      return "Match resumed";
    case "ADDED_TIME":
      return e.injury ? `+${e.injury} minutes added` : "Added time signalled";
    default:
      return "Match event";
  }
}

export const EVENT_ICON: Record<string, string> = {
  GOAL: "⚽",
  OWN_GOAL: "⚽",
  PENALTY_GOAL: "⚽",
  PENALTY_MISS: "❌",
  ASSIST: "🅰️ ",
  SHOT: "🎯",
  SAVE: "🧤",
  FOUL: "⚠️ ",
  YELLOW: "🟨",
  RED: "🟥",
  CORNER: "⛳",
  OFFSIDE: "🚩",
  SUBSTITUTION: "🔁",
  VAR: "📺",
  PERIOD_START: "🟢",
  PERIOD_END: "⏸ ",
  FULLTIME: "🏁",
  COIN_TOSS: "🪙",
  BREAK: "💧",
  RESUMED: "▶️ ",
  ADDED_TIME: "⏱ ",
  UNKNOWN: "·",
};
