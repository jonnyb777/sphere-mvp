// FILE: src/utils/mappings.js

/**
 * Central mapping utilities for Sphere MVP.
 * - Company directory: for typeahead autocomplete (company -> ticker)
 * - Helpers: search companies, normalize input
 * - Merchant classification: merchant -> sector (and optional ticker)
 *
 * Keep this small & editable for MVP. In the live product, this can come from
 * a backend table/API.
 */

export const COMPANY_DIRECTORY = [
  // Technology
  { name: "Apple", ticker: "AAPL", sector: "Technology" },
  { name: "Microsoft", ticker: "MSFT", sector: "Technology" },
  { name: "NVIDIA", ticker: "NVDA", sector: "Technology" },
  { name: "Alphabet (Google)", ticker: "GOOGL", sector: "Technology" },
  { name: "Meta Platforms", ticker: "META", sector: "Technology" },
  { name: "Broadcom", ticker: "AVGO", sector: "Technology" },
  { name: "Advanced Micro Devices", ticker: "AMD", sector: "Technology" },
  { name: "Oracle", ticker: "ORCL", sector: "Technology" },
  { name: "Dell Technologies", ticker: "DELL", sector: "Technology" },

  // Consumer & Retail
  { name: "Amazon", ticker: "AMZN", sector: "Consumer & Retail" },
  { name: "Target", ticker: "TGT", sector: "Consumer & Retail" },
  { name: "Walmart", ticker: "WMT", sector: "Consumer & Retail" },
  { name: "Costco", ticker: "COST", sector: "Consumer & Retail" },
  { name: "Home Depot", ticker: "HD", sector: "Consumer & Retail" },
  { name: "Lowe's", ticker: "LOW", sector: "Consumer & Retail" },
  { name: "Macy's", ticker: "M", sector: "Consumer & Retail" },

  // Healthcare
  { name: "UnitedHealth Group", ticker: "UNH", sector: "Healthcare" },
  { name: "Johnson & Johnson", ticker: "JNJ", sector: "Healthcare" },
  { name: "Merck", ticker: "MRK", sector: "Healthcare" },
  { name: "Pfizer", ticker: "PFE", sector: "Healthcare" },
  { name: "AbbVie", ticker: "ABBV", sector: "Healthcare" },
  { name: "CVS Health", ticker: "CVS", sector: "Healthcare" },

  // Financials
  { name: "JPMorgan Chase", ticker: "JPM", sector: "Financials" },
  { name: "Bank of America", ticker: "BAC", sector: "Financials" },
  { name: "Goldman Sachs", ticker: "GS", sector: "Financials" },
  { name: "Morgan Stanley", ticker: "MS", sector: "Financials" },
  { name: "Citigroup", ticker: "C", sector: "Financials" },
  { name: "Visa", ticker: "V", sector: "Financials" },
  { name: "Mastercard", ticker: "MA", sector: "Financials" },

  // Energy
  { name: "Exxon Mobil", ticker: "XOM", sector: "Energy" },
  { name: "Chevron", ticker: "CVX", sector: "Energy" },
  { name: "ConocoPhillips", ticker: "COP", sector: "Energy" },
  { name: "Schlumberger", ticker: "SLB", sector: "Energy" },
  { name: "Phillips 66", ticker: "PSX", sector: "Energy" },

  // Restaurants
  { name: "McDonald's", ticker: "MCD", sector: "Restaurants" },
  { name: "Starbucks", ticker: "SBUX", sector: "Restaurants" },
  { name: "Chipotle", ticker: "CMG", sector: "Restaurants" },
  { name: "Yum! Brands", ticker: "YUM", sector: "Restaurants" },
  { name: "Domino's", ticker: "DPZ", sector: "Restaurants" },
  { name: "Wendy's", ticker: "WEN", sector: "Restaurants" },

  // Transportation
  { name: "Uber", ticker: "UBER", sector: "Transportation" },
  { name: "FedEx", ticker: "FDX", sector: "Transportation" },
  { name: "UPS", ticker: "UPS", sector: "Transportation" },
  { name: "Delta Air Lines", ticker: "DAL", sector: "Transportation" },
  { name: "Southwest Airlines", ticker: "LUV", sector: "Transportation" },

  // Media & Entertainment
  { name: "Netflix", ticker: "NFLX", sector: "Media & Entertainment" },
  { name: "Disney", ticker: "DIS", sector: "Media & Entertainment" },
  { name: "Spotify", ticker: "SPOT", sector: "Media & Entertainment" },
  { name: "Warner Bros. Discovery", ticker: "WBD", sector: "Media & Entertainment" }
];

export function normalizeText(s) {
  return String(s || "").toLowerCase().trim();
}

/**
 * Typeahead search:
 * - matches on company name OR ticker
 * - returns top N best matches
 */
