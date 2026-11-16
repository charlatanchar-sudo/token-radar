// Farm plans: five concrete steps per protocol, generated from its category,
// its chains, its TVL tier and its age. Every step names the protocol, says
// what the action costs and how long it takes. Wording varies by a stable
// hash of the slug, so two protocols never read as the same paragraph and
// two runs over the same snapshot produce the same text byte for byte.

import type { Protocol } from './model.ts';

/** A tiny stable hash of the slug, for picking phrasing variants. */
function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

/** Working capital a farmer would sensibly bring, by the protocol's TVL tier. */
function capitalFor(tvl: number): string {
  if (tvl >= 250_000_000) return '$2,000-$10,000';
  if (tvl >= 50_000_000) return '$750-$2,500';
  if (tvl >= 15_000_000) return '$250-$750';
  return '$100-$250';
}

/** What it costs to get funds working on a chain, in words. */
function chainCosts(chain: string): { route: string; cost: string } {
  switch (chain) {
    case 'Ethereum':
      return { route: 'no bridge needed if your funds already sit on Ethereum', cost: '$10-30 in mainnet gas to get set up' };
    case 'Solana':
      return { route: 'bridge USDC over a CCTP route', cost: 'under $1 in bridge and network fees' };
    case 'Arbitrum':
    case 'Optimism':
    case 'Base':
    case 'Scroll':
    case 'Linea':
    case 'zkSync Era':
    case 'Mantle':
    case 'Blast':
    case 'Mode':
    case 'Taiko':
      return { route: 'bridge from Ethereum mainnet', cost: '$2-8 all-in for the bridge and first gas' };
    case 'Polygon':
      return { route: 'bridge from Ethereum or buy in directly', cost: '$1-4 all-in, with gas under $0.10 a transaction after that' };
    case 'Binance':
    case 'BSC':
      return { route: 'transfer from an exchange or bridge in', cost: '$1-3 all-in, with gas around $0.20 a transaction' };
    case 'Avalanche':
      return { route: 'bridge from Ethereum mainnet', cost: '$2-6 all-in for the bridge and first gas' };
    default:
      return { route: `bridge from Ethereum mainnet to ${chain}`, cost: '$2-10 all-in for the bridge and first gas' };
  }
}

interface Playbook {
  /** The two core position steps, as (protocol, chain, capital) templates. */
  core: [(name: string, chain: string, capital: string) => string, (name: string, chain: string, capital: string) => string];
  /** The recurring engagement step: points, governance, quests. */
  engage: (name: string, seed: number) => string;
}

const LENDING: Playbook = {
  core: [
    (n, c, cap) => `Supply ${cap} of a major asset (ETH or a dollar stablecoin) to ${n} on ${c} and leave it supplied: lenders who were in before any token announcement are the cohort these launches reward. Cost: one approval and one supply transaction, about $1-15 in gas on ${c}. Time: 10 minutes to open, then it works unattended.`,
    (n, c, cap) => `Borrow a modest 30-40% against the position on ${n} and re-supply the borrowed asset once, so the wallet shows both sides of the market without liquidation risk at normal volatility. Cost: two more transactions, about $1-15 in gas, plus the borrow interest spread. Time: 15 minutes, and check the health factor weekly.`,
  ],
  engage: (n, seed) => pick([
    `Vote in ${n}'s governance forum polls and join its community calls for a month: governance participation from a supplying wallet is cheap evidence of a real user. Cost: $0 beyond gas you already paid. Time: 20 minutes a week for 4 weeks.`,
    `Enrol the same wallet in any points or rewards programme ${n} is running and keep the supply position open while it runs; points seasons usually close just before a token announcement. Cost: $0 to enrol. Time: 5 minutes to enrol, nothing after.`,
  ], seed),
};

const DEX: Playbook = {
  core: [
    (n, c, cap) => `Add ${cap} of liquidity to a busy pair on ${n} (a stablecoin pair if you want no price risk, an ETH pair if you accept it) on ${c} and keep the LP position open. Cost: approval plus one deposit, about $1-12 in gas on ${c}. Time: 15 minutes to open.`,
    (n, c, cap) => `Route your ordinary swaps through ${n} itself rather than an aggregator, a few trades a week, so the wallet's volume is native to the exchange. Cost: the swap fees themselves, roughly 0.05-0.3% a trade. Time: 5 minutes a trade, two or three trades a week.`,
  ],
  engage: (n, seed) => pick([
    `Claim any trading or liquidity incentives ${n} shows in its interface each epoch and restake or hold what they pay in-protocol. Cost: one claim transaction a week, about $0.50-5 in gas. Time: 5 minutes a week.`,
    `Join ${n}'s quests and community programme with the same wallet that holds the LP position, so the activity ties to the position. Cost: $0. Time: 15 minutes a week for the first month.`,
  ], seed),
};

