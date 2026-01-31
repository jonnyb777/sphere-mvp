// FILE: netlify/functions/market.js
// Cache-read market endpoint.
// Reads precomputed return docs from Firestore (market_cache) and returns what it finds.
// Degrades gracefully: missing tickers are reported but do NOT cause HTTP 500.
//
// Response shape (back-compat):
// {
//   items: [{ ticker, return30d, returnDays, asOfUsed, latestDate, olderDate, returnNd... }],
//   missing: ["TICKER1", ...],
//   meta: { days, mode, asOf }
// }

const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  let svc;
  try {
    svc = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON");
  }

  if (svc.private_key && typeof svc.private_key === "string") {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({
    credential: admin.credential.cert(svc)
  });
}
initAdmin();

const db = admin.firestore();

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
  const iso = String(asOf || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const endISO = mode === "monthEnd" ? endOfMonthISO(iso) : iso;
  if (!endISO) return new Date().toISOString().slice(0, 10);
  return endISO;
}

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, OPTIONS"
        },
        body: ""
      };
    }

    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    const q = event.queryStringParameters || {};

    const days = clampInt(q.days || 30, 1, 365, 30);
    const mode = String(q.mode || "trailing") === "monthEnd" ? "monthEnd" : "trailing";
    const endISO = computeEndISO({
      asOf: q.asOf || new Date().toISOString().slice(0, 10),
      mode
    });

    const tickers = String(q.tickers || "")
      .split(",")
      .map((t) => String(t || "").trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 60); // IMPORTANT: cap to keep payloads sane

    if (!tickers.length) return jsonResponse(400, { error: "No tickers provided" });

    const windowKey = `mkt_${days}d_${mode}_asof_${endISO}`;

    // Read from:
    // market_cache/{windowKey}/tickers/{TICKER}
    const base = db.collection("market_cache").doc(windowKey).collection("tickers");

    // Firestore admin getAll supports up to ~500 refs; we cap at 60 anyway.
    const refs = tickers.map((t) => base.doc(t));
    const snaps = await db.getAll(...refs);

    const items = [];
    const missing = [];

    for (const s of snaps) {
      if (!s.exists) {
        missing.push(s.id);
        continue;
      }
      const d = s.data() || {};
      const ret = d.return30d;

      // If malformed doc, treat as missing
      if (typeof ret !== "number" || !Number.isFinite(ret)) {
        missing.push(s.id);
        continue;
      }

      items.push({
        ticker: s.id,
        ...d
      });
    }

    // Sort desc by return30d so UI gets best first
    items.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

    return jsonResponse(200, {
      items,
      missing,
      meta: { days, mode, asOf: endISO }
    });
  } catch (e) {
    console.error("market.js error:", e);
    return jsonResponse(500, { error: String(e?.message || e) });
  }
};
