// FILE: netlify/functions/market-refresh.cjs
// Warms Firestore market cache docs used by netlify/functions/market.js
//
// Writes to: market_cache/{windowKey}/tickers/{TICKER}
// windowKey: mkt_{days}d_{mode}_asof_{endISO}
//
// Auth:
// - Option A: Admin Bearer token (users/{uid}.role === "admin")
// - Option B: ?secret=... matches process.env.MARKET_WARM_SECRET (for cron)
//
// Supports GET or POST (cron-job.org friendly).
//
// Example (admin token):
//   POST /.netlify/functions/market-refresh?days=30&mode=trailing&asOf=2026-01-29
//   Authorization: Bearer <idToken>
//
// Example (secret cron):
//   GET  /.netlify/functions/market-refresh?days=30&mode=trailing&asOf=2026-01-29&secret=YOUR_SECRET&tickers=AAPL,MSFT

const admin = require("firebase-admin");

// ---- fetch support (Netlify runtime-safe) ----
let fetchFn = global.fetch;
async function getFetch() {
  if (fetchFn) return fetchFn;
  // Netlify Node runtimes may not have global fetch depending on version
  const mod = await import("node-fetch");
  fetchFn = mod.default;
  return fetchFn;
}

// -------------------------
// Admin init
// -------------------------
function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  let svc;
  try {
    svc = JSON.parse(raw);
  } catch (e) {
    // This is the exact crash you saw when raw was "AIza..."
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON (must be full service account JSON)");
  }

  // Netlify commonly stores private_key newlines as escaped "\\n"
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

const ADMIN_PROJECT_ID =
  admin.app().options?.projectId ||
  admin.app().options?.credential?.projectId ||
  null;

// -------------------------
// Helpers
// -------------------------
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function isoDate(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

function endOfMonthISO(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function computeWindow({ days, asOfISO, mode }) {
  const asOf = String(asOfISO || isoDate()).slice(0, 10);
  const endISO = mode === "monthEnd" ? endOfMonthISO(asOf) : asOf;

  const end = new Date(endISO);
  const start = new Date(end);
  start.setDate(start.getDate() - Number(days || 30));

  const startISO = start.toISOString().slice(0, 10);
  const windowKey = `mkt_${Number(days || 30)}d_${mode}_asof_${endISO}`;

  return { days: Number(days || 30), asOf, mode, startISO, endISO, windowKey };
}

function parseStooqCsv(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 3) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;

    const date = new Date(cols[0]);
    const close = Number(cols[4]);

    if (!Number.isFinite(close) || Number.isNaN(date.getTime())) continue;
    rows.push({ date, close });
  }

  rows.sort((a, b) => b.date - a.date); // newest -> oldest
  return rows;
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function endOfMonthDateTime(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999);
}

function pickAnchorRow(rowsDesc, asOfISO, mode) {
  if (!rowsDesc.length) return null;
  if (!asOfISO) return rowsDesc[0];

  const asOfDay = new Date(asOfISO);
  if (Number.isNaN(asOfDay.getTime())) return rowsDesc[0];

  const anchorTime = mode === "monthEnd" ? endOfMonthDateTime(asOfISO) || asOfDay : asOfDay;
  return rowsDesc.find((r) => r.date <= anchorTime) || rowsDesc[rowsDesc.length - 1];
}

function computeWindowReturn(rowsDesc, days, asOfISO, mode) {
  const latest = pickAnchorRow(rowsDesc, asOfISO, mode);
  if (!latest) return null;

  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - Number(days || 30));

  const older = rowsDesc.find((r) => r.date <= cutoff) || rowsDesc[rowsDesc.length - 1];
  if (!older || older.close <= 0) return null;

  const ret = (latest.close - older.close) / older.close;
  const latestDate = toISO(latest.date);

  const out = {
    return30d: ret, // UI legacy key
    returnDays: Number(days || 30),
    asOfUsed: latestDate,
    latestDate,
    olderDate: toISO(older.date)
  };

  out[`return${Number(days || 30)}d`] = ret;
  return out;
}

