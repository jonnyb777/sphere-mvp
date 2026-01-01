// FILE: src/utils/mappings.js

/**
 * Central mapping utilities for Sphere MVP.
 * - Company directory: for typeahead autocomplete (company -> ticker)
 * - Helpers: search companies, normalize input
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

  // Consumer & Retail
  { name: "Amazon", ticker: "AMZN", sector: "Consumer & Retail" },
  { name: "Target", ticker: "TGT", sector: "Consumer & Retail" },
  { name: "Walmart", ticker: "WMT", sector: "Consumer & Retail" },
  { name: "Costco", ticker: "COST", sector: "Consumer & Retail" },
  { name: "Home Depot", ticker: "HD", sector: "Consumer & Retail" },
  { name: "Lowe's", ticker: "LOW", sector: "Consumer & Retail" },

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
  const t = normalizeText(ticker).toUpperCase();
  return COMPANY_DIRECTORY.find((c) => String(c.ticker).toUpperCase() === t) || null;
}
// Infer a ticker symbol from a merchant name
export function inferTickerFromMerchant(merchant = "") {
  const m = merchant.toLowerCase();

  const MAP = [
    { match: ["amazon"], ticker: "AMZN" },
    { match: ["target"], ticker: "TGT" },
    { match: ["walmart"], ticker: "WMT" },
    { match: ["costco"], ticker: "COST" },
    { match: ["apple"], ticker: "AAPL" },
    { match: ["microsoft"], ticker: "MSFT" },
    { match: ["google"], ticker: "GOOGL" },
    { match: ["meta", "facebook"], ticker: "META" },
    { match: ["netflix"], ticker: "NFLX" },
    { match: ["chipotle"], ticker: "CMG" },
    { match: ["starbucks"], ticker: "SBUX" },
    { match: ["mcdonald"], ticker: "MCD" },
    { match: ["uber"], ticker: "UBER" },
    { match: ["lyft"], ticker: "LYFT" },
    { match: ["cvx", "chevron"], ticker: "CVX" },
    { match: ["exxon"], ticker: "XOM" },
  ];

  for (const entry of MAP) {
    if (entry.match.some(k => m.includes(k))) {
      return entry.ticker;
    }
  }

  return null;
}