const PERPS: Playbook = {
  core: [
    (n, c, cap) => `Deposit ${cap} of margin collateral into ${n} on ${c} and open small, hedged positions rather than directional bets: the goal is genuine trading history, not profit. Cost: deposit gas of about $1-10 plus trading fees near 0.05% a side. Time: 20 minutes to set up.`,
    (n, c, cap) => `Trade a little every week on ${n} - open and close one modest position - so the wallet reads as an active trader across many weeks instead of one burst. Cost: roughly $2-10 a week in fees at small size. Time: 10 minutes a week for at least 8 weeks.`,
  ],
  engage: (n, seed) => pick([
    `Enter ${n}'s trading competitions or volume programmes with the same wallet when they run; standings there are a public record of use. Cost: only the trading fees you already pay. Time: no extra time beyond the weekly trades.`,
    `Provide liquidity to ${n}'s vault or market-making pool if it offers one, alongside the trading, so the wallet appears on both sides of the venue. Cost: one deposit transaction, about $1-10 in gas. Time: 10 minutes, then passive.`,
  ], seed),
};

const YIELD: Playbook = {
  core: [
    (n, c, cap) => `Deposit ${cap} into ${n}'s flagship vault or strategy on ${c} and hold the vault shares in the same wallet; vault depositors are the natural first holders of any token the strategy issues. Cost: approval plus deposit, about $1-12 in gas. Time: 10 minutes to open.`,
    (n, c, cap) => `Spread a second, smaller deposit across one more of ${n}'s strategies or a second chain it runs on, so the wallet shows breadth rather than a single click. Cost: one more deposit, about $1-12 in gas (plus a bridge if you use a second chain). Time: 15 minutes.`,
  ],
  engage: (n, seed) => pick([
    `Harvest and re-deposit the yield ${n} pays every couple of weeks instead of selling it: compounding wallets are visibly long-term users. Cost: one claim transaction a fortnight, about $0.50-8 in gas. Time: 5 minutes a fortnight.`,
    `Follow ${n}'s governance and strategy votes and vote with the depositing wallet when proposals open. Cost: $0 off-chain, or one small gas transaction on-chain. Time: 15 minutes a month.`,
  ], seed),
};

const CDP: Playbook = {
  core: [
    (n, c, cap) => `Open a vault on ${n} with ${cap} of ETH or a liquid staking token as collateral on ${c}, keeping the collateral ratio comfortably above 200% so the position survives ordinary swings. Cost: vault-opening gas of about $2-20 on ${c}. Time: 15 minutes to open.`,
    (n, c, cap) => `Mint a modest amount of ${n}'s stablecoin against the vault and put it to work in a stablecoin pool, so the wallet both issues and uses the protocol's own asset. Cost: mint and deposit gas, about $2-15. Time: 15 minutes, then hold for at least 8 weeks.`,
  ],
  engage: (n, seed) => pick([
    `Hold some of ${n}'s minted stablecoin in the wallet at all times rather than cycling it out: steady holders are the cohort a launch can snapshot at any moment. Cost: the opportunity cost of the balance only. Time: nothing ongoing.`,
    `Take part in ${n}'s parameter and collateral votes with the vault wallet; CDP governance is small and every regular voter is visible. Cost: $0 off-chain. Time: 15 minutes a month.`,
  ], seed),
};

const RWA: Playbook = {
  core: [
    (n, c, cap) => `Complete ${n}'s onboarding or allowlist step if it runs one, then deposit ${cap} into its flagship real-world-asset vault on ${c}. Cost: deposit gas of about $1-15, plus any identity check the vault requires. Time: 30-60 minutes including onboarding.`,
    (n, c, cap) => `Hold the vault position through at least two full yield distributions on ${n} instead of redeeming after the first, so the wallet's holding period spans quarters, not days. Cost: nothing beyond the first deposit. Time: passive for 8-12 weeks.`,
  ],
  engage: (n, seed) => pick([
    `Subscribe to ${n}'s holder reports and join its investor or community calls; RWA launches reward wallets that behaved like holders, not tourists. Cost: $0. Time: 30 minutes a month.`,
    `Add a second, smaller position in another of ${n}'s asset classes when one opens, so the wallet shows considered use of the platform. Cost: one deposit, about $1-15 in gas. Time: 15 minutes.`,
  ], seed),
};

const STAKING: Playbook = {
  core: [
    (n, c, cap) => `Stake ${cap} of the underlying asset through ${n} on ${c} and keep the staking position (and its receipt token, if one is issued) in the same wallet. Cost: one staking transaction, about $1-15 in gas on ${c}. Time: 10 minutes to open.`,
    (n, c, cap) => `Use a slice of the staking receipt in a money market or LP that ${n} itself points to, so the wallet shows up in the protocol's wider ecosystem too. Cost: one or two transactions, about $1-10 in gas. Time: 15 minutes.`,
  ],
  engage: (n, seed) => pick([
    `Restake or renew the position at each epoch boundary ${n} runs, rather than staking once and forgetting it: repeated epochs are the visible habit. Cost: one small transaction an epoch. Time: 5 minutes an epoch.`,
    `Join ${n}'s operator or governance discussions with the staking wallet and vote when polls open. Cost: $0. Time: 15 minutes a month.`,
  ], seed),
};

