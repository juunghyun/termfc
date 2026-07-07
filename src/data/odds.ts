import type { Match } from "../core/model.js";
import {
  estimateLambdas,
  impliedFromOdds,
  type WinProb,
} from "../core/winprob.js";
import { ESPN_BASE, ESPN_WC_SLUG } from "./espn.js";
import { getJson } from "./provider.js";

function americanToDecimal(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x) || x === 0) return null;
  return x > 0 ? 1 + x / 100 : 1 + 100 / Math.abs(x);
}

/**
 * Best-effort pre-match odds -> Poisson λ estimation (win probability prior).
 * Returns null when no odds are available; callers fall back to defaults.
 */
export async function fetchPreMatchLambdas(
  match: Match,
): Promise<{ lh: number; la: number } | null> {
  const ref = match.sourceRefs.espn;
  if (!ref) return null;
  try {
    const data = await getJson(
      `${ESPN_BASE}/${ESPN_WC_SLUG}/summary?event=${ref.eventId}`,
    );
    const candidates = [
      ...(Array.isArray(data?.pickcenter) ? data.pickcenter : []),
      ...(Array.isArray(data?.odds) ? data.odds : []),
    ];
    for (const pc of candidates) {
      const h = americanToDecimal(pc?.homeTeamOdds?.moneyLine);
      const a = americanToDecimal(pc?.awayTeamOdds?.moneyLine);
      const d = americanToDecimal(pc?.drawOdds?.moneyLine);
      if (h && a && d) {
        const prior: WinProb = impliedFromOdds({ home: h, draw: d, away: a });
        return estimateLambdas(prior);
      }
    }
    return null;
  } catch {
    return null;
  }
}
