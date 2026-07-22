import type { Match } from "../core/model.js";
import { bold, center, cyan, dim, green, magenta, yellow } from "./ansi.js";

export type AnimationMode = "LIVE" | "ANIMATION";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Single owner of the render loop mode. While an animation plays, the match
 * screen buffers incoming commentary lines and flushes them afterwards —
 * events are never dropped. Consecutive goals queue (capped); `skip()`
 * fast-forwards the current animation.
 */
export class AnimationController {
  mode: AnimationMode = "LIVE";
  private skipFlag = false;
  private chain: Promise<void> = Promise.resolve();
  private queued = 0;
  private readonly maxQueued = 3;

  constructor(private readonly drawFrame: (lines: string[]) => void) {}

  skip(): void {
    this.skipFlag = true;
  }

  /** Queue an animation; resolves when this animation finishes. */
  enqueue(frames: string[][], fps = 8): Promise<void> {
    if (this.queued >= this.maxQueued) return this.chain;
    this.queued++;
    this.chain = this.chain.then(async () => {
      this.mode = "ANIMATION";
      this.skipFlag = false;
      const delay = 1000 / fps;
      for (const f of frames) {
        if (this.skipFlag) break;
        this.drawFrame(f);
        await sleep(delay);
      }
      this.queued--;
      if (this.queued === 0) this.mode = "LIVE";
    });
    return this.chain;
  }

  /** Wait until everything queued has finished. */
  idle(): Promise<void> {
    return this.chain;
  }
}

const GOAL_ART = [
  " ██████╗  ██████╗  █████╗ ██╗     ██╗",
  "██╔════╝ ██╔═══██╗██╔══██╗██║     ██║",
  "██║  ███╗██║   ██║███████║██║     ██║",
  "██║   ██║██║   ██║██╔══██║██║     ╚═╝",
  "╚██████╔╝╚██████╔╝██║  ██║███████╗██╗",
  " ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝",
];

const TROPHY = [
  "        ___________        ",
  "       '._==_==_=_.'       ",
  "       .-\\:      /-.       ",
  "      | (|:.     |) |      ",
  "       '-|:.     |-'       ",
  "         \\::.    /         ",
  "          '::. .'          ",
  "            ) (            ",
  "          _.' '._          ",
  "         `\"\"\"\"\"\"\"`         ",
];

/** Goal celebration: ball flies in, GOAL art flashes, scorer line lands. */
export function goalFrames(opts: {
  player?: string;
  teamName?: string;
  flag?: string;
  cols: number;
}): string[][] {
  const { cols } = opts;
  const frames: string[][] = [];
  // Ball flight
  const track = Math.max(10, Math.min(cols - 10, 40));
  for (let i = 0; i <= track; i += Math.ceil(track / 5)) {
    frames.push([
      "",
      "",
      center(`${" ".repeat(i)}⚽`, cols),
      center(dim("─".repeat(track)), cols),
      "",
    ]);
  }
  // Flashing GOAL art
  const paints = [yellow, green, magenta, cyan, yellow, green];
  const who = [opts.flag, opts.player, opts.teamName && `(${opts.teamName})`]
    .filter(Boolean)
    .join(" ");
  for (let i = 0; i < paints.length; i++) {
    const paint = paints[i]!;
    frames.push([
      "",
      ...GOAL_ART.map((l) => center(paint(bold(l)), cols)),
      "",
      center(bold(who || "GOAL!"), cols),
      "",
    ]);
  }
  return frames;
}

/** Match-entry animation: World Cup trophy + both flags + tie line. */
export function entranceFrames(match: Match, cols: number): string[][] {
  const title = "WORLD CUP 2026";
  const tie = `${match.home.flag}  ${match.home.name}   VS   ${match.away.name}  ${match.away.flag}`;
  const stage = match.stage;
  const full = [
    "",
    center(bold(yellow(title)), cols),
    "",
    ...TROPHY.map((l) => center(yellow(l), cols)),
    "",
    center(bold(tie), cols),
    stage ? center(dim(stage), cols) : "",
    "",
  ];
  const frames: string[][] = [];
  // Reveal top-to-bottom
  const steps = 6;
  for (let s = 1; s <= steps; s++) {
    const upto = Math.ceil((full.length * s) / steps);
    frames.push(full.slice(0, upto));
  }
  // Shine
  const shineNames = [
    center(bold(green(tie)), cols),
    center(bold(cyan(tie)), cols),
    center(bold(tie), cols),
  ];
  for (const n of shineNames) {
    const f = [...full];
    f[full.length - 3] = n;
    frames.push(f);
  }
  return frames;
}
