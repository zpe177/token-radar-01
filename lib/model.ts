// radar-2: the token radar's model.
//
// One sealed snapshot goes in; one ranked board comes out. The board must
// cover every slug on the snapshot's watchlist — the watchlist is a floor,
// never a ceiling — and it may add pre-token protocols that sit below the
// watchlist's $50M TVL floor. Those extra rows are the radar's whole point:
// the early names a token launch is most likely to come from.
//
// A protocol counts as pre-token when its record carries no token at all:
// no market cap, no CoinGecko id, no symbol. Protocols that already trade
// are kept apart in a live view and are never ranked, because their market
// cap is a fact and an implied value would be a guess on top of it.
//
// Implied value is one function of the snapshot's own figures, applied the
// same way to every protocol. No name is ever special-cased:
//
//   base     = tvl_usd x 0.25
//   growth   = 1 + clamp(change_7d, -40, 80) / 100 x 0.8
//   maturity = a sweet spot, not old-is-better: 0.85-0.95 under 90 days,
//              rising to 1.10 at 730 days, falling to 0.95 after three years;
//              unknown age scores 0.95
//   chain    = 1 + 0.03 x min(chains - 1, 5), so 1.00 to 1.15
//   category = token odds by category: Dexs, Lending and Risk Curators
//              1.08, Bridge and Liquid Staking 0.88, default 1.00
//   scale    = 1.15 for a small protocol down to 0.85 for a giant, on a
//              log10 TVL scale between $5M and $2.75B
//   data     = 0.95 when change_7d is missing, else 1.00
//   implied  = max(1, round(base x growth x maturity x chain x category
//              x scale x data))
//
// The reasoning, in one paragraph: TVL alone crowns the biggest watchlist
// names, so a log scale dampens size; a week's momentum gets real weight;
// a young fast grower is not punished for being young and a very old
// no-token protocol is not rewarded for merely surviving; spreading across
// chains is worth something; and bridge and staking wrappers, which rarely
// launch a fresh token, are marked down. Every constant is stated in the
// dashboard, so a reader can reproduce any row's number by hand.

/** One protocol entry from the sealed snapshot: its ten fields, no more. */
export interface SnapshotProtocol {
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

/** The whole snapshot document, as the sealed input carries it. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/**
 * The radar-2 constants, exactly as the dashboard states them. The sandbox
 * may change them, but the board and the dashboard must always agree.
 */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_bonus_per_chain: number;
  chain_max_bonus: number;
  scale_high: number;
  scale_low: number;
  missing_data_multiplier: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.8,
  growth_floor: -40,
  growth_cap: 80,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_bonus_per_chain: 0.03,
  chain_max_bonus: 0.15,
  scale_high: 1.15,
  scale_low: 0.85,
  missing_data_multiplier: 0.95,
};

/** The model version the dashboard names and the rules quote. */
export const MODEL_VERSION = 'radar-2';

/** Early rows carried below the watchlist floor, picked by this model. */
export const EARLY_ROWS = 160;

/** Live-token protocols carried in the dashboard's separate live view. */
export const LIVE_ROWS = 24;

// Age bands for the maturity curve, in days.
const AGE_YOUNG = 90;
const AGE_ONE_YEAR = 365;
const AGE_TWO_YEARS = 730;
const AGE_THREE_YEARS = 1095;

// TVL bounds for the scale dampener, in dollars.
const SCALE_FLOOR_TVL = 5_000_000;
const SCALE_TOP_TVL = 2_750_000_000;

const DAY_MS = 86_400_000;