export function searchCompanies(query, limit = 8) {
  const q = normalizeText(query);
  if (!q) return [];

  const scored = COMPANY_DIRECTORY.map((c) => {
    const name = normalizeText(c.name);
    const ticker = normalizeText(c.ticker);

    // simple scoring: startsWith beats includes; ticker match gets boost
    let score = 0;
    if (ticker === q) score += 200;
    if (ticker.startsWith(q)) score += 120;
    if (name.startsWith(q)) score += 90;
    if (ticker.includes(q)) score += 60;
    if (name.includes(q)) score += 40;

    return { ...c, _score: score };
  })
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);

  return scored;
}

export function companyLabel(c) {
  if (!c) return "";
  return `${c.name} (${c.ticker})`;
}

export function findCompanyByTicker(ticker) {
  const t = String(ticker || "").trim().toUpperCase();
  return COMPANY_DIRECTORY.find((c) => String(c.ticker).toUpperCase() === t) || null;
}

/* =========================================================
   Merchant → Sector (and optional Ticker) Rules
   Goal:
   - Make Drip/Flow sectoring accurate even when no ticker exists.
   - Keep rules simple, readable, and easy to extend.
   Notes:
   - "sector" is your Sphere sector label (not GICS).
   - Some merchants also map to a public ticker; many won't.
   ========================================================= */

