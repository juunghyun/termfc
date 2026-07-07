export interface WinProb {
  home: number;
  draw: number;
  away: number;
}

export interface DecimalOdds {
  home: number;
  draw: number;
  away: number;
}

/** Remove the bookmaker margin from decimal odds -> implied probabilities. */
export function impliedFromOdds(odds: DecimalOdds): WinProb {
  const h = 1 / odds.home;
  const d = 1 / odds.draw;
  const a = 1 / odds.away;
  const s = h + d + a;
  return { home: h / s, draw: d / s, away: a / s };
}

function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

const MAX_GOALS = 10;

/** P(home win / draw / away win) for independent Poisson goal counts. */
function outcomeProbs(lh: number, la: number, diff = 0): WinProb {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let gh = 0; gh <= MAX_GOALS; gh++) {
    const ph = poissonPmf(gh, lh);
    for (let ga = 0; ga <= MAX_GOALS; ga++) {
      const p = ph * poissonPmf(ga, la);
      const final = diff + gh - ga;
      if (final > 0) home += p;
      else if (final < 0) away += p;
      else draw += p;
    }
  }
  const s = home + draw + away;
  return { home: home / s, draw: draw / s, away: away / s };
}

/**
 * Estimate full-match expected goals (λ_home, λ_away) whose Poisson outcome
 * probabilities best match a pre-match prior. Coarse grid search — runs once
 * per match, a few ms.
 */
export function estimateLambdas(prior: WinProb): { lh: number; la: number } {
  let best = { lh: 1.3, la: 1.1 };
  let bestErr = Infinity;
  for (let lh = 0.3; lh <= 3.2; lh += 0.1) {
    for (let la = 0.3; la <= 3.2; la += 0.1) {
      const p = outcomeProbs(lh, la);
      const err =
        (p.home - prior.home) ** 2 +
        (p.draw - prior.draw) ** 2 +
        (p.away - prior.away) ** 2;
      if (err < bestErr) {
        bestErr = err;
        best = { lh, la };
      }
    }
  }
  return best;
}

export const DEFAULT_LAMBDAS = { lh: 1.35, la: 1.15 };

/**
 * Live win probability: remaining expected goals are the pre-match λ scaled
 * by remaining match fraction; convolve with the current score.
 *
 * `elapsedFraction` ∈ [0,1] over regulation time. Estimates are labelled as
 * such in the UI; extra time / penalties are out of scope (UI hides them).
 */
export function liveWinProb(opts: {
  scoreHome: number;
  scoreAway: number;
  elapsedFraction: number;
  lambdas?: { lh: number; la: number };
}): WinProb {
  const { lh, la } = opts.lambdas ?? DEFAULT_LAMBDAS;
  const remaining = Math.min(1, Math.max(0, 1 - opts.elapsedFraction));
  const diff = opts.scoreHome - opts.scoreAway;
  return outcomeProbs(lh * remaining, la * remaining, diff);
}