/** A farm step: what to do, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    chain_multiplier: number;
    category_multiplier: number;
    scale_multiplier: number;
    data_multiplier: number;
  };
  farm_steps: string[];
}

/** One board row in the compact form the dashboard's data.js carries. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  category_multiplier: number;
  scale_multiplier: number;
  chain_count: number;
}

/** A live-token protocol, shown with the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** The headline counts for a board: watchlist, board, early, live. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Every multiplier behind one protocol's implied value, plus the value. */
export interface ScoreBreakdown {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  chainMult: number;
  categoryMult: number;
  scaleMult: number;
  dataMult: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** Clamp a number into [low, high]. */
function clampNumber(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** A finite number, or `fallback` when the value is missing or not finite. */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to four decimals, for the multipliers the board records. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Whole days from `listedAt` to `asOf`, never negative; null when either
 * date is absent or unparsable.
 */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const listedMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  return Math.max(0, Math.floor((asOfMs - listedMs) / DAY_MS));
}

/**
 * The maturity multiplier for an age in days. It climbs from 0.85 for a
 * brand-new protocol to a peak of 1.10 at two years, then eases back to
 * 0.95 for the oldest names: a launch is most likely once a protocol has
 * proven itself for a while, not at birth and not after years of waiting.
 */
export function ageMultiplier(age: number | null): number {
  if (age === null) return 0.95;
  if (age < AGE_YOUNG) return 0.85 + (age / AGE_YOUNG) * 0.1;
  if (age < AGE_ONE_YEAR) return 0.95 + ((age - AGE_YOUNG) / 275) * 0.1;
  if (age < AGE_TWO_YEARS) return 1.05 + ((age - AGE_ONE_YEAR) / AGE_ONE_YEAR) * 0.05;
  if (age < AGE_THREE_YEARS) return 1.1 - ((age - AGE_TWO_YEARS) / AGE_ONE_YEAR) * 0.05;
  return Math.max(0.95, 1.05 - (Math.min(age - AGE_THREE_YEARS, AGE_THREE_YEARS) / AGE_THREE_YEARS) * 0.1);
}

/**
 * Category token-odds, as an ordered table: the first rule whose keywords
 * appear in the category wins. Bridges and staking wrappers score low;
 * Dexs, lending and curators score high; everything else sits in between.
 * The order matters — a "Liquid Staking" name must hit the staking rule
 * before any later rule could claim it — so keep the table in this order.
 */
interface CategoryRule {
  keywords: string[];
  mult: number;
}

const CATEGORY_RULES: CategoryRule[] = [
  { keywords: ['bridge'], mult: 0.88 },
  { keywords: ['liquid staking', 'liquid restaking', 'restaked'], mult: 0.88 },
  { keywords: ['cex'], mult: 0.85 },
  { keywords: ['dex', 'lend', 'risk curator', 'onchain capital allocator'], mult: 1.08 },
  { keywords: ['yield', 'derivative', 'perpetual'], mult: 1.06 },
  { keywords: ['cdp', 'collateral'], mult: 1.04 },
  { keywords: ['staking pool'], mult: 0.92 },
  { keywords: ['rwa'], mult: 0.96 },
  { keywords: ['basis'], mult: 0.98 },
];

export function categoryMultiplier(category: string | null): number {
  const lowered = (category ?? '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((word) => lowered.includes(word))) return rule.mult;
  }
  return 1.0;
}

/** Multi-chain spread: +0.03 per extra chain, up to five extra chains. */
export function chainMultiplier(chains: string[], model: ModelConstants): number {
  const extra = clampNumber(chains.length - 1, 0, 5);
  return 1 + extra * model.chain_bonus_per_chain;
}

/**
 * Size dampener: 1.15 for a protocol at or below $5M of TVL, sliding on a
 * log10 scale to 0.85 at $2.75B and above, so giants do not win on size alone.
 */
export function scaleMultiplier(tvlUsd: number, model: ModelConstants): number {
  const span = Math.log10(SCALE_TOP_TVL / SCALE_FLOOR_TVL);
  const position = clampNumber(Math.log10(Math.max(tvlUsd, SCALE_FLOOR_TVL) / SCALE_FLOOR_TVL) / span, 0, 1);
  return model.scale_high - (model.scale_high - model.scale_low) * position;
}

/**
 * Score one protocol under radar-2 and return every multiplier behind the
 * number, so the board, the dashboard and a hand check can all show the
 * same working.
 */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): ScoreBreakdown {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finiteOr(protocol.change_7d, 0);
  const growthPct = clampNumber(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = ageMultiplier(age);
  const chainMult = chainMultiplier(protocol.chains, model);
  const categoryMult = categoryMultiplier(protocol.category);
  const scaleMult = scaleMultiplier(protocol.tvl_usd, model);
  const dataMult = protocol.change_7d === null ? model.missing_data_multiplier : 1;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * categoryMult * scaleMult * dataMult));
  return { implied, growthPct, growthMult, maturityMult, age, chainMult, categoryMult, scaleMult, dataMult };
}

/** The same scoring, under the name the dashboard's breakdown view uses. */
export function scoreBreakdownFor(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): ScoreBreakdown {
  return impliedValue(protocol, asOf, model);
}

