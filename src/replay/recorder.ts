import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Match, TimelineEvent } from "../core/model.js";
import { REPLAY_DIR } from "../store/store.js";

export const REPLAY_FORMAT_VERSION = 1;

export interface ReplayHeader {
  v: number;
  kind: "termfc-replay";
  recordedAt: string;
  match: Match;
}

/**
 * Records a live session as JSONL: line 1 = header, then one event per line.
 * Append-only — recording costs nothing while watching (decision doc §4).
 * The file (and header) is created lazily on the first real event, so a
 * waiting-mode session the user quits before kickoff leaves no empty JSONL.
 */
export class ReplayRecorder {
  readonly file: string;
  private started = false;
  private broken = false;

  constructor(
    private readonly match: Match,
    private readonly dir: string = REPLAY_DIR,
  ) {
    const slug = `${match.id}-${match.home.code}-${match.away.code}`.replace(
      /[^\w.-]/g,
      "_",
    );
    this.file = join(dir, `${slug}.jsonl`);
  }

  append(events: TimelineEvent[]): void {
    if (events.length === 0 || this.broken) return;
    try {
      if (!this.started) {
        mkdirSync(this.dir, { recursive: true });
        const empty = !existsSync(this.file) || statSync(this.file).size === 0;
        if (empty) {
          const header: ReplayHeader = {
            v: REPLAY_FORMAT_VERSION,
            kind: "termfc-replay",
            recordedAt: new Date().toISOString(),
            match: this.match,
          };
          appendFileSync(this.file, `${JSON.stringify(header)}\n`);
        }
        this.started = true;
      }
      const lines = events.map((e) => JSON.stringify(e)).join("\n");
      appendFileSync(this.file, `${lines}\n`);
    } catch {
      this.broken = true; // recording is best-effort; never crash the screen
    }
  }
}
