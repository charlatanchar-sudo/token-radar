# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/charlatanchar-sudo/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/charlatanchar-sudo/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed DefiLlama snapshot (taken 2026-11-14: 758 protocols at or above $5M TVL, a $50M watchlist floor, and a 40-protocol watchlist). It ranks the protocols that record no token yet by an implied launch value, and gives each one a concrete farm plan.

## The model

Every figure comes from the snapshot itself; no protocol is scored by name.

- **Category multiple.** For each category, take the tokened protocols in the snapshot and compute market cap / TVL. A category's multiple is the median of those ratios — each ratio first winsorized at 20x, so one token whose market cap has decoupled from its TVL cannot carry a category — shrunk toward the global median with weight 4, and clamped to [0.05, 8]. Categories with no tokened peer fall back to the global median (0.17 in this snapshot).
- **Implied value.** `implied = TVL x category multiple x momentum x seasoning`, rounded to whole dollars:
  - *momentum* = `1 + clamp(change_7d, -60%, +150%) x 0.5` — a protocol whose TVL grew 20% in the last week is carried 10% higher; unreported change is neutral.
  - *seasoning* = `1 + 0.15 x ln(1 + min(years listed, 10))` — the years between `listed_at` and the snapshot date spent with no token earn a mild premium; an unknown listing date is neutral.
- **Ranking.** By implied value, descending; ties break on TVL, then slug, so two runs over the same snapshot produce byte-identical output.

## Who is on the board

A protocol joins the board when its record shows no token (CoinGecko id and symbol both null) and it is not a wrapped, staked, bridged or exchange product of something whose token already trades — the watchlist's own tests, applied to the whole snapshot rather than only above the floor: the category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX; the name carries no whole word *wrapped*, *staked* or *staking*; the name does not begin with an exchange's name. One refinement: a trailing version marker (V2, 2.0, …) only marks a product when an earlier version's token actually trades, so a versioned protocol is excluded only when a tokened protocol in the snapshot shares its base name. In this snapshot that yields **209 rows**: all 40 watchlist protocols plus 169 early finds below or beside the floor. WBTC, USDT0 and the exchange balance sheets stay off the board.

## Farm plans

Each row carries five steps generated from the protocol's category, chains, TVL tier and age: set up and fund a wallet on its main chain, take the category's core position (supply/borrow for lending, LP and native swaps for a DEX, vault deposits for yield, and so on), deepen or diversify it, join its points/governance life, and hold with records kept. Every step states an estimated cost and how long it takes.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot (default `/input/snapshot.json`; `--input` also accepts the directory holding it) and writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory. It checks the board against the gate's shape before writing and refuses to emit an invalid one. Open `dashboard/index.html` from the output directory in a browser to use the radar: sortable columns, search, category and chain filters, a watchlist-only toggle, and a detail view per protocol showing the value breakdown and the farm plan. The page makes no network requests.

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