// ---- fetch with timeout ----
async function fetchWithTimeout(url, ms) {
  const fetch = await getFetch();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchPriceRows(ticker, timeoutMs = 12000) {
  const symbol = String(ticker || "").toUpperCase().trim();

  const twelveKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
  if (twelveKey) {
    try {
      const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
        `&interval=1day&outputsize=5000&apikey=${encodeURIComponent(twelveKey)}`;

      const res = await fetchWithTimeout(url, timeoutMs);
      const json = await res.json();

      if (Array.isArray(json.values)) {
        const rows = json.values
          .map((x) => ({
            date: new Date(x.datetime),
            close: Number(x.close)
          }))
          .filter((x) => !Number.isNaN(x.date.getTime()) && Number.isFinite(x.close))
          .sort((a, b) => b.date - a.date);

        if (rows.length) return { provider: "twelvedata", rows };
      }
    } catch {
      // fall through to Alpha Vantage
    }
  }

  const alphaKey = String(process.env.ALPHA_VANTAGE_API_KEY || "").trim();
  if (alphaKey) {
    try {
      const url =
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED` +
        `&symbol=${encodeURIComponent(symbol)}` +
        `&outputsize=full&apikey=${encodeURIComponent(alphaKey)}`;

      const res = await fetchWithTimeout(url, timeoutMs);
      const json = await res.json();

      const series = json["Time Series (Daily)"];
      if (series && typeof series === "object") {
        const rows = Object.entries(series)
          .map(([date, x]) => ({
            date: new Date(date),
            close: Number(x["5. adjusted close"] || x["4. close"])
          }))
          .filter((x) => !Number.isNaN(x.date.getTime()) && Number.isFinite(x.close))
          .sort((a, b) => b.date - a.date);

        if (rows.length) return { provider: "alphavantage", rows };
      }
    } catch {
      // no more providers
    }
  }

  return { provider: null, rows: [] };
}

// ---- tiny concurrency limiter ----
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency) return;
    const item = queue.shift();
    if (!item) return;

    active++;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve, item.reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

// -------------------------
// Auth
// -------------------------
async function requireAdminOrSecret(event) {
  const q = event.queryStringParameters || {};
  const secret = String(q.secret || "");
  const expected = String(process.env.MARKET_WARM_SECRET || "");

  // Cron path
  if (expected && secret && secret === expected) return { via: "secret" };

  // Admin token path
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token (or provide ?secret=...)");

  const decoded = await admin.auth().verifyIdToken(m[1].trim());
  const uid = decoded?.uid;
  if (!uid) throw new Error("Invalid token");

  const u = await db.collection("users").doc(uid).get();
  const role = (u.data() || {}).role || "user";
  if (role !== "admin") throw new Error("Admin only");

  return { via: "admin", uid };
}

// -------------------------
// Main
// -------------------------
exports.handler = async (event) => {
  try {
    // cron-job.org can do GET easily; keep POST too
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed (GET or POST only)" });
    }

    await requireAdminOrSecret(event);

    const q = event.queryStringParameters || {};
const days = clampInt(q.days || 30, 1, 365, 30);
const mode = String(q.mode || "trailing") === "monthEnd" ? "monthEnd" : "trailing";

// --- asOf default: LA date (not UTC) + weekend fallback ---
function ymdInTimeZone(date = new Date(), timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function prevWeekday(ymd) {
  const dt = new Date(`${ymd}T12:00:00Z`); // noon UTC avoids DST weirdness
  while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
    dt.setUTCDate(dt.getUTCDate() - 1);
  }
  return dt.toISOString().slice(0, 10);
}

const requestedAsOf = String(q.asOf || "").slice(0, 10).trim();
let asOf = requestedAsOf || ymdInTimeZone(new Date(), "America/Los_Angeles");
asOf = prevWeekday(asOf);

    // tickers can come from:
    // - query param tickers=AAPL,MSFT,...
    // - JSON body { tickers: [...] }
    let tickers = [];
    const qTickers = String(q.tickers || "");
    if (qTickers) {
      tickers = qTickers
        .split(",")
        .map((t) => String(t || "").trim().toUpperCase())
        .filter(Boolean);
    }

    if (!tickers.length && event.httpMethod === "POST" && event.body) {
      try {
        const body = JSON.parse(event.body || "{}");
        if (Array.isArray(body.tickers)) {
          tickers = body.tickers.map((t) => String(t || "").trim().toUpperCase()).filter(Boolean);
        }
      } catch {
        // ignore body parse errors
      }
    }

    tickers = uniq(tickers).slice(0, 120); // safe-ish cap

    if (!tickers.length) {
      return json(400, { error: "No tickers provided. Use ?tickers=... or POST body { tickers: [...] }" });
    }

    const win = computeWindow({ days, asOfISO: asOf, mode });

    const base = db.collection("market_cache").doc(win.windowKey).collection("tickers");
    const metaRef = db.collection("market_cache").doc(win.windowKey);

    const limit = pLimit(6);

    const results = await Promise.allSettled(
      tickers.map((tkr) =>
        limit(async () => {
          const ticker = String(tkr || "").toUpperCase().trim();
          if (!ticker) return { ticker, ok: false, reason: "EMPTY" };

          const fetched = await fetchPriceRows(ticker, 12000);
const rows = fetched.rows || [];

if (!rows.length) {
  return {
    ticker,
    ok: false,
    reason: "NO_PRICE_ROWS",
    provider: fetched.provider || "none"
  };
}

const stats = computeWindowReturn(rows, win.days, win.endISO, win.mode);

if (!stats) {
  return {
    ticker,
    ok: false,
    reason: "COMPUTE_FAILED",
    rowsFound: rows.length,
    newestDate: rows[0]?.date ? toISO(rows[0].date) : null,
    oldestDate: rows[rows.length - 1]?.date ? toISO(rows[rows.length - 1].date) : null,
    asOfUsed: win.endISO
  };
}

return { ticker, ok: true, stats: { ...stats, provider: fetched.provider } };
        })
      )
    );

    const okItems = [];
    const failed = [];

    for (const r of results) {
      if (r.status !== "fulfilled") {
        failed.push({ ticker: "UNKNOWN", ok: false, reason: "PROMISE_REJECTED" });
        continue;
      }
      if (r.value?.ok) okItems.push(r.value);
      else failed.push(r.value);
    }

    // Write successful docs (degrades gracefully)
    for (let i = 0; i < okItems.length; i += 450) {
      const chunk = okItems.slice(i, i + 450);
      const batch = db.batch();
      for (const x of chunk) {
        batch.set(
          base.doc(x.ticker),
          {
            ticker: x.ticker,
            ...x.stats,
            windowKey: win.windowKey,
            days: win.days,
            mode: win.mode,
            asOf: win.endISO,
            updatedAt: nowTS()
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    // Update meta doc
    await metaRef.set(
      {
        windowKey: win.windowKey,
        days: win.days,
        mode: win.mode,
        asOf: win.endISO,
        updatedAt: nowTS(),
        stats: {
          requested: tickers.length,
          cached: okItems.length,
          failed: failed.length
        }
      },
      { merge: true }
    );

    return json(200, {
  ok: true,
  adminProjectId: ADMIN_PROJECT_ID,
  window: win,
  requested: tickers.length,
  cached: okItems.length,
  failed: failed.length,
  failedItems: failed.slice(0, 25),
  cachedTickers: okItems.map((x) => x.ticker)
});
  } catch (e) {
    console.error("market-refresh error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};