/**
 * Risk notes for one protocol, from its own snapshot figures only: a
 * single chain, a sharp 7d fall or jump, a very young or very old age, a
 * low-odds category, or a TVL so large the implied value is mostly size.
 * At most three notes, sharpest first.
 */
export function riskNotesFor(p: SnapshotProtocol, age: number | null): string[] {
  const notes: string[] = [];
  if (p.chains.length === 1) {
    notes.push(`Single-chain on ${p.chains[0] ?? 'one chain'}: a failure there hits the whole position.`);
  }
  if (p.change_7d !== null && p.change_7d < -5) {
    notes.push(`TVL fell ${p.change_7d.toFixed(2)}% in 7 days: momentum is against the farm, add nothing until it flattens.`);
  }
  if (p.change_7d !== null && p.change_7d > 20) {
    notes.push(`TVL jumped +${p.change_7d.toFixed(2)}% in 7 days: fast growth can reverse as fast.`);
  }
  if (age !== null && age < 180) {
    notes.push(`Young protocol (${age}d): less track record, hold longer.`);
  }
  if (age !== null && age > AGE_THREE_YEARS) {
    notes.push(`Old with no token (${(age / 365).toFixed(1)}y): a launch is less certain the longer it waits.`);
  }
  const lowered = (p.category ?? '').toLowerCase();
  if (lowered.includes('bridge') || lowered.includes('staking')) {
    notes.push(`Category ${p.category}: token odds are lower than for Dexs / Lending.`);
  }
  if (p.tvl_usd >= 1e9) {
    notes.push('Large TVL: implied value here is mostly size, not a new launch.');
  }
  return notes.slice(0, 3);
}

/** A name ending in a release number is a versioned pool of another protocol. */
const RELEASE_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** True when a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when a protocol may be ranked: pre-token, not an exchange, not versioned. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !RELEASE_SUFFIX.test(p.name);
}

