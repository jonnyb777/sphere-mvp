// src/utils/mappings.js

export const MERCHANT_TO_TICKER = [
  // Restaurants
  { match: ["chipotle"], ticker: "CMG" },
  { match: ["starbucks"], ticker: "SBUX" },
  { match: ["mcdonald", "mcdonald's"], ticker: "MCD" },
  { match: ["domino"], ticker: "DPZ" },
  { match: ["yum", "taco bell", "kfc", "pizza hut"], ticker: "YUM" },
  { match: ["dunkin"], ticker: "DNKN" }, // note: legacy; may not resolve depending on provider
  { match: ["wendy"], ticker: "WEN" },

  // Retail / Commerce
  { match: ["amazon"], ticker: "AMZN" },
  { match: ["target"], ticker: "TGT" },
  { match: ["walmart"], ticker: "WMT" },
  { match: ["costco"], ticker: "COST" },
  { match: ["home depot", "homedepot"], ticker: "HD" },
  { match: ["lowe", "lowes"], ticker: "LOW" },
  { match: ["best buy", "bestbuy"], ticker: "BBY" },
  { match: ["ikea"], ticker: "INGKA" }, // not public; will be ignored if you keep ticker-only logic
  { match: ["etsy"], ticker: "ETSY" },
  { match: ["shopify"], ticker: "SHOP" },
  { match: ["nike"], ticker: "NKE" },
  { match: ["lululemon", "lulu"], ticker: "LULU" },
  { match: ["adidas"], ticker: "ADDYY" },
  { match: ["gap"], ticker: "GPS" },

  // Grocery / Staples
  { match: ["kroger"], ticker: "KR" },
  { match: ["whole foods", "wholefoods"], ticker: "AMZN" }, // Amazon-owned; MVP shortcut
  { match: ["trader joe", "trader joes"], ticker: "" }, // private
  { match: ["aldi"], ticker: "" }, // private

  // Pharmacy / Healthcare retail
  { match: ["cvs"], ticker: "CVS" },
  { match: ["walgreens"], ticker: "WBA" },
  { match: ["rite aid", "riteaid"], ticker: "" }, // private / distressed; leave blank

  // Streaming / Media
  { match: ["netflix"], ticker: "NFLX" },
  { match: ["disney", "hulu"], ticker: "DIS" },
  { match: ["spotify"], ticker: "SPOT" },
  { match: ["warner", "hbo", "max"], ticker: "WBD" },

  // Travel / Transport
  { match: ["uber"], ticker: "UBER" },
  { match: ["lyft"], ticker: "LYFT" },
  { match: ["delta"], ticker: "DAL" },
  { match: ["southwest"], ticker: "LUV" },
  { match: ["american airlines"], ticker: "AAL" },
  { match: ["united airlines"], ticker: "UAL" },
  { match: ["fedex", "fed ex"], ticker: "FDX" },
  { match: ["ups"], ticker: "UPS" },

  // Tech / Devices / Subscriptions
  { match: ["apple", "itunes", "app store"], ticker: "AAPL" },
  { match: ["microsoft", "xbox"], ticker: "MSFT" },
  { match: ["google", "youtube"], ticker: "GOOGL" },
  { match: ["meta", "facebook", "instagram"], ticker: "META" },
  { match: ["nvidia"], ticker: "NVDA" },
  { match: ["amd"], ticker: "AMD" },
  { match: ["oracle"], ticker: "ORCL" },
  { match: ["adobe"], ticker: "ADBE" },
  { match: ["salesforce"], ticker: "CRM" },

  // Financial brands (payments + banks)
  { match: ["visa"], ticker: "V" },
  { match: ["mastercard", "master card"], ticker: "MA" },
  { match: ["amex", "american express"], ticker: "AXP" },
  { match: ["paypal"], ticker: "PYPL" },
  { match: ["square", "cash app", "cashapp"], ticker: "SQ" },
  { match: ["jpmorgan", "jp morgan", "chase"], ticker: "JPM" },
  { match: ["bank of america"], ticker: "BAC" },
  { match: ["wells fargo"], ticker: "WFC" },
  { match: ["citi", "citibank"], ticker: "C" },
  { match: ["goldman"], ticker: "GS" },

  // Energy
  { match: ["exxon"], ticker: "XOM" },
  { match: ["chevron"], ticker: "CVX" },
  { match: ["shell"], ticker: "SHEL" },
  { match: ["valero"], ticker: "VLO" },
  { match: ["phillips 66", "phillips66"], ticker: "PSX" }
];

export function inferTickerFromMerchant(merchant) {
  const m = String(merchant || "").toLowerCase();
  for (const rule of MERCHANT_TO_TICKER) {
    if (rule.match.some((k) => m.includes(k))) return rule.ticker;
  }
  return "";
}
