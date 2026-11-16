// Token Launch Radar — the value model.
//
// One sealed DefiLlama snapshot in, one ranked board out. Every number on the
// board is computed from the snapshot's own fields; no protocol name is ever
// special-cased, and the same function scores every row.
//
// THE MODEL
//   The snapshot's tokened protocols (mcap_usd recorded) say what the market
//   currently pays per dollar of TVL in each category:
//
//     multiple(category) = shrunk median of mcap_usd / tvl_usd over the
//                          category's tokened protocols, shrunk toward the
//                          global median with weight SHRINK_K, then clamped
//                          to [MULTIPLE_MIN, MULTIPLE_MAX]. Each protocol's
//                          own multiple is first winsorized at 20x, so one
//                          token whose market cap has decoupled from its TVL
//                          (a $7M-TVL protocol carrying a 400x multiple is
//                          in this snapshot) cannot carry a whole category.
//
//   A pre-token protocol's implied value is its TVL carried at that multiple,
//   adjusted by two factors that also come straight from the snapshot:
//
//     base        = tvl_usd x multiple(category)
//     momentum    = 1 + clamp(change_7d, -60, +150) / 100 x 0.5
//                   (change_7d is in per cent; a protocol whose TVL grew 20%
//                   in a week is carried 10% higher, one that fell 40% is
//                   carried 20% lower; unreported change is neutral)
//     seasoning   = 1 + 0.15 x ln(1 + min(years listed, 10))
//                   (years between listed_at and the snapshot's as_of spent
//                   with no token: a longer record earns a mild premium;
//                   an unknown listing date is neutral)
//     implied     = round(base x momentum x seasoning), at least $1
//
//   Rows are ranked by implied value, highest first; ties break on TVL, then
//   on slug, so two runs over the same snapshot agree byte for byte.
//
// MEMBERSHIP
//   A protocol joins the board when its record shows no token (gecko_id and
//   symbol both null) and it is not a wrapped, staked, bridged or exchange
//   product of something whose token already trades. The product tests are
//   the watchlist's own, applied to the whole snapshot, not just the floor:
//   the category is not Bridge, Canonical Bridge, Liquid Staking, Liquid
//   Restaking, Restaked BTC or CEX; the name carries no whole word wrapped,
//   staked or staking; the name does not begin with an exchange's name. The
//   one refinement is the version marker: a name ending in V2, 2.0 or the
//   like is only a product when an earlier version's token actually trades,
//   so a versioned protocol is excluded only when a tokened protocol in the
//   snapshot shares its base name. (In this snapshot none of the eleven
//   versioned pre-token protocols has a tokened sibling, so all eleven are
//   ranked; WBTC, USDT0 and the exchange balance sheets stay off the board.)

import { farmSteps } from './farm.ts';

/** One protocol entry of the sealed snapshot: exactly the ten fields it carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot, validated. */
export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** One ranked row of the board: the gate's fields plus the model's working. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  tvl_usd: number;
  category: string | null;
  chains: string[];
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  multiple: number;
  base_value_usd: number;
  momentum_factor: number;
  seasoning_factor: number;
  years_listed: number | null;
}

/** Everything the dashboard renders, written to data.js beside the page. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  protocol_count: number;
  watchlist_count: number;
  board_count: number;
  global_multiple: number;
  model_summary: string;
  rows: BoardRow[];
  categories: string[];
  chains: string[];
}

/** The model's constants, in one place so the dashboard can state them. */
export const MODEL = {
  shrinkK: 4,
  multipleMin: 0.05,
  multipleMax: 8,
  momentumWeight: 0.5,
  momentumFloorPct: -60,
  momentumCapPct: 150,
  seasoningWeight: 0.15,
  seasoningCapYears: 10,
} as const;

export const MODEL_SUMMARY =
  'Implied value = TVL x the category multiple (the shrunk median market-cap/TVL of that ' +
  'category\'s tokened protocols in this snapshot), adjusted for 7-day TVL momentum and for ' +
  'the years the protocol has run with no token. Every figure comes from the sealed snapshot; ' +
  'no protocol is scored by name.';

