// FILE: src/utils/merchantSectorMap.js

// Canonical Sphere sectors (must match your UI labels)
// NOTE: These are your *spend categories* (granular) + legacy buckets.
// IMPORTANT: Keep capitalization consistent because MarketPulse roll-up is string-keyed.
export const SPHERE_SECTORS = [
  // Granular spend categories
  "Grocery",
  "Big Box Retail",
  "Utilities",
  "Insurance",
  "Telecom",
  "Subscriptions",
  "Travel",
  "Gas Stations",
  "Pharmacies",

  // Existing (kept for backward compat + broader buckets)
  "Consumer & Retail",
  "Healthcare",
  "Restaurants",
  "Transportation",
  "Energy",
  "Technology",
  "Media & Entertainment",
  "Financials",
  "Industrials",
  "Other / Unmapped"
];

// Normalize messy merchant strings
export function normalizeMerchantName(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s&'+\-./]/g, "") // keep letters/numbers/space/&/'/+/-/./
    .trim();
}

/**
 * Merchant → { sector, ticker?, subcategory?, tags? }
 * - sector is the primary truth (granular spend category)
 * - ticker is best-effort only (Alignment tier-2 + runners overlap)
 * - subcategory helps roll-up / future filtering (Travel + Subscriptions)
 * - tags is optional metadata you can leverage later
 *
 * Safe: existing callers that only use sector/ticker will still work.
 */
