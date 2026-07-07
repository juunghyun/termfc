import stringWidth from "string-width";

const enabled =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  (process.stdout.isTTY ?? false);

function sgr(open: number | string, close: number | string) {
  return (s: string): string =>
    enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;
}

export const bold = sgr(1, 22);
export const dim = sgr(2, 22);
export const inverse = sgr(7, 27);
export const red = sgr(31, 39);
export const green = sgr(32, 39);
export const yellow = sgr(33, 39);
export const blue = sgr(34, 39);
export const magenta = sgr(35, 39);
export const cyan = sgr(36, 39);
export const gray = sgr(90, 39);
export const bgYellow = sgr("43;30", "49;39");
export const bgGreen = sgr("42;30", "49;39");
export const bgRed = sgr("41;97", "49;39");

export function width(s: string): number {
  // strip SGR sequences before measuring
  return stringWidth(s.replace(/\x1b\[[0-9;]*m/g, ""));
}

export function truncate(s: string, max: number): string {
  if (width(s) <= max) return s;
  let out = "";
  let w = 0;
  // Walk characters, keeping escape sequences intact.
  const parts = s.split(/(\x1b\[[0-9;]*m)/);
  for (const part of parts) {
    if (part.startsWith("\x1b[")) {
      out += part;
      continue;
    }
    for (const ch of part) {
      const cw = stringWidth(ch);
      if (w + cw > max - 1) return `${out}…${enabled ? "\x1b[0m" : ""}`;
      out += ch;
      w += cw;
    }
  }
  return out;
}

export function padEndVisual(s: string, len: number): string {
  const w = width(s);
  return w >= len ? s : s + " ".repeat(len - w);
}

export function center(s: string, cols: number): string {
  const w = width(s);
  if (w >= cols) return s;
  return " ".repeat(Math.floor((cols - w) / 2)) + s;
}

export interface Term {
  out: NodeJS.WriteStream;
  cols(): number;
  rows(): number;
}

export function term(out: NodeJS.WriteStream = process.stdout): Term {
  return {
    out,
    cols: () => out.columns || 80,
    rows: () => out.rows || 24,
  };
}

export function enterAltScreen(out: NodeJS.WriteStream): void {
  if (out.isTTY) out.write("\x1b[?1049h\x1b[?25l");
}

export function leaveAltScreen(out: NodeJS.WriteStream): void {
  if (out.isTTY) out.write("\x1b[?25h\x1b[?1049l");
}

/**
 * Flicker-free full-frame paint: instead of erasing the whole screen (which
 * flashes blank between frames), move the cursor home and overwrite each line,
 * erasing to end-of-line per line and clearing anything below the frame.
 * Wrapped in synchronized-output (DECSET 2026) so capable terminals swap the
 * frame atomically; others ignore the sequence harmlessly.
 */
export function paintFrame(out: NodeJS.WriteStream, lines: string[]): void {
  if (!out.isTTY) {
    out.write(`${lines.join("\n")}\n`);
    return;
  }
  const body = lines.map((l) => `${l}\x1b[K`).join("\r\n");
  out.write(`\x1b[?2026h\x1b[H${body}\r\n\x1b[0J\x1b[?2026l`);
}