/** Categories that mark a protocol as a product of another, per the watchlist rule. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchanges whose name at the front of a protocol's name marks it as theirs. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word that marks a wrapped or staked product. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** A version marker at the end of a name: a space, then V2, v3, 2.0 and the like. */
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function need(cond: boolean, what: string): void {
  if (!cond) throw new Error(`snapshot: ${what}`);
}

/** Parse and validate the sealed snapshot; throws on anything malformed. */
export function parseSnapshot(text: string): Snapshot {
  const raw: unknown = JSON.parse(text);
  need(isRecord(raw), 'the root is not an object');
  need(typeof raw.as_of === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.as_of), 'as_of is not a date');
  need(typeof raw.floor_usd === 'number' && raw.floor_usd > 0, 'floor_usd is not a positive number');
  need(Array.isArray(raw.protocols), 'protocols is not an array');
  need(Array.isArray(raw.watchlist), 'watchlist is not an array');

  const protocols: Protocol[] = raw.protocols.map((entry: unknown, i: number) => {
    need(isRecord(entry), `protocols[${i}] is not an object`);
    const p = entry as Record<string, unknown>;
    need(typeof p.slug === 'string' && p.slug.length > 0, `protocols[${i}].slug is missing`);
    need(typeof p.name === 'string' && p.name.length > 0, `protocols[${i}].name is missing`);
    need(p.category === null || typeof p.category === 'string', `protocols[${i}].category is malformed`);
    need(Array.isArray(p.chains) && p.chains.every((c) => typeof c === 'string'), `protocols[${i}].chains is malformed`);
    need(typeof p.tvl_usd === 'number' && Number.isFinite(p.tvl_usd) && p.tvl_usd >= 0, `protocols[${i}].tvl_usd is malformed`);
    need(p.change_7d === null || typeof p.change_7d === 'number', `protocols[${i}].change_7d is malformed`);
    need(p.mcap_usd === null || typeof p.mcap_usd === 'number', `protocols[${i}].mcap_usd is malformed`);
    need(p.listed_at === null || typeof p.listed_at === 'string', `protocols[${i}].listed_at is malformed`);
    need(p.gecko_id === null || typeof p.gecko_id === 'string', `protocols[${i}].gecko_id is malformed`);
    need(p.symbol === null || typeof p.symbol === 'string', `protocols[${i}].symbol is malformed`);
    return {
      slug: p.slug as string,
      name: p.name as string,
      category: p.category as string | null,
      chains: [...(p.chains as string[])],
      tvl_usd: p.tvl_usd as number,
      change_7d: p.change_7d as number | null,
      mcap_usd: p.mcap_usd as number | null,
      listed_at: p.listed_at as string | null,
      gecko_id: p.gecko_id as string | null,
      symbol: p.symbol as string | null,
    };
  });

  const slugs = new Set<string>();
  for (const p of protocols) {
    need(!slugs.has(p.slug), `duplicate protocol slug ${p.slug}`);
    slugs.add(p.slug);
  }
  const watchlist = raw.watchlist.map((s: unknown) => {
    need(typeof s === 'string', 'a watchlist entry is not a slug');
    need(slugs.has(s as string), `watchlist slug ${String(s)} is not in protocols`);
    return s as string;
  });
  return { as_of: raw.as_of as string, floor_usd: raw.floor_usd as number, protocols, watchlist };
}

/** A protocol records no token when both its CoinGecko id and its symbol are null. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The category multiples: for every category, the median mcap/TVL of its
 * tokened protocols, shrunk toward the global median by the count of
 * observations, then clamped. Also returns the global median itself.
 */
export function categoryMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.min(20, p.mcap_usd / p.tvl_usd);
    all.push(ratio);
    if (p.category !== null) {
      const list = ratiosByCategory.get(p.category) ?? [];
      list.push(ratio);
      ratiosByCategory.set(p.category, list);
    }
  }
  need(all.length > 0, 'no tokened protocol carries a market cap: no multiples to derive');
  const global = median(all);
  const byCategory = new Map<string, number>();
  for (const [category, ratios] of ratiosByCategory) {
    const shrunk = (ratios.length * median(ratios) + MODEL.shrinkK * global) / (ratios.length + MODEL.shrinkK);
    byCategory.set(category, Math.min(MODEL.multipleMax, Math.max(MODEL.multipleMin, shrunk)));
  }
  return { byCategory, global };
}

