import { buildBracket, placeholderLabel } from "../core/bracket.js";
import { labels, roundLabel, type Labels } from "../core/i18n.js";
import {
  isLivePhase,
  type Lang,
  type Match,
  type Team,
} from "../core/model.js";
import { phaseLabel } from "../core/state.js";
import { computeGroupStandings } from "../core/standings.js";
import {
  bold,
  cyan,
  dim,
  gray,
  padEndVisual,
  red,
  truncate,
  yellow,
} from "./ansi.js";
import { kickoffLabel } from "./listScreen.js";

/** Placeholder slots ("W101") get a readable label; real teams keep flags. */
function teamLabel(t: Team, lang: Lang): string {
  return t.code === "TBD"
    ? dim(placeholderLabel(t.name, lang))
    : `${t.flag} ${t.name}`;
}

function slotLine(m: Match, lang: Lang, l: Labels): string {
  const num = m.matchNumber !== undefined ? dim(`M${m.matchNumber} `) : "";
  const home = teamLabel(m.home, lang);
  const away = teamLabel(m.away, lang);
  if (isLivePhase(m.phase)) {
    const t = m.matchTime ? ` ${bold(m.matchTime)}` : "";
    return `${num}${red("●")}${t} ${home} ${bold(`${m.score.home} : ${m.score.away}`)} ${away}  ${dim(phaseLabel(m.phase, l))}`;
  }
  if (m.phase === "FINISHED") {
    const pens =
      m.score.penHome !== undefined
        ? ` (PSO ${m.score.penHome}-${m.score.penAway})`
        : "";
    return `${num}${gray(`FT  ${m.home.name} ${m.score.home} : ${m.score.away}${pens} ${m.away.name}`)}`;
  }
  return `${num}${dim(kickoffLabel(m.kickoff, lang))}  ${home} ${dim("vs")} ${away}`;
}

const NAME_COL = 22;
const NUM_COLS = [5, 3, 3, 3, 5, 4]; // P W D L GD Pts

export interface BracketOptions {
  lang: Lang;
  /** When set, data came from a stale cache written at this timestamp. */
  staleAt?: number | null;
}

/**
 * Scrollback bracket view: 12 group tables, then knockout round sections
 * (R32 → final). Not an alt-screen app — the terminal's own scrollback is
 * the navigation. Returns the numbered knockout matches for pickMatch.
 */
export function renderBracket(matches: Match[], opts: BracketOptions): Match[] {
  const { lang } = opts;
  const l = labels(lang);
  const out = process.stdout;

  if (opts.staleAt) {
    const at = new Date(opts.staleAt).toTimeString().slice(0, 5);
    out.write(yellow(`  ⚠ ${l.offline} · ${at} ${l.staleData}\n\n`));
  }

  // ── group stage ──
  const tables = computeGroupStandings(matches);
  if (tables.length > 0) out.write(`  ${bold(cyan(l.groupStage))}\n\n`);
  for (const table of tables) {
    const title = lang === "ko" ? `${table.group}조` : `Group ${table.group}`;
    const header = [
      padEndVisual(`     ${bold(title)}`, 5 + NAME_COL),
      ...l.standingsCols.map((c, i) => padEndVisual(dim(c), NUM_COLS[i]!)),
    ].join("");
    out.write(`${header}\n`);
    for (const r of table.rows) {
      const tied = r.tiedWithNext ? "=" : " ";
      const cells = [
        String(r.played),
        String(r.won),
        String(r.drawn),
        String(r.lost),
        (r.goalDiff > 0 ? `+${r.goalDiff}` : String(r.goalDiff)),
        String(r.points),
      ];
      const name = truncate(`${r.team.flag} ${r.team.name}`, NAME_COL - 1);
      out.write(
        `  ${dim(String(r.rank))}${tied} ${padEndVisual(name, NAME_COL)}` +
          cells.map((c, i) => padEndVisual(i === 5 ? bold(c) : c, NUM_COLS[i]!)).join("") +
          "\n",
      );
    }
    out.write("\n");
  }

  // ── knockout tree ──
  const pickable: Match[] = [];
  for (const round of buildBracket(matches)) {
    out.write(`  ${bold(cyan(roundLabel(round.kind, l)))}\n`);
    for (const m of round.matches) {
      pickable.push(m);
      const no = String(pickable.length).padStart(2);
      out.write(`  ${dim(no + ".")} ${slotLine(m, lang, l)}\n`);
    }
    out.write("\n");
  }
  return pickable;
}