const MERCHANT_RULES = [
  // --------------------------
  // Restaurants
  // --------------------------
  { re: /\bwendy'?s\b|\bwendys\b/i, sector: "Restaurants", ticker: "WEN" },
  { re: /\bmcdonald'?s\b|\bmcdonalds\b|\bmcd\b/i, sector: "Restaurants", ticker: "MCD" },
  { re: /\bstarbucks\b|\bsbux\b/i, sector: "Restaurants", ticker: "SBUX" },
  { re: /\bchipotle\b|\bcmg\b/i, sector: "Restaurants", ticker: "CMG" },
  { re: /\bdomino'?s\b|\bdominos\b|\bdpz\b/i, sector: "Restaurants", ticker: "DPZ" },
  { re: /\byum\b|\byum brands\b|\btaco bell\b|\bkfc\b|\bpizza hut\b/i, sector: "Restaurants", ticker: "YUM" },

  // ✅ NEW: Chick-fil-A variants (bank exports are messy)
  { re: /\bchick[\s\-]?fil[\s\-]?a\b|\bchickfila\b/i, sector: "Restaurants", ticker: null },

  // ✅ NEW: Common card-present prefix like "TST*"
  // Example: "TST* FRESH BROTHERS"
  { re: /\btst\*\s*fresh brothers\b|\bfresh brothers\b/i, sector: "Restaurants", ticker: null },

  // --------------------------
  // Grocery
  // --------------------------
  { re: /\btrader joe'?s\b|\btrader joes\b/i, sector: "Grocery", ticker: null },
  { re: /\bwhole foods\b|\bwholefoods\b/i, sector: "Grocery", ticker: "AMZN", tags: ["owned-by:AMZN"] },
  { re: /\bkroger\b|\bfred meyer\b|\bralphs\b|\bharris teeter\b/i, sector: "Grocery", ticker: "KR" },
  { re: /\balbertsons\b|\bsafeway\b|\bvons\b|\bpavilions\b|\bacme\b/i, sector: "Grocery", ticker: "ACI" },
  { re: /\bpublix\b/i, sector: "Grocery", ticker: null },
  { re: /\bwegmans\b/i, sector: "Grocery", ticker: null },
  { re: /\bfood lion\b|\bstop & shop\b|\bstop and shop\b|\bgiant\b/i, sector: "Grocery", ticker: null },
  { re: /\binstacart\b/i, sector: "Grocery", ticker: null, tags: ["delivery"] },

  // --------------------------
  // Big Box Retail (mass merch / warehouse / general merch)
  // NOTE: This is a *spend category*, rolled up to Consumer Staples in MarketPulse.
  // --------------------------
  { re: /\bwalmart\b|\bwal-mart\b/i, sector: "Big Box Retail", ticker: "WMT" },
  { re: /\btarget\b/i, sector: "Big Box Retail", ticker: "TGT" },
  { re: /\bcostco\b/i, sector: "Big Box Retail", ticker: "COST" },
  { re: /\bsams club\b|\bsam's club\b/i, sector: "Big Box Retail", ticker: "WMT", tags: ["membership-club"] },
  { re: /\bbj'?s\b|\bbj wholesale\b/i, sector: "Big Box Retail", ticker: null, tags: ["membership-club"] },

  // --------------------------
  // Gas Stations (fuel + convenience)
  // NOTE: This is a spend category, rolled up to Energy in MarketPulse.
  // --------------------------
  { re: /\bshell\b/i, sector: "Gas Stations", ticker: null },
  { re: /\bchevron\b/i, sector: "Gas Stations", ticker: "CVX" },
  { re: /\bexxon\b|\bexxonmobil\b/i, sector: "Gas Stations", ticker: "XOM" },
  // "mobil" false-positives can happen; keep bounded
  { re: /\bmobil\b/i, sector: "Gas Stations", ticker: "XOM" },
  { re: /\barco\b|\bphil?lips 66\b|\bconoco\b/i, sector: "Gas Stations", ticker: null },
  { re: /\bcircle k\b|\b7-eleven\b|\b7 eleven\b/i, sector: "Gas Stations", ticker: null },

  // --------------------------
  // Pharmacies
  // --------------------------
  { re: /\bcvs\b|\bcvs pharmacy\b|\bcvs health\b/i, sector: "Pharmacies", ticker: "CVS" },
  { re: /\bwalgreens\b|\bwalgreen\b|\bduane reade\b/i, sector: "Pharmacies", ticker: "WBA" },
  { re: /\brite aid\b/i, sector: "Pharmacies", ticker: null },

  // --------------------------
  // Utilities (bills)
  // --------------------------
  { re: /\bpg&e\b|\bpge\b|\bpacific gas\b/i, sector: "Utilities", ticker: null },
  { re: /\bedison\b|\bsce\b|\bsouthern california edison\b/i, sector: "Utilities", ticker: null },
  { re: /\bcon ed\b|\bconed\b|\bcon edison\b/i, sector: "Utilities", ticker: null },
  { re: /\bwater\b|\bwaterworks\b|\bmunicipal water\b|\bsewer\b/i, sector: "Utilities", ticker: null },

  // --------------------------
  // Insurance
  // --------------------------
  { re: /\bgeico\b/i, sector: "Insurance", ticker: null },
  { re: /\bstate farm\b/i, sector: "Insurance", ticker: null },
  { re: /\ballstate\b/i, sector: "Insurance", ticker: "ALL" },
  { re: /\bprogressive\b/i, sector: "Insurance", ticker: "PGR" },
  { re: /\bnationwide\b/i, sector: "Insurance", ticker: null },
  { re: /\blemonade\b/i, sector: "Insurance", ticker: "LMND" },

  // ✅ NEW: bank-statement shorthand like "UNITED FIN CAS INS PREM"
  // Covers: "united fin cas ins prem", "cas ins prem", "ins prem", "insurance prem"
  { re: /\b(united\s+fin|united)\b.*\b(cas|casualty)\b.*\b(ins|insur|insurance)\b.*\b(prem|premium)\b/i, sector: "Insurance", ticker: null, tags: ["statement-shorthand"] },
  { re: /\bcas\b.*\bins\b.*\bprem\b|\bins\b.*\bprem\b/i, sector: "Insurance", ticker: null, tags: ["statement-shorthand"] },

  // --------------------------
  // Telecom
  // --------------------------
  { re: /\bverizon\b|\bvzw\b/i, sector: "Telecom", ticker: "VZ" },
  { re: /\bat&t\b|\batt\b/i, sector: "Telecom", ticker: "T" },
  { re: /\bt-mobile\b|\btmobile\b/i, sector: "Telecom", ticker: "TMUS" },
  { re: /\bcomcast\b|\bxfinity\b/i, sector: "Telecom", ticker: "CMCSA" },
  { re: /\bspectrum\b|\bcharter\b/i, sector: "Telecom", ticker: "CHTR" },

  // --------------------------
  // Subscriptions (subtype-aware)
  // sector remains "Subscriptions" but subcategory helps roll-up + UX
  // --------------------------
  { re: /\bnetflix\b/i, sector: "Subscriptions", subcategory: "Streaming", ticker: "NFLX" },
  { re: /\bspotify\b/i, sector: "Subscriptions", subcategory: "Streaming", ticker: "SPOT" },
  { re: /\bhulu\b|\bdisney\+?\b|\bdisney plus\b/i, sector: "Subscriptions", subcategory: "Streaming", ticker: "DIS" },
  { re: /\bamazon prime\b|\bprime video\b/i, sector: "Subscriptions", subcategory: "Streaming", ticker: "AMZN" },

  // ✅ NEW: SiriusXM exports
  { re: /\bsxm\b|\bsirius\s*xm\b|\bsiriusxm\b/i, sector: "Subscriptions", subcategory: "Streaming", ticker: null },

  // Apple/Google bills can be mixed; keep Streaming/Services tag (not pure Tech)
  { re: /\bapple\.com\/bill\b|\bapple services\b|\bicloud\b/i, sector: "Subscriptions", subcategory: "Digital Services", ticker: "AAPL" },
  { re: /\bgoogle one\b|\byoutube premium\b/i, sector: "Subscriptions", subcategory: "Digital Services", ticker: "GOOGL" },

  // SaaS examples (common “business” subs)
  { re: /\badobe\b/i, sector: "Subscriptions", subcategory: "SaaS", ticker: "ADBE" },
  { re: /\bmicrosoft 365\b|\boffice 365\b/i, sector: "Subscriptions", subcategory: "SaaS", ticker: "MSFT" },
  { re: /\bdropbox\b/i, sector: "Subscriptions", subcategory: "SaaS", ticker: null },
  { re: /\bpatreon\b/i, sector: "Subscriptions", subcategory: "Creator", ticker: null },

  // ✅ NEW: Netlify subscription / hosting
  { re: /\bnetlify\b/i, sector: "Subscriptions", subcategory: "SaaS", ticker: null, tags: ["hosting"] },

  // --------------------------
  // Travel (more meaningful breakdown)
  // IMPORTANT: Uber/Lyft are Transportation, not Travel.
  // --------------------------
  { re: /\buber\b|\buber\*trip\b|\buber trip\b/i, sector: "Transportation", ticker: "UBER" },
  { re: /\blyft\b/i, sector: "Transportation", ticker: "LYFT" },

  { re: /\bairbnb\b/i, sector: "Travel", subcategory: "Online Travel", ticker: "ABNB" },
  { re: /\bbooking\.com\b|\bbookingcom\b|\bpriceline\b/i, sector: "Travel", subcategory: "Online Travel", ticker: "BKNG" },
  { re: /\bexpedia\b/i, sector: "Travel", subcategory: "Online Travel", ticker: "EXPE" },

  { re: /\bmarriott\b/i, sector: "Travel", subcategory: "Hotels & Lodging", ticker: "MAR" },
  { re: /\bhilton\b/i, sector: "Travel", subcategory: "Hotels & Lodging", ticker: "HLT" },

  // Airlines — keep under Travel with airline subcategory
  { re: /\bdelta\b|\bdelta airlines\b/i, sector: "Travel", subcategory: "Airlines", ticker: null },
  { re: /\bamerican airlines\b|\baa\b/i, sector: "Travel", subcategory: "Airlines", ticker: null },
  { re: /\bunited airlines\b|\bua\b/i, sector: "Travel", subcategory: "Airlines", ticker: null },
  { re: /\bsouthwest\b/i, sector: "Travel", subcategory: "Airlines", ticker: null },

  // --------------------------
  // Technology (kept)
  // --------------------------
  { re: /\bdell\b|\bdell technologies\b/i, sector: "Technology", ticker: "DELL" },
  { re: /\bapple\b|\baapl\b|\bapp store\b/i, sector: "Technology", ticker: "AAPL" },
  { re: /\bmicrosoft\b|\bmsft\b|\bxbox\b/i, sector: "Technology", ticker: "MSFT" },
  { re: /\bgoogle\b|\balphabet\b|\bgoogl\b|\bgoogle play\b/i, sector: "Technology", ticker: "GOOGL" },
  { re: /\bmeta\b|\bfacebook\b|\binstagram\b/i, sector: "Technology", ticker: "META" },

  // --------------------------
  // Media & Entertainment (kept)
  // NOTE: Removed the duplicate Netflix/Disney/Hulu/Spotify rule because Subscriptions matches first.
  // Keep Media & Entertainment for non-subscription media spending if you add later (movies, theaters, etc.)
  // --------------------------
  { re: /\bamc theatres?\b|\bregal\b|\bfandango\b/i, sector: "Media & Entertainment", ticker: null },

  // --------------------------
  // Consumer & Retail (kept)
  // --------------------------
  { re: /\bmacy'?s\b|\bmacys\b/i, sector: "Consumer & Retail", ticker: "M" },
  { re: /\bamazon\b|\bamzn\b/i, sector: "Consumer & Retail", ticker: "AMZN" }

  // (Target/Walmart/Costco remain in Big Box Retail above)
];

/**
 * Optional lightweight keyword heuristics.
 * Keep conservative: only classify when very likely.
 */
function keywordHeuristics(normalized) {
  const m = String(normalized || "");

  // Pharmacies / health
  if (/\bpharmacy\b|\bdrugstore\b|\bprescription\b|\brx\b/.test(m)) return { sector: "Pharmacies" };
  if (/\bclinic\b|\burgen(t)? care\b|\bhospital\b|\bhealth\b|\bdent(al|ist)\b/.test(m)) return { sector: "Healthcare" };

  // Grocery
  if (/\bgrocery\b|\bsupermarket\b|\bproduce\b|\bbutcher\b/.test(m)) return { sector: "Grocery" };

  // Gas Stations
  if (/\bgas\b|\bgasoline\b|\bfuel\b|\bdiesel\b|\bpump\b/.test(m)) return { sector: "Gas Stations" };

  // Utilities
  if (/\butility\b|\belectric\b|\bpower\b|\bwater\b|\bsewer\b|\btrash\b|\brefuse\b/.test(m)) return { sector: "Utilities" };

  // Telecom / Internet
  if (/\bwireless\b|\bcell(ular)?\b|\bmobile plan\b|\bbroadband\b|\bcable\b|\binternet\b/.test(m)) return { sector: "Telecom" };

  // Insurance (common bank-statement abbreviations)
  // catches: "UNITED FIN CAS INS PREM", "INS PREM", "CAS INS", etc.
  if (/\binsurance\b|\binsur\b|\bpolicy\b|\bpremium\b|\bins\b|\bprem\b|\bcas\b/.test(m)) return { sector: "Insurance" };

  // Subscriptions (best-effort; add subtype hints)
  if (/\bsubscription\b|\brecurring\b|\bmember(ship)?\b/.test(m)) return { sector: "Subscriptions" };

  // Travel (don’t catch uber/lyft here; they’re handled above)
  if (/\bhotel\b|\bflight\b|\bairline\b|\bcar rental\b|\bresort\b|\bbooking\b|\bexpedia\b/.test(m)) return { sector: "Travel" };

  // Restaurants
  if (/\brestaurant\b|\bcafe\b|\bcoffee\b|\bpizza\b|\bburger\b|\bgrill\b/.test(m)) return { sector: "Restaurants" };

  // Transportation (legacy bucket; keep for misc)
  if (/\btransit\b|\btrain\b|\bbus\b|\btoll\b|\bparking\b/.test(m)) return { sector: "Transportation" };

  return null;
}

export function classifyMerchant(merchant = "") {
  const m = normalizeMerchantName(merchant);
  if (!m) return { sector: "Other / Unmapped", ticker: null };

  for (const r of MERCHANT_RULES) {
    if (r.re.test(m)) {
      return {
        sector: r.sector || "Other / Unmapped",
        ticker: r.ticker || null,
        subcategory: r.subcategory || null,
        tags: Array.isArray(r.tags) ? r.tags : null
      };
    }
  }

  const heuristic = keywordHeuristics(m);
  if (heuristic?.sector) {
    return { sector: heuristic.sector, ticker: null, subcategory: heuristic.subcategory || null, tags: null };
  }

  return { sector: "Other / Unmapped", ticker: null, subcategory: null, tags: null };
}

/**
 * Convenience helpers (used across MonthlyDrip + AlignmentSnapshotDrip + Home)
 */
export function inferSectorFromMerchant(merchant = "") {
  return classifyMerchant(merchant).sector;
}

export function inferTickerFromMerchant(merchant = "") {
  return classifyMerchant(merchant).ticker;
}

// Optional (future-proof): these don’t break anything if unused
export function inferSubcategoryFromMerchant(merchant = "") {
  return classifyMerchant(merchant).subcategory;
}

export function inferTagsFromMerchant(merchant = "") {
  return classifyMerchant(merchant).tags;
}

// Group transactions into spend-by-ticker (for Alignment)
// - Uses classifyMerchant() to infer ticker
// - Uses absolute spend (positive number) and ignores non-spend if needed
export function aggregateSpendByTicker(transactions = []) {
  const arr = Array.isArray(transactions) ? transactions : [];
  const map = new Map();

  for (const tx of arr) {
    const merchant = (tx.merchant || tx.Merchant || tx.name || tx.Name || tx.Description || tx.description || "").toString().trim();
    if (!merchant) continue;

    const amt = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
    if (!Number.isFinite(amt)) continue;

    // treat spend as positive magnitude (your uploader should already normalize)
    const spend = Math.abs(amt);
    if (!spend) continue;

    const { ticker, sector } = classifyMerchant(merchant);
    if (!ticker) continue;

    const t = String(ticker).toUpperCase().trim();
    const prev = map.get(t);
    map.set(t, {
      ticker: t,
      sector: sector || "Other / Unmapped",
      spend: (prev?.spend || 0) + spend,
      merchants: (prev?.merchants || new Set()).add(merchant)
    });
  }

  // convert merchants Set -> count (keep UI simple)
  return Array.from(map.values())
    .map((x) => ({ ticker: x.ticker, sector: x.sector, spend: x.spend, merchantCount: x.merchants.size }))
    .sort((a, b) => b.spend - a.spend);
}
