import { describe, expect, it } from "vitest";
import {
  estimateLambdas,
  impliedFromOdds,
  liveWinProb,
} from "../src/core/winprob.js";

const sum = (p: { home: number; draw: number; away: number }) =>
  p.home + p.draw + p.away;

describe("winprob", () => {
  it("implied odds normalize the bookmaker margin away", () => {
    const p = impliedFromOdds({ home: 2.0, draw: 3.4, away: 4.0 });
    expect(sum(p)).toBeCloseTo(1, 10);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("probabilities always sum to 1", () => {
    const p = liveWinProb({ scoreHome: 1, scoreAway: 0, elapsedFraction: 0.5 });
    expect(sum(p)).toBeCloseTo(1, 10);
  });

  it("a lead becomes near-certain as time runs out", () => {
    const early = liveWinProb({
      scoreHome: 1,
      scoreAway: 0,
      elapsedFraction: 0.1,
    });
    const late = liveWinProb({
      scoreHome: 1,
      scoreAway: 0,
      elapsedFraction: 0.98,
    });
    expect(late.home).toBeGreaterThan(early.home);
    expect(late.home).toBeGreaterThan(0.9);
  });

  it("level game at kickoff roughly reflects the prior", () => {
    const lambdas = estimateLambdas({ home: 0.5, draw: 0.25, away: 0.25 });
    const p = liveWinProb({
      scoreHome: 0,
      scoreAway: 0,
      elapsedFraction: 0,
      lambdas,
    });
    expect(p.home).toBeGreaterThan(p.away);
    expect(Math.abs(p.home - 0.5)).toBeLessThan(0.12);
  });
});
