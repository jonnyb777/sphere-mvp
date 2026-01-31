// FILE: src/utils/sectorRollup.js

// ETF-aligned market buckets used in MarketPulse + Alignment + Flow
export const MARKET_BUCKETS = [
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Healthcare",
  "Industrials",
  "Materials",
  "Technology",
  "Utilities",
  "Real Estate",
  "Other / Unmapped"
];

// Drip spend categories (granular) -> ETF/market buckets (coarse)
export const SECTOR_ROLLUP = {
  // Granular spend categories
  Grocery: "Consumer Staples",
  "Big Box Retail": "Consumer Staples",
  Pharmacies: "Healthcare",
  "Gas Stations": "Energy",
  Utilities: "Utilities",
  Insurance: "Financials",
  Telecom: "Communication Services",
  Subscriptions: "Technology", // default (mixed, but fine for now)

  // Travel breakdown
  Travel: "Consumer Discretionary",
  Airlines: "Industrials",
  "Hotels & Lodging": "Consumer Discretionary",
  "Online Travel": "Consumer Discretionary",
  "Cruises & Leisure": "Consumer Discretionary",

  // Legacy buckets
  "Consumer & Retail": "Consumer Discretionary",
  Restaurants: "Consumer Discretionary",
  Transportation: "Industrials",
  "Media & Entertainment": "Communication Services",

  // Pass-through for already-market buckets
  "Communication Services": "Communication Services",
  "Consumer Discretionary": "Consumer Discretionary",
  "Consumer Staples": "Consumer Staples",
  Energy: "Energy",
  Financials: "Financials",
  Healthcare: "Healthcare",
  Industrials: "Industrials",
  Materials: "Materials",
  Technology: "Technology",
  Utilities: "Utilities",
  "Real Estate": "Real Estate",

  "Other / Unmapped": "Other / Unmapped"
};

export function rollUpSector(sector) {
  const s = String(sector || "").trim();
  if (!s) return "Other / Unmapped";
  return SECTOR_ROLLUP[s] || s;
}

// Convert any spend bucket into the ETF sector label used by your leader list
export function toEtfSectorName(bucketOrSpendSector) {
  const rolled = rollUpSector(bucketOrSpendSector);
  return MARKET_BUCKETS.includes(rolled) ? rolled : "";
}
