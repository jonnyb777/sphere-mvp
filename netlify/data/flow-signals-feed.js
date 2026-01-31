// FILE: netlify/functions/flow-signals-feed.js
// CommonJS (Netlify-safe)
// Public-ish read endpoint for the Flow feed (Option A).
// Returns ARRAY of items your MonthlyFlow.jsx already expects.
// Default: returns VERIFIED items only (eligibility.passed === true) to be defensible.

const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  let svc;
  try {
    svc = JSON.parse(raw);
  } catch (e) {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON");
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

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    },
    body: JSON.stringify(bodyObj)
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
  if (!endISO) return new Date().toISOString().slice(0, 10);
  return endISO;
}

/**
 * Option A feed format:
 * Returns ARRAY of items:
 * [
 *   {
 *     ticker, sector, signal, count, date,
 *     users, events, maxUserShare, top3Share, deltaPct,
 *     eligibility: { passed, reasons }
 *   }
 * ]
 *
 * Query params (all optional):
 * - windowId: exact windowId match (fastest)
 * - days: number (default 30)
 * - asOf: YYYY-MM-DD (default today)
 * - mode: "trailing" | "monthEnd" (default trailing)
 * - limit: number (default 250, max 500)
 * - includeUnverified: "1" to include eligibility.passed !== true (default excludes)
 */
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

    const qs = event.queryStringParameters || {};

    const days = clampInt(qs.days || 30, 1, 365, 30);
    const mode = String(qs.mode || "trailing");
    const endISO = computeEndISO({
      asOf: qs.asOf || new Date().toISOString().slice(0, 10),
      mode
    });

    // windowId is based on endISO (not raw asOf input)
    const defaultWindowId = `flow_${days}d_${mode}_asof_${endISO}`;
    const windowId = String(qs.windowId || defaultWindowId);

    const includeUnverified = String(qs.includeUnverified || "") === "1";

    let limit = clampInt(qs.limit || 250, 1, 500, 250);

    // We store flow_signals with windowId, date, updatedAt.
    // If you don't have the composite index for (windowId asc, date desc),
    // remove orderBy("date","desc") and it will still work (unordered).
    let query = db.collection("flow_signals").where("windowId", "==", windowId);

    // Prefer stable ordering for UI
    try {
      query = query.orderBy("date", "desc");
    } catch {
      // If orderBy errors due to missing index, Firestore will throw on get().
      // We'll handle in the catch below and retry without orderBy.
    }

    query = query.limit(limit);

    let snap;
    try {
      snap = await query.get();
    } catch (e) {
      // Retry without orderBy if index isn't created yet
      const msg = String(e?.message || "");
      const looksLikeIndex = msg.toLowerCase().includes("index") || msg.toLowerCase().includes("requires");
      if (!looksLikeIndex) throw e;

      snap = await db.collection("flow_signals").where("windowId", "==", windowId).limit(limit).get();
    }

    const items = [];

    snap.forEach((doc) => {
      const x = doc.data() || {};

      const eligibility = x.eligibility || null;

      // Default: only verified items if eligibility exists
      if (!includeUnverified && eligibility && eligibility.passed !== true) return;

      const item = {
        ticker: String(x.ticker || "").toUpperCase().trim(),
        sector: String(x.sector || "Other / Unmapped"),
        signal: String(x.signal || "—"),
        count: Number(x.count ?? 0),
        date: x.date || x.asOf || x.AsOf || null,

        // credibility metadata (optional but used by badge/filter)
        users: Number(x.users ?? 0),
        events: Number(x.events ?? 0),
        maxUserShare: Number(x.maxUserShare ?? 0),
        top3Share: Number(x.top3Share ?? 0),
        deltaPct: Number(x.deltaPct ?? 0),
        eligibility
      };

      // Basic validity
      if (!item.ticker) return;
      if (!Number.isFinite(item.count)) return;

      items.push(item);
    });

    // If you want to keep the feed small and "calm", you can also trim here.
    // Example: items = items.slice(0, 200);

    return jsonResponse(200, items);
  } catch (e) {
    console.error("community-flow error:", e);
    return jsonResponse(500, { error: String(e?.message || e) });
  }
};
