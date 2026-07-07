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
 */
export class ReplayRecorder {
  readonly file: string;

  constructor(
    private readonly match: Match,
    dir: string = REPLAY_DIR,
  ) {
    mkdirSync(dir, { recursive: true });
    const slug = `${match.id}-${match.home.code}-${match.away.code}`.replace(
      /[^\w.-]/g,
      "_",
    );
    this.file = join(dir, `${slug}.jsonl`);
    const empty = !existsSync(this.file) || statSync(this.file).size === 0;
    if (empty) {
      const header: ReplayHeader = {
        v: REPLAY_FORMAT_VERSION,
        kind: "termfc-replay",
        recordedAt: new Date().toISOString(),
        match,
      };
      appendFileSync(this.file, `${JSON.stringify(header)}\n`);
    }
  }

  append(events: TimelineEvent[]): void {
    if (events.length === 0) return;
    const lines = events.map((e) => JSON.stringify(e)).join("\n");
    appendFileSync(this.file, `${lines}\n`);
  }
}
