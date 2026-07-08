# ⚽ termfc
```
████████╗███████╗██████╗ ███╗   ███╗███████╗ ██████╗
╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝
   ██║   █████╗  ██████╔╝██╔████╔██║█████╗  ██║
   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ██║
   ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║      ██████╗
   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝
```
[![CI](https://github.com/juunghyun/termfc/actions/workflows/ci.yml/badge.svg)](https://github.com/juunghyun/termfc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/termfc)](https://www.npmjs.com/package/termfc)

**FIFA World Cup 2026™ live text commentary in your terminal.**

Live scores, a ticking match clock, minute-by-minute commentary in Korean or
English, goal celebrations in ASCII — plus the full tournament bracket, group
standings and a kick-off waiting room, without leaving your terminal.

![termfc demo](https://raw.githubusercontent.com/juunghyun/termfc/main/docs/demo.gif)

## Quick start

```bash
npx termfc            # list live + upcoming matches, pick one to join
npx termfc demo       # offline demo (Portugal vs Spain, R16 2026) — try this first
```

or install globally:

```bash
npm i -g termfc
termfc
```

Requires Node.js >= 20. Zero runtime dependencies (single bundled file).

## Usage

```
termfc                     live + upcoming matches, pick one to join
termfc bracket             group tables + knockout bracket, pick a match to join
termfc live                matches in progress
termfc schedule            full tournament schedule, pick a match to join
termfc watch <team|id>     join a match directly (termfc watch KOR)
termfc replay [file]       replay a recorded match (no arg: list recordings)
termfc demo                bundled offline demo match

--lang ko|en               commentary language (default: ko, persisted)
--speed N                  replay/demo speed multiplier
--no-anim                  skip entrance/goal animations
--no-record                don't record watched matches
```

While watching: `q` quit · `s` skip animation.

## What you get

- **Live commentary** — every shot, save, corner, foul, card, VAR call and
  goal, timestamped with the match clock (`90'+1'`), in Korean (FIFA's
  official Korean feed) or English.
- **Readable over 90 minutes** — routine events older than ~15 match-minutes
  fold away automatically (goals, cards, subs and VAR always stay), a
  highlight strip under the score pins the key moments (`⚽90'+1' Merino`),
  and half-time/extra-time boundaries insert a score block.
- **Bracket & standings** — `termfc bracket` renders all twelve group tables
  (points, goal difference, head-to-head tiebreakers computed locally) and
  the full R32→final knockout tree with live scores; undecided slots show
  labels like "winner of 97". Pick any match to jump straight in.
- **Kick-off waiting room** — pick a match that hasn't started (from the
  list, `schedule` or `bracket`) and termfc shows a match card with a
  countdown, then starts the commentary automatically at kick-off. Polling
  stays polite while waiting (5-min → 60-s → 15-s cadence).
- **Ticking clock** — sources report whole minutes; termfc interpolates a
  per-second clock locally, freezes it at half-time, and shows stoppage time.
- **Score header + win probability** — live score always pinned on top, with
  a Poisson-model win/draw/loss estimate (derived from pre-match odds when
  available; clearly labelled as an estimate).
- **Goal celebrations** — ASCII fireworks with the scorer's name; entrance
  animation with both flags and the trophy when you join a match.
- **Replays** — every watched match is recorded locally as JSONL and can be
  replayed at any speed. A finished R16 match ships with the package as an
  offline demo.
- **Resilience** — FIFA's public endpoints are the primary source with ESPN
  as an automatic fallback (sticky per session, duplicate-goal suppression on
  switch). Network loss keeps the last snapshot on screen with a retry
  countdown — never a blank screen.

## Data sources & disclaimers

termfc reads the same public, keyless JSON endpoints that fifa.com and
espn.com use in the browser. It is **not affiliated with or endorsed by FIFA
or ESPN**. These endpoints are undocumented and may change or disappear at
any time — the adapter layer isolates that risk, and polling is deliberately
polite (~10s intervals, identified User-Agent). Match facts (scores, times,
events) are not copyrightable, and no FIFA/ESPN prose ships with this
package or repo: ESPN-fallback sentences are always generated locally from
structured event data, and the bundled demo match and recorded test fixtures
carry locally synthesized sentences too (`scripts/sanitize-fixtures.mjs`).
FIFA's own feed text only appears live on screen while you watch.

## Development

```bash
npm install
npm test              # vitest — unit + real-response fixture tests
npm run build         # tsup -> dist/cli.js (single ESM file)
node dist/cli.js demo
node scripts/dump-fifa-events.mjs     # refresh event-code map from live data
node scripts/sanitize-fixtures.mjs    # re-synthesize fixture sentences (no source prose)
node scripts/make-demo.mjs            # rebuild the bundled demo match
```

Architecture (ports & adapters): `core/` pure logic (model, diff, clock,
state machine, win probability, standings, bracket, timeline digest) ·
`data/` FIFA/ESPN adapters + failover behind one provider port · `engine/`
polling loop with a low-cost kick-off probe while waiting · `ui/`
self-contained ANSI renderer (no TUI framework) · `replay/` JSONL
recorder/player.

Releasing: merge a version-bump PR, then push a matching `v*` tag —
`release.yml` runs the checks, publishes to npm (trusted publishing) and
creates the GitHub Release automatically.

## License

MIT
