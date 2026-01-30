// FILE: netlify/functions/market-refresh.cjs
// Fetches Stooq and writes market return cache into Firestore.
// Admin-only endpoint (checks users/{uid}.role === "admin").
// Endpoint:
//   POST /.netlify/functions/market-refresh
// Body:
//   { tickers: ["AAPL","MSFT"], days: 30, asOf: "YYYY-MM-DD", mode: "trailing"|"monthEnd" }

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

function endOfMonthISO(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

function computeEndISO({ asOf, mode }) {
  const iso = String(asOf || new Date().toISOString().slice(0, 10));
  const endISO = mode === "monthEnd" ? endOfMonthISO(iso) : iso;
  return endISO || new Date().toISOString().slice(0, 10);
}

function windowKeyFor({ days, mode, endISO }) {
  return `mkt_${Number(days)}d_${mode}_asof_${endISO}`;
}

async function requireAdmin(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");

  const decoded = await admin.auth().verifyIdToken(m[1].trim());
  const uid = decoded?.uid;
  if (!uid) throw new Error("Invalid token");

  const snap = await db.collection("users").doc(uid).get();
  const role = (snap.data() || {}).role || "user";
  if (role !== "admin") throw new Error("Admin only");

  return uid;
}

// ---- stooq parsing ----
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

function endOfMonthDate(dateISO) {
  const dt = new Date(dateISO);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999);
}

function pickAnchorRow(rowsDesc, asOfISO, mode) {
  if (!rowsDesc.length) return null;
  if (!asOfISO) return rowsDesc[0];

  const asOfDay = new Date(asOfISO);
  if (Number.isNaN(asOfDay.getTime())) return rowsDesc[0];

  const anchorTime = mode === "monthEnd" ? endOfMonthDate(asOfISO) || asOfDay : asOfDay;
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

  return {
    return: ret,
    return30d: ret, // legacy/back-compat
    returnDays: Number(days || 30),
    asOfUsed: toISO(latest.date),
    latestDate: toISO(latest.date),
    olderDate: toISO(older.date)
  };
}

// ---- fetch with timeout ----
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchCsv(ticker, timeoutMs = 8000) {
  const t = ticker.includes(".") ? ticker : `${ticker}.us`;
  const url = `https://stooq.com/q/d/l/?s=${t.toLowerCase()}&i=d`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return null;
  return await res.text();
}

// simple concurrency limiter
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    await requireAdmin(event);

    const body = JSON.parse(event.body || "{}");
    const days = clampInt(body.days || 30, 1, 365, 30);
    const modeRaw = String(body.mode || "trailing");
    const mode = modeRaw === "monthEnd" ? "monthEnd" : "trailing";
    const endISO = computeEndISO({ asOf: body.asOf, mode });
    const windowKey = windowKeyFor({ days, mode, endISO });

    const tickers = (Array.isArray(body.tickers) ? body.tickers : String(body.tickers || "").split(","))
      .map((t) => String(t || "").trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 200);

    if (!tickers.length) return json(400, { error: "No tickers provided" });

    const limit = pLimit(6);
    const results = [];

    const jobs = tickers.map((t) =>
      limit(async () => {
        try {
          const csv = await fetchCsv(t, 8000);
          if (!csv) return { ticker: t, ok: false, error: "fetch_failed" };

          const rows = parseStooqCsv(csv);
          const stats = computeWindowReturn(rows, days, endISO, mode);
          if (!stats) return { ticker: t, ok: false, error: "no_stats" };

          // write cache: market_cache/{TICKER}/windows/{windowKey}
          const ref = db.collection("market_cache").doc(t).collection("windows").doc(windowKey);
          await ref.set(
            {
              ticker: t,
              windowKey,
              days,
              mode,
              endISO,
              ...stats,
              updatedAt: nowTS()
            },
            { merge: true }
          );

          return { ticker: t, ok: true };
        } catch (e) {
          return { ticker: t, ok: false, error: String(e?.message || e) };
        }
      })
    );

    const settled = await Promise.allSettled(jobs);
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else results.push({ ok: false, error: "promise_rejected" });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    return json(200, {
      ok: true,
      windowKey,
      meta: { days, mode, endISO },
      counts: { ok: okCount, failed: failCount },
      results
    });
  } catch (e) {
    console.error("market-refresh error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};