const GENERIC: Playbook = {
  core: [
    (n, c, cap) => `Become a real user of ${n} on ${c}: put ${cap} of working capital through its main flow (deposit, trade, mint or subscribe, whichever the product is) rather than a single token transaction. Cost: about $1-15 in gas on ${c} for the first session. Time: 20-30 minutes to learn the flow and complete it once.`,
    (n, c, cap) => `Repeat the core action on ${n} in smaller size every week or two, so the wallet builds a history across months instead of one day. Cost: about $1-10 a session in gas and fees. Time: 10 minutes a session, for at least 8 weeks.`,
  ],
  engage: (n, seed) => pick([
    `Link the same wallet to ${n}'s points, quests or community programme if one exists, and finish its starter tasks. Cost: $0 beyond gas already paid. Time: 20 minutes once, then 10 minutes a week.`,
    `Follow ${n}'s governance or announcement channels and act on one call to action a month (a vote, a testnet task, a feedback form) from the farming wallet. Cost: $0. Time: 15 minutes a month.`,
  ], seed),
};

const PLAYBOOKS: Record<string, Playbook> = {
  'Lending': LENDING,
  'Uncollateralized Lending': LENDING,
  'Dexs': DEX,
  'Derivatives': PERPS,
  'Options': PERPS,
  'Options Vault': PERPS,
  'Interest Rate Derivatives': PERPS,
  'Synthetics': PERPS,
  'Yield': YIELD,
  'Yield Aggregator': YIELD,
  'Farm': YIELD,
  'Leveraged Farming': YIELD,
  'Liquidity Manager': YIELD,
  'Onchain Capital Allocator': YIELD,
  'Risk Curators': YIELD,
  'Basis Trading': YIELD,
  'CDP': CDP,
  'CDP Manager': CDP,
  'Algo-Stables': CDP,
  'Dual-Token Stablecoin': CDP,
  'Stablecoin Issuer': CDP,
  'RWA': RWA,
  'Staking Pool': STAKING,
  'Restaking': STAKING,
  'Anchor BTC': STAKING,
  'Decentralized BTC': STAKING,
};

/** Five farm steps for one protocol, from its category, chains, TVL and age. */
export function farmSteps(p: Protocol, years: number | null): string[] {
  const seed = slugHash(p.slug);
  const book = (p.category !== null ? PLAYBOOKS[p.category] : undefined) ?? GENERIC;
  const chain = p.chains[0] ?? 'Ethereum';
  const capital = capitalFor(p.tvl_usd);
  const { route, cost } = chainCosts(chain);
  const moreChains = p.chains.length > 1 ? ` It also runs on ${p.chains[1]}${p.chains.length > 2 ? ` and ${p.chains.length - 2} more chain${p.chains.length > 3 ? 's' : ''}` : ''}, where the same wallet can repeat the routine.` : '';

  const setup = pick([
    `Set up a fresh wallet for ${p.name} and fund it on ${chain}: ${route}, bringing ${capital} of working capital. Cost: ${cost}. Time: about 20 minutes, once.`,
    `Use one wallet consistently for ${p.name}: move ${capital} onto ${chain} (${route}) and keep every later action in that same address. Cost: ${cost}. Time: about 20 minutes, once.`,
  ], seed);

  const seasoned = years !== null && years >= 3
    ? ` ${p.name} has been tracked since ${p.listed_at?.slice(0, 4)} with no token, so favour depth over speed: a smaller position held for months outweighs a large one held for a week.`
    : years !== null && years < 1
      ? ` ${p.name} was only listed in ${p.listed_at?.slice(0, 4)}, so early, consistent users are still a small cohort worth joining now.`
      : '';

  const keep = pick([
    `Hold the position for at least 8-12 weeks and keep the wallet's records (transaction hashes, dates, sizes) in a note: if ${p.name} announces a token, claims usually ask for exactly that history. Cost: the gas to exit one day, about $1-15. Time: 5 minutes a week of checking.${seasoned}`,
    `Stay in through at least two of ${p.name}'s own cycles (epochs, seasons or distributions) and do not empty the wallet between them; continuity is what separates a farmer from a snapshot tourist. Cost: nothing while you hold. Time: 5 minutes a week of checking.${seasoned}`,
  ], seed >> 3);

  return [
    setup,
    book.core[0](p.name, chain, capital),
    book.core[1](p.name, chain, capital),
    book.engage(p.name, seed >> 5) + moreChains,
    keep,
  ];
}
