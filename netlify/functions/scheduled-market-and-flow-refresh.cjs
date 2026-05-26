const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  const svc = JSON.parse(raw);

  if (svc.private_key && typeof svc.private_key === "string") {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({
    credential: admin.credential.cert(svc)
  });
}

initAdmin();

const db = admin.firestore();
const nowTS = () => admin.firestore.FieldValue.serverTimestamp();

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj)
  };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function marketWindowKey(days, mode = "trailing", asOfISO = todayISO()) {
  return `mkt_${days}d_${mode}_asof_${asOfISO}`;
}

async function filterUncachedTickers({ tickers, days = 30, mode = "trailing" }) {
  const windowKey = marketWindowKey(days, mode);
  const out = [];

  for (const ticker of tickers) {
    const ref = db
      .collection("market_cache")
      .doc(windowKey)
      .collection("tickers")
      .doc(ticker);

    const snap = await ref.get();

    if (!snap.exists) {
      out.push(ticker);
    }
  }

  return out;
}

async function readQueuedTickers(limit = 500) {
  const snap = await db
    .collection("market_ticker_queue")
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get();

  const tickers = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const ticker = String(data.ticker || doc.id || "").toUpperCase().trim();
    if (ticker) tickers.push(ticker);
  });

  return tickers;
}

exports.handler = async () => {
  try {
    const siteUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      "http://localhost:8888";

    const secret = process.env.MARKET_WARM_SECRET;

    if (!secret) {
      return json(500, { error: "Missing MARKET_WARM_SECRET" });
    }

    const marketRefreshDays = [30];
const flowRebuildDays = [30, 60, 90];

    const baseTickers = [
      "XLC","XLY","XLP","XLE","XLF","XLV","XLI","XLB","XLK","XLU","XLRE",
      "AAPL","MSFT","NVDA","GOOGL","META","AMZN","COST","TGT","WMT",
      "SBUX","MCD","CMG","NFLX","DIS","SPOT","UBER","CVS","KR",
      "PGR","ALL","SIRI","DELL","ORCL","AVGO","ADBE","CRM",
      "HD","LOW","KO","PEP","CL","KMB","PG","JNJ","UNH","MRK",
      "PFE","BAC","JPM","GS","V","MA","AXP"
    ];

    const queuedTickers = await readQueuedTickers(500);

    const tickers = Array.from(
      new Set([...baseTickers, ...queuedTickers].map((t) => String(t).toUpperCase().trim()).filter(Boolean))
    );

    const tickersToRefresh = await filterUncachedTickers({
  tickers,
  days: 30,
  mode: "trailing"
});

    const chunks = chunkArray(tickersToRefresh, 100);
    const results = [];

    for (const days of marketRefreshDays) {
  for (const chunk of chunks) {
    const url =
      `${siteUrl}/.netlify/functions/market-refresh` +
      `?days=${days}&mode=trailing&secret=${encodeURIComponent(secret)}` +
      `&tickers=${encodeURIComponent(chunk.join(","))}`;

    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));

    results.push({
      type: "market-refresh",
      days,
      requested: chunk.length,
      status: res.status,
      cached: Number(body.cached || 0),
      failed: Number(body.failed || 0)
    });
  }
}

for (const days of flowRebuildDays) {
  const rebuildUrl =
    `${siteUrl}/.netlify/functions/rebuild-flow-window` +
    `?days=${days}&mode=trailing&secret=${encodeURIComponent(secret)}`;

  const rebuildRes = await fetch(rebuildUrl, {
    method: "POST"
  });

  const rebuildBody = await rebuildRes.json().catch(() => ({}));

  results.push({
    type: "rebuild-flow-window",
    days,
    status: rebuildRes.status,
    ok: !!rebuildBody.ok,
    wrote: Number(rebuildBody.wrote || 0),
    cohortUsers: Number(rebuildBody.cohortUsers || 0)
  });
}

      await db.collection("system_jobs").doc("scheduled-market-and-flow-refresh").set(
  {
    updatedAt: nowTS(),
    tickerCount: tickers.length,
    tickersToRefreshCount: tickersToRefresh.length,
    queuedTickerCount: queuedTickers.length,
    marketRefreshDays,
    flowRebuildDays,
    lastResults: results.slice(-20)
  },
  { merge: true }
);

    return json(200, {
      ok: true,
      tickerCount: tickers.length,
    tickersToRefreshCount: tickersToRefresh.length,
    queuedTickerCount: queuedTickers.length,
      results
    });
  } catch (e) {
    console.error("scheduled-market-and-flow-refresh error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};