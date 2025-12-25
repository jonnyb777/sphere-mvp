// netlify/functions/community.js
//
// Admin-controlled community aggregate feed for Monthly Flow (Paid • Preview).
// Free-MVP mode: serves deterministic mock aggregate data + ~200 community runner items.
// Production intent: replace generateMockCommunityData() with scheduled aggregation pipeline.
//
// Endpoint:
//   /.netlify/functions/community
//
// Response shape:
//   { ok: true, data: { asOf, narrativeHighestSector, topSectors: [...], communityRunners: [...] } }

function isoDate(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Deterministic hash → pseudo random in [0,1)
function hashToUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert to unsigned and scale
  const u = (h >>> 0) / 4294967295;
  return u;
}

// Create a deterministic "30D return" from ticker + asOf
function mockReturn30d(ticker, asOf) {
  const u = hashToUnit(`${ticker}:${asOf}`);
  // Center around ~0.02 with spread; clamp to [-0.20, +0.35]
  const r = (u - 0.45) * 0.55; // roughly [-0.25, +0.30]
  return clamp(r, -0.20, 0.35);
}

// Create a deterministic "signal strength" string from sector + ticker
function mockSignal(sector, ticker, asOf) {
  const u1 = hashToUnit(`c:${sector}:${asOf}`);
  const u2 = hashToUnit(`t:${ticker}:${asOf}`);
  const u3 = hashToUnit(`b:${sector}:${ticker}:${asOf}`);

  // Bucket into small label set that reads well in the UI
  const concentration = u1 > 0.66 ? "High spend concentration" : u1 > 0.33 ? "Moderate concentration" : "Broad-based";
  const breadth = u3 > 0.66 ? "High breadth" : u3 > 0.33 ? "Medium breadth" : "Narrow breadth";
  const stability = u2 > 0.66 ? "Stable" : u2 > 0.33 ? "Emerging" : "Spiky";

  return `${concentration} · ${breadth} · ${stability}`;
}

// Universe used only to make the mock feed look realistic.
// In production you would generate this from anonymized aggregates + market data.
const SECTORS = [
  "Technology",
  "Consumer & Retail",
  "Healthcare",
  "Financials",
  "Energy",
  "Industrials",
  "Transportation",
  "Restaurants",
  "Media & Entertainment",
  "Materials",
  "Utilities",
  "Real Estate"
];

const SECTOR_TICKERS = {
  Technology: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO", "AMD", "ORCL", "CRM", "ADBE", "INTC", "TSM", "QCOM", "SNOW", "SHOP"],
  "Consumer & Retail": ["AMZN", "TGT", "WMT", "COST", "HD", "LOW", "NKE", "SBUX", "MCD", "KO", "PEP", "PG", "UL", "ETSY", "EBAY"],
  Healthcare: ["UNH", "JNJ", "MRK", "PFE", "ABBV", "CVS", "LLY", "BMY", "AMGN", "GILD", "ISRG", "ZTS"],
  Financials: ["JPM", "BAC", "GS", "MS", "C", "WFC", "V", "MA", "AXP", "SCHW", "BLK"],
  Energy: ["XOM", "CVX", "COP", "SLB", "PSX", "OXY", "EOG", "MPC", "VLO"],
  Industrials: ["CAT", "GE", "HON", "DE", "MMM", "BA", "LMT", "RTX", "UPS", "FDX"],
  Transportation: ["UBER", "LYFT", "DAL", "LUV", "UAL", "CSX", "NSC"],
  Restaurants: ["MCD", "SBUX", "CMG", "YUM", "DPZ", "QSR", "WEN", "SHAK"],
  "Media & Entertainment": ["NFLX", "DIS", "WBD", "SPOT", "PARA", "RBLX"],
  Materials: ["LIN", "APD", "SHW", "DD", "ECL", "NEM"],
  Utilities: ["NEE", "DUK", "SO", "AEP", "EXC"],
  "Real Estate": ["PLD", "AMT", "EQIX", "O", "SPG"]
};

// Generate top sector weights that sum to ~1.0
function generateTopSectors(asOf) {
  // Deterministic base weights from hash, then normalize
  const raw = SECTORS.slice(0, 8).map((sector) => {
    const u = hashToUnit(`sectorWeight:${sector}:${asOf}`);
    return { sector, w: 0.05 + u * 0.25 }; // 0.05..0.30
  });

  raw.sort((a, b) => b.w - a.w);

  const top5 = raw.slice(0, 5);
  const sum = top5.reduce((s, x) => s + x.w, 0);
  return top5.map((x) => ({
    sector: x.sector,
    weight: x.w / sum
  }));
}

// Produce ~200 runner rows, biased toward community top sectors.
function generateCommunityRunners(asOf, topSectors) {
  const topSectorNames = (topSectors || []).map((x) => x.sector);
  const pool = [];

  // Weight selection: replicate tickers per sector proportional to sector weight
  for (const s of topSectors) {
    const tickers = SECTOR_TICKERS[s.sector] || [];
    const copies = Math.round(40 * (s.weight || 0.2)); // approx distribution
    for (let c = 0; c < copies; c++) {
      for (const t of tickers) pool.push({ sector: s.sector, ticker: t });
    }
  }

  // If pool too small (shouldn't happen), fallback to all sectors
  if (pool.length < 50) {
    for (const [sector, tickers] of Object.entries(SECTOR_TICKERS)) {
      for (const t of tickers) pool.push({ sector, ticker: t });
    }
  }

  // Build 200 items deterministically by walking a shuffled-like order
  const runners = [];
  const seen = new Set();

  let i = 0;
  while (runners.length < 200 && i < pool.length * 10) {
    const pickIdx = Math.floor(hashToUnit(`pick:${asOf}:${i}`) * pool.length);
    const pick = pool[pickIdx];
    const key = `${pick.sector}:${pick.ticker}`;
    i++;

    // Allow some duplicates, but not too many; prefer variety
    const dupCount = seen.has(key) ? 1 : 0;
    if (dupCount && runners.length < 120) continue;

    const r30 = mockReturn30d(pick.ticker, asOf);
    const signal = mockSignal(pick.sector, pick.ticker, asOf);

    runners.push({
      sector: pick.sector,
      ticker: pick.ticker,
      return30d: r30,
      signal
    });

    seen.add(key);
  }

  // Sort by 30D return desc and keep 200
  runners.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));
  return runners.slice(0, 200);
}

function generateMockCommunityData() {
  const asOf = isoDate(new Date());
  const topSectors = generateTopSectors(asOf);
  const narrativeHighestSector = topSectors?.[0]?.sector || "—";
  const communityRunners = generateCommunityRunners(asOf, topSectors);

  return {
    asOf,
    narrativeHighestSector,
    topSectors,
    communityRunners
  };
}

exports.handler = async function handler(event) {
  try {
    // In MVP: always return mock aggregate data.
    // In production: replace generateMockCommunityData() with real aggregation.
    const data = generateMockCommunityData();

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: JSON.stringify({ ok: true, data })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: false,
        error: "Failed to generate community feed."
      })
    };
  }
};