/** Index the snapshot's protocols by slug for the watchlist lookup. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((entry) => [entry.slug, entry]));
}

/** Strongest implied value first; ties break on slug so the order is stable. */
function compareScored(a: { implied: number; slug: string }, b: { implied: number; slug: string }): number {
  if (b.implied !== a.implied) return b.implied - a.implied;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/**
 * The ranked board: every watchlist slug first, then the early radar.
 * The watchlist is the floor — every slug, even one the snapshot no longer
 * carries, is claimed when present and never gambled on a missing record.
 * The early rows are pre-token protocols below the watchlist floor, picked
 * by implied value under this model (not by TVL alone, as the starter did),
 * capped at EARLY_ROWS, and never replacing a watchlist row. The whole set
 * is then scored once more, sorted strongest first, and numbered 1..n.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = indexBySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const found = index.get(slug);
    if (found !== undefined) chosen.set(slug, found);
  }

  const earlyCandidates = snapshot.protocols
    .filter((entry) => !chosen.has(entry.slug) && isRankable(entry) && entry.tvl_usd < snapshot.floor_usd)
    .map((entry) => ({ entry, implied: impliedValue(entry, snapshot.as_of, model).implied, slug: entry.slug }))
    .sort(compareScored)
    .slice(0, EARLY_ROWS);
  for (const candidate of earlyCandidates) chosen.set(candidate.entry.slug, candidate.entry);

  const scored = [...chosen.values()].map((entry) => {
    const score = impliedValue(entry, snapshot.as_of, model);
    return { entry, score, slug: entry.slug, implied: score.implied };
  });
  scored.sort(compareScored);

  // Keep the JSON key order the board has always carried, so the board's
  // bytes depend only on the scoring, never on this rewrite.
  return scored.map((item, position) => ({
    rank: position + 1,
    slug: item.entry.slug,
    name: item.entry.name,
    category: item.entry.category,
    chains: item.entry.chains,
    tvl_usd: item.entry.tvl_usd,
    change_7d: item.entry.change_7d,
    mcap_usd: item.entry.mcap_usd,
    listed_at: item.entry.listed_at,
    gecko_id: item.entry.gecko_id,
    symbol: item.entry.symbol,
    token_status: 'pre-token',
    age_days: item.score.age,
    implied_value_usd: item.score.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: item.score.growthPct,
      growth_multiplier: round4(item.score.growthMult),
      maturity_multiplier: round4(item.score.maturityMult),
      age_days: item.score.age,
      chain_multiplier: round4(item.score.chainMult),
      category_multiplier: round4(item.score.categoryMult),
      scale_multiplier: round4(item.score.scaleMult),
      data_multiplier: round4(item.score.dataMult),
    },
    farm_steps: farmSteps(item.entry, item.score.age).map(stepText),
  }));
}

/** One step as a single string: action, then cost and time, 20..600 chars. */
export function stepText(step: FarmStep): string {
  let rendered = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (rendered.length > 600) rendered = `${rendered.slice(0, 596)}...`;
  if (rendered.length < 20) rendered = `${rendered} Hold the position and check the protocol's own page.`;
  return rendered;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function stakeSize(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger gets a longer window. */
function holdWindow(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function primaryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis position on ${chain} and keep it open.`;
  if (c.includes('liquid staking') || c.includes('staking pool')) return `Stake $${capital} through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time, derived from the protocol's own record (category, chains, TVL, age,
 * 7d change) and never from a hand-written list of names. Step 3 repeats
 * the position on a second chain when there is one; step 5 is a real risk
 * check on this protocol's own 7d move and chain count.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = primaryChain(p);
  const capital = stakeSize(p);
  const hold = holdWindow(age);
  const action = primaryAction(p, capital, chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const growth = p.change_7d === null ? 'no 7d change reported' : `${p.change_7d > 0 ? '+' : ''}${p.change_7d.toFixed(2)}% in 7 days`;
  const thirdStep: FarmStep = secondChain !== null
    ? { text: `Repeat the same position with $${Math.max(25, Math.round(capital / 2))} on ${secondChain} so the farm is not single-chain: use the same wallet, the same ${p.category ?? 'protocol'} action, and keep both positions open.`, cost: `$${Math.max(25, Math.round(capital / 2))} of capital and about $4 of gas`, time: '15 minutes to set up' }
    : { text: `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote in ${p.name}.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, fund it with ${chain} gas and $${capital} of USDC, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    thirdStep,
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Risk check before adding more: ${p.name} moved ${growth} on $${Math.round(p.tvl_usd / 1e6)}M TVL across ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}; if the 7d move is negative, add nothing until it flattens.`,
      cost: 'nothing to check',
      time: '5 minutes',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind in tranches and keep enough ${chain} gas to exit.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((entry) => !isPreToken(entry) && entry.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      chains: entry.chains,
      tvl_usd: entry.tvl_usd,
      mcap_usd: entry.mcap_usd,
      change_7d: entry.change_7d,
    }));
}

/** A board row's compact form for data.js; the farm plan is rebuilt in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    category_multiplier: row.model.category_multiplier,
    scale_multiplier: row.model.scale_multiplier,
    chain_count: row.chains.length,
  };
}

/** Everything the dashboard renders, built from one scoring pass. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((row) => !snapshot.watchlist.includes(row.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Read one field as a string, or null when it is absent or not a string. */
function optionalString(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' ? (record[key] as string) : null;
}

/** Read one field as a finite number, or null when it is absent or not finite. */
function optionalNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The snapshot out of a file's text, refused unless it is the shape the
 * model scores: a dated document with a source, a positive floor, a
 * protocols array and a watchlist of slugs, each protocol carrying a slug,
 * a name and a finite TVL.
 */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((slug) => typeof slug !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = doc.protocols.map((value, position) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SnapshotError(`snapshot.json's protocol ${position} is not an object`);
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.slug !== 'string' || typeof entry.name !== 'string' || typeof entry.tvl_usd !== 'number' || !Number.isFinite(entry.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${position} lacks a slug, a name or a TVL`);
    }
    return {
      slug: entry.slug,
      name: entry.name,
      category: optionalString(entry, 'category'),
      chains: Array.isArray(entry.chains) ? entry.chains.filter((chain): chain is string => typeof chain === 'string') : [],
      tvl_usd: entry.tvl_usd,
      change_7d: optionalNumber(entry, 'change_7d'),
      mcap_usd: optionalNumber(entry, 'mcap_usd'),
      listed_at: optionalString(entry, 'listed_at'),
      gecko_id: optionalString(entry, 'gecko_id'),
      symbol: optionalString(entry, 'symbol'),
    };
  });
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null when it passes:
 * watchlist coverage, a 1..n rank sequence, descending implied value, no
 * single shared value across the whole board, and farm steps of 3..12 per
 * row at 20..600 characters each, with a positive integer implied value.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const covered = new Set(board.map((row) => row.slug));
  const missing = snapshot.watchlist.filter((slug) => !covered.has(slug));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
    }
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
