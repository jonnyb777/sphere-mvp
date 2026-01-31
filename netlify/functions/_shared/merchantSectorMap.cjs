// FILE: netlify/functions/_shared/merchantSectorMap.cjs
function normalizeMerchantName(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s&'+\-./]/g, "")
    .trim();
}

const MERCHANT_RULES = [
  // Restaurants
  { re: /\bmcdonald'?s\b|\bmcdonalds\b|\bmcd\b/i, sector: "Restaurants", ticker: "MCD" },
  { re: /\bstarbucks\b|\bsbux\b/i, sector: "Restaurants", ticker: "SBUX" },
  { re: /\bchipotle\b|\bcmg\b/i, sector: "Restaurants", ticker: "CMG" },

  // Grocery
  { re: /\bwhole foods\b|\bwholefoods\b/i, sector: "Grocery", ticker: "AMZN" },
  { re: /\bkroger\b|\bfred meyer\b|\bralphs\b|\bharris teeter\b/i, sector: "Grocery", ticker: "KR" },
  { re: /\balbertsons\b|\bsafeway\b|\bvons\b|\bpavilions\b|\bacme\b/i, sector: "Grocery", ticker: "ACI" },

  // Big Box Retail
  { re: /\bwalmart\b|\bwal-mart\b/i, sector: "Big Box Retail", ticker: "WMT" },
  { re: /\btarget\b/i, sector: "Big Box Retail", ticker: "TGT" },
  { re: /\bcostco\b/i, sector: "Big Box Retail", ticker: "COST" },

  // Insurance
  { re: /\ballstate\b/i, sector: "Insurance", ticker: "ALL" },
  { re: /\bprogressive\b/i, sector: "Insurance", ticker: "PGR" },
  { re: /\blemonade\b/i, sector: "Insurance", ticker: "LMND" },

  // Tech / Retail
  { re: /\bapple\b|\baapl\b|\bapp store\b/i, sector: "Technology", ticker: "AAPL" },
  { re: /\bmicrosoft\b|\bmsft\b/i, sector: "Technology", ticker: "MSFT" },
  { re: /\bgoogle\b|\bgoogl\b|\balphabet\b/i, sector: "Technology", ticker: "GOOGL" },
  { re: /\bamazon\b|\bamzn\b/i, sector: "Consumer & Retail", ticker: "AMZN" }
];

function keywordHeuristics(m) {
  const s = String(m || "");
  if (/\bgrocery\b|\bsupermarket\b/.test(s)) return { sector: "Grocery" };
  if (/\binsurance\b|\bpremium\b|\bpolicy\b/.test(s)) return { sector: "Insurance" };
  if (/\bpharmacy\b|\brx\b|\bdrugstore\b/.test(s)) return { sector: "Pharmacies" };
  if (/\bgas\b|\bfuel\b|\bpump\b/.test(s)) return { sector: "Gas Stations" };
  if (/\butility\b|\belectric\b|\bwater\b|\bsewer\b/.test(s)) return { sector: "Utilities" };
  if (/\bwireless\b|\binternet\b|\bcable\b/.test(s)) return { sector: "Telecom" };
  if (/\bsubscription\b|\brecurring\b/.test(s)) return { sector: "Subscriptions" };
  if (/\brestaurant\b|\bcafe\b|\bcoffee\b|\bpizza\b|\bburger\b/.test(s)) return { sector: "Restaurants" };
  return null;
}

function classifyMerchant(merchant = "") {
  const m = normalizeMerchantName(merchant);
  if (!m) return { sector: "Other / Unmapped", ticker: null };

  for (const r of MERCHANT_RULES) {
    if (r.re.test(m)) return { sector: r.sector || "Other / Unmapped", ticker: r.ticker || null };
  }

  const h = keywordHeuristics(m);
  if (h?.sector) return { sector: h.sector, ticker: null };

  return { sector: "Other / Unmapped", ticker: null };
}

module.exports = { classifyMerchant };