/** Whole years (to two decimals) between a listing date and the snapshot's as_of; null when unknown. */
export function yearsListed(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return round2((end - start) / (365.25 * 86_400_000));
}

/** The base name of a versioned protocol: its name with the version marker off. */
function baseName(name: string): string {
  return name.replace(VERSION_SUFFIX, '').trim().toLowerCase();
}

/**
 * Board membership: records no token, and is not a wrapped, staked, bridged
 * or exchange product of a tokened protocol (see the header comment).
 */
export function isBoardMember(p: Protocol, tokenedBaseNames: Set<string>): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (VERSION_SUFFIX.test(p.name) && tokenedBaseNames.has(baseName(p.name))) return false;
  return true;
}

/** Score one protocol: its implied value and every component of it. */
export function scoreProtocol(
  p: Protocol,
  multiples: { byCategory: Map<string, number>; global: number },
  asOf: string,
): { implied: number; multiple: number; base: number; momentum: number; seasoning: number; years: number | null } {
  const multiple = (p.category !== null ? multiples.byCategory.get(p.category) : undefined) ?? multiples.global;
  const base = p.tvl_usd * multiple;
  const change = p.change_7d === null ? 0 : Math.min(MODEL.momentumCapPct, Math.max(MODEL.momentumFloorPct, p.change_7d));
  const momentum = 1 + (change / 100) * MODEL.momentumWeight;
  const years = yearsListed(asOf, p.listed_at);
  const seasoning = years === null ? 1 : 1 + MODEL.seasoningWeight * Math.log(1 + Math.min(years, MODEL.seasoningCapYears));
  const implied = Math.max(1, Math.round(base * momentum * seasoning));
  return { implied, multiple, base, momentum, seasoning, years };
}

/** Build the ranked board and the dashboard's data from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const multiples = categoryMultiples(snapshot);
  const tokenedBaseNames = new Set(
    snapshot.protocols.filter((p) => !recordsNoToken(p)).map((p) => baseName(p.name)),
  );
  const watch = new Set(snapshot.watchlist);

  const scored = snapshot.protocols
    .filter((p) => isBoardMember(p, tokenedBaseNames))
    .map((p) => ({ p, s: scoreProtocol(p, multiples, snapshot.as_of) }));

  // Rank by implied value; ties fall to TVL, then to slug: fully deterministic.
  scored.sort((a, b) => b.s.implied - a.s.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const board: BoardRow[] = scored.map(({ p, s }, i) => ({
    slug: p.slug,
    name: p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(p, s.years),
    tvl_usd: p.tvl_usd,
    category: p.category,
    chains: p.chains,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    watchlist: watch.has(p.slug),
    multiple: round4(s.multiple),
    base_value_usd: Math.round(s.base),
    momentum_factor: round4(s.momentum),
    seasoning_factor: round4(s.seasoning),
    years_listed: s.years,
  }));

  const categories = [...new Set(board.map((r) => r.category ?? 'Uncategorized'))].sort();
  const chains = [...new Set(board.flatMap((r) => r.chains))].sort();
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    watchlist_count: snapshot.watchlist.length,
    board_count: board.length,
    global_multiple: round4(multiples.global),
    model_summary: MODEL_SUMMARY,
    rows: board,
    categories,
    chains,
  };
  return { board, radar };
}

/**
 * The board checked against the gate's own rows, in this program's words.
 * Returns the first problem found, or null when the board is fit to write.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100 to 4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!known.has(row.slug)) return `${row.slug} is not one of the snapshot's protocols`;
    if (seen.has(row.slug)) return `${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.name.trim().length === 0) return `${row.slug} has an empty name`;
    if (!Number.isInteger(row.rank) || row.rank < 1) return `${row.slug} has a bad rank`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) {
      return `${row.slug} has an implied value outside 1 to 1e14`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug} has ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 'no'} farm steps, outside 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const len = typeof step === 'string' ? step.trim().length : 0;
      if (len < 20 || len > 600) return `${row.slug} has a farm step of ${len} trimmed characters, outside 20 to 600`;
    }
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `ranks are not exactly 1 to ${byRank.length}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${i + 1}`;
    }
  }
  if (board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every implied value is the same';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data as a script the page loads: one global, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}
