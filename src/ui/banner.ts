import { bold, cyan, dim, green } from "./ansi.js";

const ART = [
  "████████╗███████╗██████╗ ███╗   ███╗███████╗ ██████╗",
  "╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝",
  "   ██║   █████╗  ██████╔╝██╔████╔██║█████╗  ██║     ",
  "   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ██║     ",
  "   ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║      ██████╗",
  "   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝",
];

export function renderBanner(version: string): string {
  const colored = ART.map((line, i) =>
    i < 3 ? green(line) : cyan(line),
  ).join("\n");
  const info = [
    "",
    `  ⚽ ${bold("termfc")} v${version} — FIFA World Cup 2026™ live text commentary`,
    dim("     data: fifa.com (primary) · espn.com (fallback) · unofficial public endpoints"),
    "",
  ].join("\n");
  return `\n${colored}${info}`;
}
