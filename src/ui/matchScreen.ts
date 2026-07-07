import { EventEmitter } from "node:events";
import * as readline from "node:readline";
import { ClockInterpolator, formatClock } from "../core/clock.js";
import { EVENT_ICON, labels, type Labels } from "../core/i18n.js";
import {
  formatEventClock,
  isClockRunning,
  type Lang,
  type Match,
  type MatchState,
  type TimelineEvent,
} from "../core/model.js";
import { phaseLabel } from "../core/state.js";
import { liveWinProb, type WinProb } from "../core/winprob.js";
import type { NetInfo } from "../engine/polling.js";
import { normalizeEventText, normalizePlayerName } from "../core/text.js";
import {
  bgYellow,
  bold,
  cyan,
  dim,
  enterAltScreen,
  gray,
  green,
  leaveAltScreen,
  paintFrame,
  red,
  term,
  truncate,
  width,
  yellow,
  center,
} from "./ansi.js";
import {
  AnimationController,
  entranceFrames,
  goalFrames,
} from "./animations.js";

export interface MatchFeedLike extends EventEmitter {
  start(): void;
  stop(): void;
}

/** Sideless whistle/flow events render centered, like section markers. */
const SYSTEM_TYPES: ReadonlySet<TimelineEvent["type"]> = new Set([
  "PERIOD_START",
  "PERIOD_END",
  "FULLTIME",
  "BREAK",
  "RESUMED",
]);

/** Log entries are stored structured and formatted at render time, so
 * alignment follows the current terminal width (and resizes). */
type LogLine =
  | { kind: "event"; e: TimelineEvent }
  | { kind: "text"; text: string; align?: "left" | "center" }
  | { kind: "sep" };

export interface MatchScreenOptions {
  lang: Lang;
  mode: "live" | "replay";
  animations: boolean;
  clockRate?: number;
  speedLabel?: string;
  lambdas?: { lh: number; la: number } | null;
  sourceLabel?: () => string;
  onEvents?: (events: TimelineEvent[]) => void;
}

/**
 * The live commentary screen: fixed header (score + per-second clock +
 * phase + win probability), append-only event log, status footer.
 * Full redraw at 1 Hz.
 */
export class MatchScreen {
  private readonly t = term();
  private readonly l: Labels;
  private readonly clock: ClockInterpolator;
  private readonly controller: AnimationController;
  private lines: LogLine[] = [];
  private pending: LogLine[] = [];
  private state: MatchState | null = null;
  private net: NetInfo | null = null;
  private lastUpdateAt: number | null = null;
  private flashUntil = 0;
  private flashText = "";
  private finished = false;
  private sourceSwitchedLabel = false;

  constructor(
    private readonly match: Match,
    private readonly feed: MatchFeedLike,
    private readonly opts: MatchScreenOptions,
  ) {
    this.l = labels(opts.lang);
    this.clock = new ClockInterpolator(undefined, opts.clockRate ?? 1);
    this.controller = new AnimationController((frame) => {
      const pad = Math.max(0, Math.floor((this.t.rows() - frame.length) / 2));
      paintFrame(this.t.out, [...Array<string>(pad).fill(""), ...frame]);
    });
    if (match.phase !== "SCHEDULED") {
      this.clock.update({ minute: 0, phase: match.phase });
    }
  }

