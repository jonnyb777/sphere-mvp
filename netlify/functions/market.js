// FILE: netlify/functions/market.js
// Reads cached market returns from Firestore (no external fetches).
// This prevents timeouts in live UI.
// Back-compat: still returns `items: [{ ticker, return30d, returnXd, ... }]`
// Also returns `missing` + `stale` flags so UI can decide what to show.

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
const now = () => Date.now();

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

function tsToMillis(ts) {
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    const q = event.queryStringParameters || {};
    const days = clampInt(q.days || 30, 1, 365, 30);
    const modeRaw = String(q.mode || "trailing");
    const mode = modeRaw === "monthEnd" ? "monthEnd" : "trailing";
    const endISO = computeEndISO({ asOf: q.asOf, mode });

    const tickers = String(q.tickers || "")
      .split(",")
      .map((t) => String(t || "").trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 150); // reading cache is cheap; keep reasonable

    if (!tickers.length) return json(400, { error: "No tickers provided" });

    const windowKey = windowKeyFor({ days, mode, endISO });

    // We store: market_cache/{TICKER}/windows/{windowKey}
    // Reading docs is fast using getAll in chunks.
    const refs = [];
    for (const t of tickers) {
      refs.push(db.collection("market_cache").doc(t).collection("windows").doc(windowKey));
    }

    const docs = [];
    for (let i = 0; i < refs.length; i += 450) {
      const chunk = refs.slice(i, i + 450);
      // eslint-disable-next-line no-await-in-loop
      const snaps = await db.getAll(...chunk);
      for (const s of snaps) docs.push(s);
    }

    const staleAfterMs = 1000 * 60 * 60 * 36; // 36 hours
    const items = [];

    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      const s = docs[i];

      if (!s || !s.exists) {
        items.push({
          ticker: t,
          return30d: null,
          returnDays: days,
          asOfUsed: endISO,
          missing: true,
          stale: true
        });
        continue;
      }

      const d = s.data() || {};
      const updatedAtMs = tsToMillis(d.updatedAt || d.fetchedAt || d.lastUpdatedAt);
      const stale = updatedAtMs ? now() - updatedAtMs > staleAfterMs : true;

      // Keep back-compat:
      // - return30d always present (even if days != 30, we keep it equal to returnNd for UI compatibility)
      const ret = Number(d.return ?? d[`return${days}d`] ?? d.return30d);
      const finiteRet = Number.isFinite(ret) ? ret : null;

      const out = {
        ticker: t,
        return30d: finiteRet, // legacy UI key
        returnDays: days,
        asOfUsed: String(d.asOfUsed || d.endISO || endISO),
        latestDate: d.latestDate || null,
        olderDate: d.olderDate || null,
        missing: false,
        stale
      };

      // Add explicit window key too:
      out[`return${days}d`] = finiteRet;

      items.push(out);
    }

    return json(200, {
      ok: true,
      windowKey,
      meta: { days, mode, endISO },
      items
    });
  } catch (e) {
    console.error("market(cache-read) error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};
