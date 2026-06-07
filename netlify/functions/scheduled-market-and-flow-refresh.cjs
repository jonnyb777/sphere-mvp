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
    ...obj
  };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function marketWindowKey(days, mode = "trailing", asOfISO = todayISO()) {
  return `mkt_${days}d_${mode}_asof_${asOfISO}`;
}

async function fetchJsonWithTimeout(url, opts = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, timedOut: false };
  } catch (e) {
    return { status: 0, body: { error: String(e?.message || e) }, timedOut: true };
  } finally {
    clearTimeout(timer);
  }
}

async function filterUncachedTickers({ tickers, days = 30, mode = "trailing" }) {
  const windowKey = marketWindowKey(days, mode);
  const out = [];

  for (const ticker of tickers) {
    const snap = await db
      .collection("market_cache")
      .doc(windowKey)
      .collection("tickers")
      .doc(ticker)
      .get();

    if (!snap.exists) out.push(ticker);
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

    const startedAt = Date.now();
    const MAX_RUN_MS = 24000;
    const MAX_COMPANY_TICKERS_PER_WINDOW = 12;

    function hasTimeLeft() {
      return Date.now() - startedAt < MAX_RUN_MS;
    }

    const companyMarketRefreshDays = [30, 60, 90];
    const sectorEtfMarketRefreshDays = [30, 60, 90];
    const flowRebuildDays = [30, 60, 90];

    const sectorEtfs = [
      "XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLK", "XLU", "XLRE"
    ];

    const baseTickers = [
      ...sectorEtfs,
      "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "COST", "TGT", "WMT",
      "SBUX", "MCD", "CMG", "NFLX", "DIS", "SPOT", "UBER", "CVS", "KR",
      "PGR", "ALL", "SIRI", "DELL", "ORCL", "AVGO", "ADBE", "CRM",
      "HD", "LOW", "KO", "PEP", "CL", "KMB", "PG", "JNJ", "UNH", "MRK",
      "PFE", "BAC", "JPM", "GS", "V", "MA", "AXP"
    ];

    const queuedTickers = await readQueuedTickers(500);

    const tickers = Array.from(
      new Set(
        [...baseTickers, ...queuedTickers]
          .map((t) => String(t).toUpperCase().trim())
          .filter(Boolean)
      )
    );

    const results = [];
    let tickersToRefreshCount = 0;
    let companyTickersToRefreshCount = 0;

    const sectorEtfChunks = chunkArray(sectorEtfs, 100);

    for (const days of sectorEtfMarketRefreshDays) {
      if (!hasTimeLeft()) break;

      for (const chunk of sectorEtfChunks) {
        if (!hasTimeLeft()) break;

        const url =
          `${siteUrl}/.netlify/functions/market-refresh` +
          `?days=${days}&mode=trailing&secret=${encodeURIComponent(secret)}` +
          `&tickers=${encodeURIComponent(chunk.join(","))}`;

        const { status, body, timedOut } = await fetchJsonWithTimeout(url);

        results.push({
          type: "market-refresh-sector-etfs",
          days,
          requested: chunk.length,
          status,
          timedOut,
          cached: Number(body.cached || 0),
          failed: Number(body.failed || 0)
        });
      }
    }

    for (const days of companyMarketRefreshDays) {
      if (!hasTimeLeft()) {
        results.push({ type: "budget-stop-company-refresh", days, reason: "time_budget_reached" });
        break;
      }

      const tickersToRefreshForDays = await filterUncachedTickers({
        tickers,
        days,
        mode: "trailing"
      });

      const companyTickersToRefreshForDays = tickersToRefreshForDays
        .filter((t) => !sectorEtfs.includes(t))
        .slice(0, MAX_COMPANY_TICKERS_PER_WINDOW);

      tickersToRefreshCount += tickersToRefreshForDays.length;
      companyTickersToRefreshCount += companyTickersToRefreshForDays.length;

      const companyChunks = chunkArray(companyTickersToRefreshForDays, 100);

      for (const chunk of companyChunks) {
        if (!hasTimeLeft()) {
          results.push({ type: "budget-stop-company-refresh", days, reason: "time_budget_reached" });
          break;
        }

        const url =
          `${siteUrl}/.netlify/functions/market-refresh` +
          `?days=${days}&mode=trailing&secret=${encodeURIComponent(secret)}` +
          `&tickers=${encodeURIComponent(chunk.join(","))}`;

        const { status, body, timedOut } = await fetchJsonWithTimeout(url);

        results.push({
          type: "market-refresh-company-tickers",
          days,
          requested: chunk.length,
          status,
          timedOut,
          cached: Number(body.cached || 0),
          failed: Number(body.failed || 0)
        });
      }
    }

    for (const days of flowRebuildDays) {
      if (!hasTimeLeft()) {
        results.push({ type: "budget-stop-flow-rebuild", days, reason: "time_budget_reached" });
        break;
      }

      const rebuildUrl =
        `${siteUrl}/.netlify/functions/rebuild-flow-window` +
        `?days=${days}&mode=trailing&secret=${encodeURIComponent(secret)}`;

      const {
        status,
        body: rebuildBody,
        timedOut
      } = await fetchJsonWithTimeout(rebuildUrl, { method: "POST" }, 6000);

      results.push({
        type: "rebuild-flow-window",
        days,
        status,
        timedOut,
        ok: !!rebuildBody.ok,
        wrote: Number(rebuildBody.wrote || 0),
        cohortUsers: Number(rebuildBody.cohortUsers || 0)
      });
    }

    await db.collection("system_jobs").doc("scheduled-market-and-flow-refresh").set(
      {
        updatedAt: nowTS(),
        tickerCount: tickers.length,
        tickersToRefreshCount,
        companyTickersToRefreshCount,
        queuedTickerCount: queuedTickers.length,
        companyMarketRefreshDays,
        sectorEtfMarketRefreshDays,
        flowRebuildDays,
        lastResults: results.slice(-20)
      },
      { merge: true }
    );

    console.log("scheduled-market-and-flow-refresh complete", {
  ok: true,
  tickerCount: tickers.length,
  tickersToRefreshCount,
  companyTickersToRefreshCount,
  sectorEtfCount: sectorEtfs.length,
  queuedTickerCount: queuedTickers.length,
  results
});

return;
  } catch (e) {
    console.error("scheduled-market-and-flow-refresh error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};