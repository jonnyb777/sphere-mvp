// FILE: netlify/functions/market.js
// Cache-read market endpoint with server-side auto-warm.
// Reads precomputed return docs from Firestore (market_cache) and returns what it finds.
// If cache is missing AND MARKET_WARM_SECRET is set, it will warm missing tickers server-side
// (no client secrets, no user steps), then retry the read once.
//
// Response shape (back-compat):
// {
//   items: [{ ticker, return30d, returnDays, asOfUsed, latestDate, olderDate, returnNd... }],
//   missing: ["TICKER1", ...],
//   meta: { days, mode, asOf }
// }

const admin = require("firebase-admin");

// ---- fetch support (Netlify runtime-safe) ----
let fetchFn = global.fetch;
async function getFetch() {
  if (fetchFn) return fetchFn;
  const mod = await import("node-fetch");
  fetchFn = mod.default;
  return fetchFn;
}

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

function endOfMonthISO(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

// --- NY time helpers ---
function nyParts(date = new Date()) {
  // Node supports timeZone in Intl on Netlify
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    wd: String(get("weekday") || ""), // Mon/Tue/...
    hh: Number(get("hour")),
    mm: Number(get("minute"))
  };
}

function isoFromYMD(y, m, d) {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function shiftISO(iso, deltaDays) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

// Default asOf:
// - If Sat/Sun => Friday
// - If weekday but BEFORE ~16:10 NY (after-market close + a buffer) => previous trading day
function defaultAsOfNY() {
  const p = nyParts(new Date());
  let iso = isoFromYMD(p.y, p.m, p.d);

  const isSat = p.wd.toLowerCase().startsWith("sat");
  const isSun = p.wd.toLowerCase().startsWith("sun");
  const isMon = p.wd.toLowerCase().startsWith("mon");

  // Weekend -> Friday
  if (isSat) return shiftISO(iso, -1);
  if (isSun) return shiftISO(iso, -2);

  // Before close buffer -> go back one (or to Friday if Monday)
  const beforeCloseBuffer = (p.hh < 16) || (p.hh === 16 && p.mm < 10);
  if (beforeCloseBuffer) {
    if (isMon) return shiftISO(iso, -3); // Monday -> Friday
    return shiftISO(iso, -1);
  }

  return iso;
}

function computeEndISO({ asOf, mode }) {
  const iso = String(asOf || "").slice(0, 10);

  // If caller didn't provide asOf, use default NY close logic
  const baseISO = iso && iso.length === 10 ? iso : defaultAsOfNY();

  const endISO = mode === "monthEnd" ? endOfMonthISO(baseISO) : baseISO;
  return endISO || baseISO;
}

async function readCache({ windowKey, tickers }) {
  const base = db.collection("market_cache").doc(windowKey).collection("tickers");
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

    if (typeof ret !== "number" || !Number.isFinite(ret)) {
      missing.push(s.id);
      continue;
    }

    items.push({ ticker: s.id, ...d });
  }

  items.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));
  return { items, missing };
}

// Calls market-refresh internally using secret (server-side only).
async function warmMissing({ origin, days, mode, endISO, tickers }) {
  const secret = String(process.env.MARKET_WARM_SECRET || "");
  if (!secret) return { warmed: false, reason: "no_secret" };

  // Keep this small to avoid slow requests
  const slice = (tickers || []).slice(0, 25);
  if (!slice.length) return { warmed: false, reason: "no_tickers" };

  const qs = new URLSearchParams({
    days: String(days),
    mode: String(mode),
    asOf: String(endISO),
    secret,
    tickers: slice.join(",")
  });

  const fetch = await getFetch();
  const url = `${origin}/.netlify/functions/market-refresh?${qs.toString()}`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text();

  if (!res.ok) {
    return { warmed: false, reason: `refresh_http_${res.status}`, detail: text.slice(0, 250) };
  }

  return { warmed: true };
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

    // ✅ This is the key change: default asOf is last NY market close
    const endISO = computeEndISO({ asOf: q.asOf, mode });

    const tickers = String(q.tickers || "")
      .split(",")
      .map((t) => String(t || "").trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 60);

    if (!tickers.length) return jsonResponse(400, { error: "No tickers provided" });

    const windowKey = `mkt_${days}d_${mode}_asof_${endISO}`;

    // 1) Read
    let { items, missing } = await readCache({ windowKey, tickers });

    // 2) Auto-warm once if missing (server-side secret, users never see this)
    // Avoid infinite retries: only retry if we actually attempted a warm.
    if (missing.length) {
      const origin =
        event.headers?.["x-forwarded-proto"] && event.headers?.host
          ? `${event.headers["x-forwarded-proto"]}://${event.headers.host}`
          : "https://localhost"; // fallback; netlify will have headers in real requests

      // In netlify dev, x-forwarded-proto may be missing; host is usually localhost:8888
      const devOrigin =
        event.headers?.host && String(event.headers.host).includes("localhost")
          ? `http://${event.headers.host}`
          : origin;

      const warm = await warmMissing({
        origin: devOrigin,
        days,
        mode,
        endISO,
        tickers: missing
      });

      if (warm.warmed) {
        const reread = await readCache({ windowKey, tickers });
        items = reread.items;
        missing = reread.missing;
      }
    }

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