  async run(): Promise<void> {
    const { out } = this.t;
    enterAltScreen(out);
    const input = process.stdin;
    readline.emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.resume();

    let resolveDone: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));

    const onKey = (_str: string, key: readline.Key) => {
      const name = key?.name ?? _str;
      if (name === "q" || name === "escape" || (key?.ctrl && name === "c")) {
        resolveDone();
      } else if (name === "s") {
        this.controller.skip();
      } else if (this.finished) {
        resolveDone();
      }
    };
    input.on("keypress", onKey);

    if (this.opts.animations) {
      await this.controller.enqueue(entranceFrames(this.match, this.t.cols()), 6);
    }

    this.subscribe();
    this.feed.start();
    const tick = setInterval(() => {
      if (this.controller.mode === "LIVE") this.render();
    }, 1000);
    const onResize = () => this.render();
    out.on("resize", onResize);
    this.render();

    await done;

    clearInterval(tick);
    out.off("resize", onResize);
    input.off("keypress", onKey);
    if (input.isTTY) input.setRawMode(false);
    input.pause();
    this.feed.stop();
    leaveAltScreen(out);
  }

  private subscribe(): void {
    this.feed.on("state", (s: MatchState) => {
      this.state = s;
      this.lastUpdateAt = Date.now();
      this.clock.update({
        minute: s.minute,
        second: s.second,
        injury: s.injury,
        phase: s.phase,
      });
    });

    this.feed.on("events", (events: TimelineEvent[]) => {
      this.opts.onEvents?.(events);
      const entries: LogLine[] = [];
      for (const e of events) {
        if (e.type === "ASSIST" && !e.text) continue; // assists render as text lines too
        const isGoal =
          e.type === "GOAL" || e.type === "PENALTY_GOAL" || e.type === "OWN_GOAL";
        if (isGoal) entries.push({ kind: "sep" });
        entries.push({ kind: "event", e });
        if (isGoal) entries.push({ kind: "sep" });
      }
      if (this.controller.mode === "ANIMATION") this.pending.push(...entries);
      else {
        this.lines.push(...entries);
        this.render();
      }
    });

    this.feed.on("goal", (e: TimelineEvent) => {
      const side = e.teamSide;
      const teamName = side ? this.match[side].name : undefined;
      const flag = side ? this.match[side].flag : "⚽";
      this.flashUntil = Date.now() + 6000;
      const player = e.player ? normalizePlayerName(e.player) : undefined;
      this.flashText = player ? `GOAL! ${player}` : "GOAL!";
      if (this.opts.animations) {
        void this.controller
          .enqueue(
            goalFrames({
              player,
              teamName,
              flag,
              cols: this.t.cols(),
            }),
          )
          .then(() => {
            this.flushPending();
            this.render();
          });
      }
    });

    this.feed.on("cancelled", (e: TimelineEvent) => {
      const line = `${dim(formatEventClock(e).padStart(7))}  ${red(`📺 ${this.l.goalCancelled} (${this.l.corrected})`)} ${dim(e.text ? normalizeEventText(e.text) : "")}`;
      this.pushLine({ kind: "text", text: line });
    });

    this.feed.on("sourceSwitched", () => {
      this.sourceSwitchedLabel = true;
      this.pushLine({
        kind: "text",
        text: yellow(`── ${this.l.sourceSwitched} ──`),
        align: "center",
      });
    });

    this.feed.on("net", (info: NetInfo) => {
      this.net = info;
      this.render();
    });

    this.feed.on("finished", () => {
      this.finished = true;
      this.render();
    });
  }

  private pushLine(line: LogLine): void {
    if (this.controller.mode === "ANIMATION") this.pending.push(line);
    else {
      this.lines.push(line);
      this.render();
    }
  }

  private flushPending(): void {
    if (this.pending.length > 0) {
      this.lines.push(...this.pending);
      this.pending = [];
    }
  }

  private formatEvent(e: TimelineEvent, cols: number): string {
    const icon = EVENT_ICON[e.type] ?? "·";
    let text = e.text ? normalizeEventText(e.text) : "";
    if (e.type === "GOAL" || e.type === "PENALTY_GOAL" || e.type === "OWN_GOAL")
      text = bold(yellow(text));
    else if (e.type === "RED") text = bold(red(text));
    else if (e.type === "YELLOW") text = yellow(text);
    else if (e.type === "PERIOD_START" || e.type === "PERIOD_END" || e.type === "FULLTIME")
      text = cyan(text);
    else if (e.type === "FOUL" || e.type === "OFFSIDE" || e.type === "UNKNOWN")
      text = dim(text); // routine events recede so key moments stand out
    if (SYSTEM_TYPES.has(e.type))
      return center(`${dim(formatEventClock(e))} ${icon} ${text}`, cols);
    const line = `${dim(formatEventClock(e).padStart(7))}  ${icon} ${text}`;
    if (e.teamSide === "away") {
      const pad = cols - 1 - width(line);
      if (pad > 0) return " ".repeat(pad) + line;
    }
    return line;
  }

  private renderLine(l: LogLine, cols: number): string {
    if (l.kind === "sep")
      return center(dim("─".repeat(Math.min(24, Math.max(8, cols - 8)))), cols);
    if (l.kind === "text") return l.align === "center" ? center(l.text, cols) : l.text;
    return this.formatEvent(l.e, cols);
  }

  /** Shown in the body before any commentary has arrived. */
  private waitingCard(bodyRows: number, cols: number): string[] {
    const kickoff = new Intl.DateTimeFormat(
      this.opts.lang === "ko" ? "ko-KR" : "en-US",
      { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" },
    ).format(new Date(this.match.kickoff));
    const card = [
      this.match.stage ? center(dim(this.match.stage), cols) : "",
      center(
        `${this.match.home.flag} ${bold(this.match.home.name)}  ${dim("vs")}  ${bold(this.match.away.name)} ${this.match.away.flag}`,
        cols,
      ),
      center(dim(`⏱ ${kickoff}`), cols),
      "",
      center(dim(this.l.loading), cols),
    ];
    const pad = Math.max(0, Math.floor((bodyRows - card.length) / 2));
    return [...Array<string>(pad).fill(""), ...card].slice(0, bodyRows);
  }

  private winprob(): WinProb | null {
    if (this.opts.lambdas === null) return null;
    const phase = this.state?.phase ?? this.match.phase;
    if (
      phase === "SCHEDULED" ||
      phase === "ET_FIRST" ||
      phase === "ET_SECOND" ||
      phase === "ET_BREAK" ||
      phase === "PENALTIES" ||
      phase === "ABANDONED"
    )
      return null;
    const d = this.clock.display();
    const score = this.state?.score ?? this.match.score;
    return liveWinProb({
      scoreHome: score.home,
      scoreAway: score.away,
      elapsedFraction: Math.min(1, d.totalSeconds / (90 * 60)),
      lambdas: this.opts.lambdas ?? undefined,
    });
  }

  private render(): void {
    if (this.controller.mode === "ANIMATION") return;
    const { out } = this.t;
    const cols = this.t.cols();
    const rows = this.t.rows();
    const score = this.state?.score ?? this.match.score;
    const phase = this.state?.phase ?? this.match.phase;

    const pens =
      score.penHome !== undefined
        ? dim(` (PSO ${score.penHome}-${score.penAway})`)
        : "";
    let scoreStr = `${bold(String(score.home))} : ${bold(String(score.away))}`;
    if (Date.now() < this.flashUntil) {
      scoreStr = bgYellow(` ${score.home} : ${score.away} `) + ` ${bold(yellow(this.flashText))}`;
    }
    const header1 = center(
      `${this.match.home.flag} ${bold(this.match.home.name)}  ${scoreStr}  ${bold(this.match.away.name)} ${this.match.away.flag}${pens}`,
      cols,
    );

    const clockStr = isClockRunning(phase) || phase === "HALFTIME" || phase === "FINISHED"
      ? formatClock(this.clock.display())
      : "--:--";
    let line2 = `⏱  ${bold(green(clockStr))}   ${phaseLabel(phase, this.l)}`;
    const wp = this.winprob();
    if (wp) {
      const pct = (x: number) => `${Math.round(x * 100)}%`;
      line2 += dim(
        `   ${this.l.winprob} ${this.match.home.code} ${pct(wp.home)} · ${this.l.draw} ${pct(wp.draw)} · ${this.match.away.code} ${pct(wp.away)}`,
      );
    }
    const header2 = center(line2, cols);

    const sep = dim("─".repeat(Math.max(4, cols - 2)));
    const bodyRows = Math.max(3, rows - 6);
    const body =
      this.lines.length === 0
        ? this.waitingCard(bodyRows, cols)
        : this.lines
            .slice(-bodyRows)
            .map((l) => truncate(this.renderLine(l, cols), cols - 1));

    const footer = this.footerLine();

    paintFrame(out, [
      truncate(header1, cols),
      truncate(header2, cols),
      sep,
      ...body,
      ...Array<string>(Math.max(0, bodyRows - body.length)).fill(""),
      sep,
      truncate(footer, cols),
    ]);
  }

  private footerLine(): string {
    const l = this.l;
    const time = (ts: number) =>
      new Date(ts).toTimeString().slice(0, 8);
    const src = this.opts.sourceLabel?.() ?? "";
    const badge =
      this.opts.mode === "replay"
        ? cyan(` ${l.replaying}${this.opts.speedLabel ? ` ×${this.opts.speedLabel}` : ""} `)
        : this.finished
          ? gray(` ${l.finished} `)
          : green(bold(" LIVE "));
    if (this.net?.down) {
      const retry = this.net.retryInMs
        ? ` · ${l.retryIn} ${Math.round(this.net.retryInMs / 1000)}s`
        : "";
      const last = this.net.lastOkAt
        ? ` · ${l.lastUpdate} ${time(this.net.lastOkAt)}`
        : "";
      return `${badge} ${yellow(`⚠ ${l.reconnecting}${retry}${last}`)}  ${dim(l.quitHint)}`;
    }
    const upd = this.lastUpdateAt
      ? `${l.lastUpdate} ${time(this.lastUpdateAt)}`
      : l.loading;
    const switched = this.sourceSwitchedLabel ? yellow(" ↯") : "";
    return `${badge} ${dim(`${src}${switched} · ${upd}`)}  ${dim(l.quitHint)}`;
  }
}
