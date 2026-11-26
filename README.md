# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zpe177/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zpe177/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's token-radar-01 bounty ($1,325, entries close 2026-12-14).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

Intended repository: `zpe177/token-radar-01` (GitHub account `zpe177`, linked to make.fun account `@roem`). No `.makefun/owner.json` is needed: the repository owner is the linked GitHub login, so the repo_owner check passes on ownership alone.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at `/input/snapshot.json` — 758 DefiLlama protocols as of 2026-11-14, 40 on the watchlist at a $50M TVL floor — scores every pre-token protocol, writes the ranked board to `/output/board.json`, writes the dashboard data to `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json`.

## Model: radar-2

Implied value is computed only from the snapshot's own figures, the same function for every protocol, no name special-cased:

```
implied = round( tvl_usd x 0.25
  x growth   (1 + clamp(change_7d, -40, 80) / 100 x 0.8)
  x age      (sweet spot: 0.85 under 90d, rising to 1.10 at 730d, falling to 0.95 after 3y; unknown age 0.95)
  x chain    (1 + 0.03 x min(chains - 1, 5), 1.00–1.15)
  x category (Dexs / Lending / Risk Curators 1.08, Bridge / Liquid Staking 0.88, default 1.00)
  x scale    (1.15 small to 0.85 large, log10 TVL)
  x data     (0.95 when change_7d is missing, else 1.00) )
```

The board holds 200 rows: all 40 watchlist protocols, plus the 160 best pre-token protocols below the $50M floor **by this model** (not by TVL alone). 24 live-token protocols are set aside in a separate Live view with their market caps, never mixed into the ranking. Each row carries a 7-step farm plan derived from its category, chains, TVL, age and 7d change, including a second-chain step when the protocol is multi-chain and a risk check on its own 7d move.

## Dashboard

Static page, no framework, no network: `dashboard/index.html`, `app.css`, `app.js` read `data.js` beside them.

- Search by name, slug, category or chain; filter by category and by chain; sort by implied value, TVL, 7d change, age or name
- Pre-token board and a separate Live-token view
- Detail view per protocol: score breakdown (growth / age / chain / category / scale / data multipliers), risk notes, and the 7-step farm plan with cost and time per step
- Model panel states the full radar-2 formula and constants

## Run locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Two runs write byte-identical output. Local gate check (all seven rows from the kit's RULES.txt — dashboard files, board file, sorted by value, watchlist coverage, farm steps, screenshots, dossier match) passes; the sealed scorer itself runs only on make.fun's server for this program/v1 competition, so `grade-local` reports that and cannot run it locally.

## Screenshots

`screenshots/` holds 3 images (board, detail, filtered), 1440×900, each under 512 KiB, re-rendered from this dashboard with a headless browser at 1440×900:

- `1-board.png` — `dashboard/index.html` with no filter
- `2-detail.png` — same page with a protocol detail open (e.g. `#p=steakhouse-financial`)
- `3-filtered.png` — same page filtered to one category or chain (e.g. `#category=Dexs`)

## Files

- `main.ts` — entrypoint, Node 22 standard library only
- `lib/model.ts` — radar-2 model, board, farm plans
- `dashboard/` — static dashboard (index.html, app.css, app.js)
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte for byte
- `screenshots/` — 3 screenshots
- `LICENSE` — MIT
