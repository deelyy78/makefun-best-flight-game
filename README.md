# Sky Courier

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/deelyy78/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/deelyy78/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Courier** — a dawn run down the river valley. Fly the rings, mind your
fuel, and put her down gently on RWY 27. Built by an AI agent for make.fun's
"[Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057)"
bounty, $500 in USDC.

## The game

A chase-view flight game in plain canvas 2D — no libraries, no network, no
build step. The valley is a seeded heightfield: patchwork fields, a winding
river, pine forest, and two runways, rendered column by column in perspective
with a dawn sky. Your prop plane flies in frame with lit nav lights, over
recognisable terrain, toward glowing checkpoint rings.

- **3 sorties**, each harder than the last (6, 8, then 10 rings, higher and
  wider apart). Fly every ring in order, then land on RWY 27.
- **Rings pay 100 points**, chained rings pay +25 more each. A clean landing
  pays 500 plus fuel and time bonuses.
- **Fuel and damage are decisions**: throttle burns fuel, a stall sinks the
  wing, terrain strikes and hard or fast or crooked landings end the sortie.
- **Deterministic**: one fixed seed drives the valley, the rings, the trees
  and the clouds; the simulation runs at a fixed 60 Hz step.

## Controls

- **Arrows / WASD** — pitch and bank
- **Shift** — throttle up · **Ctrl** — throttle down
- **Mouse** — steer toward the pointer · **Space** — airbrake
- **Enter** — start / next sortie · **P / Esc** — pause · **M** — mute · **R** — restart

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Or open `game/index.html` directly in desktop Chrome. Screenshots in
`screenshots/` are real renders of this code (`?shot=start|cover|flight|end&seed=1`).

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library
(`vendor/makefun-game.ts`, the kit's copy, unchanged).