const MERCHANT_RULES = [
  // Consumer & Retail
  { re: /\bamazon\b|\bamzn\b|\bamzn mktp\b|\bamazon marketplace\b/i, sector: "Consumer & Retail", ticker: "AMZN" },
  { re: /\btarget\b/i, sector: "Consumer & Retail", ticker: "TGT" },
  { re: /\bwalmart\b|\bwal-mart\b/i, sector: "Consumer & Retail", ticker: "WMT" },
  { re: /\bcostco\b/i, sector: "Consumer & Retail", ticker: "COST" },
  { re: /\bhome depot\b/i, sector: "Consumer & Retail", ticker: "HD" },
  { re: /\blowe'?s\b/i, sector: "Consumer & Retail", ticker: "LOW" },
  { re: /\bmacy'?s\b|\bmacys\b/i, sector: "Consumer & Retail", ticker: "M" },

  // Restaurants
  { re: /\bmcdonald'?s\b|\bmcdonalds\b|\bmcd\b/i, sector: "Restaurants", ticker: "MCD" },
  { re: /\bstarbucks\b|\bsbux\b/i, sector: "Restaurants", ticker: "SBUX" },
  { re: /\bchipotle\b|\bcmg\b/i, sector: "Restaurants", ticker: "CMG" },
  { re: /\bdomino'?s\b|\bdominos\b|\bdpz\b/i, sector: "Restaurants", ticker: "DPZ" },
  { re: /\byum!\b|\byum brands\b|\btaco bell\b|\bkfc\b|\bpizza hut\b|\byum\b/i, sector: "Restaurants", ticker: "YUM" },
  { re: /\bwendy'?s\b|\bwendys\b/i, sector: "Restaurants", ticker: "WEN" },

  // Technology
  { re: /\bapple\b|\baapl\b|\bapp store\b|\bicloud\b/i, sector: "Technology", ticker: "AAPL" },
  { re: /\bmicrosoft\b|\bmsft\b|\bxbox\b/i, sector: "Technology", ticker: "MSFT" },
  { re: /\bgoogle\b|\balphabet\b|\bgoogl\b|\bgoogle play\b|\byoutube\b/i, sector: "Technology", ticker: "GOOGL" },
  { re: /\bmeta\b|\bfacebook\b|\binstagram\b/i, sector: "Technology", ticker: "META" },
  { re: /\bnvidia\b|\bnvda\b/i, sector: "Technology", ticker: "NVDA" },
  { re: /\bamd\b|\badvanced micro devices\b/i, sector: "Technology", ticker: "AMD" },
  { re: /\boracle\b|\borcl\b/i, sector: "Technology", ticker: "ORCL" },
  { re: /\bdell\b|\bdell technologies\b/i, sector: "Technology", ticker: "DELL" },

  // Healthcare
  { re: /\bcvs\b|\bcvs pharmacy\b|\bcvs health\b/i, sector: "Healthcare", ticker: "CVS" },
  { re: /\bunitedhealth\b|\bunh\b/i, sector: "Healthcare", ticker: "UNH" },
  { re: /\bjohnson & johnson\b|\bjnj\b/i, sector: "Healthcare", ticker: "JNJ" },
  { re: /\bmerck\b|\bmrk\b/i, sector: "Healthcare", ticker: "MRK" },
  { re: /\bpfizer\b|\bpfe\b/i, sector: "Healthcare", ticker: "PFE" },
  { re: /\babbvie\b|\babbv\b/i, sector: "Healthcare", ticker: "ABBV" },

  // Transportation
  { re: /\buber\b|\buber\*trip\b|\buber trip\b/i, sector: "Transportation", ticker: "UBER" },
  { re: /\blyft\b/i, sector: "Transportation", ticker: "LYFT" },
  { re: /\bfedex\b|\bfdx\b/i, sector: "Transportation", ticker: "FDX" },
  { re: /\bups\b/i, sector: "Transportation", ticker: "UPS" },
  { re: /\bdelta\b|\bdal\b/i, sector: "Transportation", ticker: "DAL" },
  { re: /\bsouthwest\b|\bluv\b/i, sector: "Transportation", ticker: "LUV" },

  // Media & Entertainment
  { re: /\bnetflix\b|\bnflx\b/i, sector: "Media & Entertainment", ticker: "NFLX" },
  { re: /\bdisney\b|\bdis\b|\bdisney\+\b/i, sector: "Media & Entertainment", ticker: "DIS" },
  { re: /\bspotify\b|\bspot\b/i, sector: "Media & Entertainment", ticker: "SPOT" },
  { re: /\bwarner\b|\bwbd\b|\bhbo\b|\bmax\b/i, sector: "Media & Entertainment", ticker: "WBD" },

  // Energy
  { re: /\bchevron\b|\bcvx\b/i, sector: "Energy", ticker: "CVX" },
  { re: /\bexxon\b|\bxom\b/i, sector: "Energy", ticker: "XOM" },
  { re: /\bconocophillips\b|\bcop\b/i, sector: "Energy", ticker: "COP" },
  { re: /\bschlumberger\b|\bslb\b/i, sector: "Energy", ticker: "SLB" },
  { re: /\bphillips 66\b|\bpsx\b/i, sector: "Energy", ticker: "PSX" }
];

function matchMerchantRule(merchant = "") {
  const m = String(merchant || "").trim();
  if (!m) return null;

  for (const r of MERCHANT_RULES) {
    if (r.re.test(m)) return r;
  }
  return null;
}

/**
 * New helper:
 * Infer Sector from merchant text (works even when no ticker exists).
 */
export function inferSectorFromMerchant(merchant = "") {
  const hit = matchMerchantRule(merchant);
  if (hit?.sector) return hit.sector;

  // If we can infer a ticker, fall back to directory sector
  const t = inferTickerFromMerchant(merchant);
  const c = t ? findCompanyByTicker(t) : null;
  return c?.sector || null;
}

/**
 * Optional helper:
 * Infer Sector from ticker using directory.
 */
export function inferSectorFromTicker(ticker = "") {
  const c = findCompanyByTicker(ticker);
  return c?.sector || null;
}

/**
 * Merchant classifier:
 * returns { sector, ticker } when possible
 */
export function classifyMerchant(merchant = "") {
  const hit = matchMerchantRule(merchant);
  if (hit) return { sector: hit.sector || null, ticker: hit.ticker || null };

  const t = inferTickerFromMerchant(merchant);
  const sector = t ? inferSectorFromTicker(t) : null;
  return { sector: sector || null, ticker: t || null };
}

/**
 * Keep existing export (so your app doesn't break):
 * Infer a ticker symbol from a merchant name.
 *
 * Updated:
 * - Uses MERCHANT_RULES first (more robust)
 * - Then falls back to a lightweight keyword map
 */
export function inferTickerFromMerchant(merchant = "") {
  const hit = matchMerchantRule(merchant);
  if (hit?.ticker) return hit.ticker;

  const m = normalizeText(merchant);

  const MAP = [
    { match: ["amazon", "amzn"], ticker: "AMZN" },
    { match: ["target"], ticker: "TGT" },
    { match: ["walmart", "wal-mart"], ticker: "WMT" },
    { match: ["costco"], ticker: "COST" },
    { match: ["macys", "macy's", "macy"], ticker: "M" },

    { match: ["apple", "app store", "icloud"], ticker: "AAPL" },
    { match: ["microsoft", "xbox"], ticker: "MSFT" },
    { match: ["google", "alphabet", "youtube", "google play"], ticker: "GOOGL" },
    { match: ["meta", "facebook", "instagram"], ticker: "META" },
    { match: ["netflix"], ticker: "NFLX" },
    { match: ["dell"], ticker: "DELL" },

    { match: ["chipotle"], ticker: "CMG" },
    { match: ["starbucks"], ticker: "SBUX" },
    { match: ["mcdonald"], ticker: "MCD" },
    { match: ["wendy"], ticker: "WEN" },

    { match: ["uber"], ticker: "UBER" },
    { match: ["lyft"], ticker: "LYFT" },

    { match: ["cvs"], ticker: "CVS" },

    { match: ["cvx", "chevron"], ticker: "CVX" },
    { match: ["exxon"], ticker: "XOM" }
  ];

  for (const entry of MAP) {
    if (entry.match.some((k) => m.includes(k))) return entry.ticker;
  }

  return null;
}
