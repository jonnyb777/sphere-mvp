// FILE: netlify/functions/rebuild-flow-window.js
// CommonJS (Netlify-safe)
// Admin-only endpoint to rebuild Flow aggregates/signals for a given window.
// Option A: sector-level signals (plus optional runner items if you add ticker mapping later)

const admin = require("firebase-admin");
const crypto = require("crypto");

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

  // Netlify often stores private_key newlines as escaped "\\n"
  if (svc.private_key && typeof svc.private_key === "string") {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({
    credential: admin.credential.cert(svc)
  });
}

initAdmin();
const db = admin.firestore();

/**
 * "Defensible" defaults (production-leaning).
 * You can loosen these for early beta, but this is the strong version.
 */
const LIMITS = {
  // Sector eligibility (to show as Verified)
  MIN_SECTOR_USERS: 25,
  MIN_SECTOR_EVENTS: 250,
  MAX_SECTOR_MAX_USER_SHARE: 0.10,
  MAX_SECTOR_TOP3_SHARE: 0.25,

  // Window-level credibility
  MIN_WINDOW_USERS: 50,

  // Delta (for "stability" / trend tagging)
  // (Not used as a hard gate unless you want it)
  MIN_ABS_DELTA_FOR_TREND: 0.15,

  // Safety: cap reads
  MAX_DOCS_PER_WINDOW: 250000
};

// Server-side sector mapping (matches your Drip style)
const MERCHANT_TO_SECTOR = [
  {
    match: ["AMAZON", "TARGET", "WALMART", "COSTCO", "HOME DEPOT", "LOWE", "TJ MAX", "TJMAX", "KROGER"],
    sector: "Consumer & Retail"
  },
  { match: ["CVS", "WALGREENS", "RITE AID", "KAISER", "BLUE CROSS", "UNITEDHEALTH"], sector: "Healthcare" },
  { match: ["MCDONALD", "STARBUCKS", "CHIPOTLE", "DOMINO", "YUM", "TACO BELL", "KFC", "PIZZA"], sector: "Restaurants" },
  { match: ["UBER", "LYFT", "DELTA", "SOUTHWEST", "AMERICAN AIRLINES", "FEDEX", "UPS"], sector: "Transportation" },
  { match: ["EXXON", "CHEVRON", "SHELL", "VALERO", "PHILLIPS 66", "SCHLUMBERGER", "SLB"], sector: "Energy" },
  { match: ["APPLE", "MICROSOFT", "GOOGLE", "META", "FACEBOOK", "NVIDIA", "AMD", "ORACLE"], sector: "Technology" },
  { match: ["NETFLIX", "DISNEY", "HULU", "SPOTIFY", "WARNER"], sector: "Media & Entertainment" },
  {
    match: ["CHASE", "JPMORGAN", "JPMORGAN CHASE", "BANK OF AMERICA", "WELLS FARGO", "CITI", "GOLDMAN", "VISA", "MASTERCARD", "AMEX"],
    sector: "Financials"
  }
];

function inferSector(merchantNorm) {
  const m = String(merchantNorm || "").toUpperCase();
  for (const rule of MERCHANT_TO_SECTOR) {
    if (rule.match.some((k) => m.includes(k))) return rule.sector;
  }
  return "Other / Unmapped";
}

function endOfMonthISO(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

function computeWindow({ days, asOfISO, mode }) {
  const asOf = String(asOfISO || new Date().toISOString().slice(0, 10));
  const endISO = mode === "monthEnd" ? endOfMonthISO(asOf) : asOf;
  if (!endISO) throw new Error("Bad asOf for window");
  const end = new Date(endISO);
  if (Number.isNaN(end.getTime())) throw new Error("Bad end date for window");
  const start = new Date(end);
  start.setDate(start.getDate() - Number(days || 30));
  return {
    asOf,
    endISO,
    startISO: start.toISOString().slice(0, 10)
  };
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  };
}

function buildSignalLine({ maxUserShare, users }, deltaPct) {
  const concentration =
    maxUserShare >= 0.12 ? "High spend concentration" :
    maxUserShare >= 0.08 ? "Moderate concentration" :
    "Broad-based";

  const breadth =
    users >= 80 ? "High breadth" :
    users >= 40 ? "Medium breadth" :
    "Narrow breadth";

  const stability =
    Math.abs(deltaPct) < 0.20 ? "Stable" :
    Math.abs(deltaPct) < 0.40 ? "Emerging" :
    "Spiky";

  return `${concentration} · ${breadth} · ${stability}`;
}

function eligibilitySector({ users, events, maxUserShare, top3Share }, windowCredible) {
  const reasons = [];
  if (!windowCredible) reasons.push(`Window cohort < ${LIMITS.MIN_WINDOW_USERS} users`);
  if (users < LIMITS.MIN_SECTOR_USERS) reasons.push(`Users < ${LIMITS.MIN_SECTOR_USERS}`);
  if (events < LIMITS.MIN_SECTOR_EVENTS) reasons.push(`Events < ${LIMITS.MIN_SECTOR_EVENTS}`);
  if (maxUserShare > LIMITS.MAX_SECTOR_MAX_USER_SHARE) reasons.push(`Single-user share > ${LIMITS.MAX_SECTOR_MAX_USER_SHARE}`);
  if (top3Share > LIMITS.MAX_SECTOR_TOP3_SHARE) reasons.push(`Top-3 share > ${LIMITS.MAX_SECTOR_TOP3_SHARE}`);
  return { passed: reasons.length === 0, reasons };
}

// Admin auth: requires admins/{uid} exists (your current pattern)
async function requireAdmin(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");
  const token = m[1].trim();
  const decoded = await admin.auth().verifyIdToken(token);
  const uid = decoded?.uid;
  if (!uid) throw new Error("Invalid token");

  const snap = await db.collection("admins").doc(uid).get();
  if (!snap.exists) throw new Error("Not admin");
  return uid;
}

// Iterates query results without blowing memory too fast.
// NOTE: Firestore does not truly stream; this is still an in-memory list from query.get().
// For MVP, we accept it but cap MAX_DOCS_PER_WINDOW.
async function loadWindowRows({ startISO, endISO }) {
  // postedDate is YYYY-MM-DD string; lexicographically sortable
  const snap = await db
    .collectionGroup("tx")
    .where("postedDate", ">=", startISO)
    .where("postedDate", "<=", endISO)
    .get();

  if (snap.size > LIMITS.MAX_DOCS_PER_WINDOW) {
    throw new Error(`Window too large (${snap.size}). Increase filters or raise MAX_DOCS_PER_WINDOW.`);
  }

  const rows = [];
  snap.forEach((d) => rows.push(d.data() || {}));
  return rows;
}

function aggregateSectors(rows) {
  // sector -> { totalSpend, events, userTotals: Map<uid, totalSpend> }
  const buckets = new Map();
  const cohortUsers = new Set();

  for (const r of rows) {
    const uid = String(r.uid || "").trim();
    if (!uid) continue;
    cohortUsers.add(uid);

    const merchantNorm = String(r.merchantNorm || "");
    const sector = inferSector(merchantNorm);
    if (!sector || sector === "Other / Unmapped") continue;

    const amt = Number(r.amount);
    if (!Number.isFinite(amt)) continue;

    // Treat spend magnitude; if your uploads use positive spend, abs() is safe.
    const spend = Math.abs(amt);

    let b = buckets.get(sector);
    if (!b) {
      b = { sector, totalSpend: 0, events: 0, userTotals: new Map() };
      buckets.set(sector, b);
    }

    b.totalSpend += spend;
    b.events += 1;
    b.userTotals.set(uid, (b.userTotals.get(uid) || 0) + spend);
  }

  // Finalize per sector
  const out = new Map();
  for (const [sector, b] of buckets.entries()) {
    const totals = Array.from(b.userTotals.values()).sort((a, c) => c - a);
    const users = totals.length;
    const totalSpend = b.totalSpend || 0;

    const maxUserShare = users && totalSpend ? totals[0] / totalSpend : 0;
    const top3Share = users && totalSpend ? (totals.slice(0, 3).reduce((s, x) => s + x, 0) / totalSpend) : 0;

    out.set(sector, {
      sector,
      totalSpend,
      events: b.events,
      users,
      maxUserShare,
      top3Share
    });
  }

  return { sectors: out, uniqueUsers: cohortUsers.size };
}

function normalizeWeights(sectorAggMap) {
  const items = Array.from(sectorAggMap.values());
  const total = items.reduce((s, x) => s + (Number.isFinite(x.totalSpend) ? x.totalSpend : 0), 0) || 0;
  return items
    .map((x) => ({
      sector: x.sector,
      weight: total ? x.totalSpend / total : 0
    }))
    .sort((a, b) => b.weight - a.weight);
}

function stableWindowId(days, mode, endISO) {
  // same format you used in community-flow.js
  return `flow_${days}d_${mode}_asof_${endISO}`;
}

function safeIdSegment(s) {
  return String(s || "")
    .trim()
    .replace(/[^A-Za-z0-9_ -]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

// MAIN
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    await requireAdmin(event);

    const body = JSON.parse(event.body || "{}");
    const days = Number(body.days || 30);
    const asOfISO = String(body.asOf || new Date().toISOString().slice(0, 10));
    const mode = String(body.mode || "trailing"); // trailing | monthEnd

    const w0 = computeWindow({ days, asOfISO, mode });

    // Previous window: end date is day before current start
    const prevEnd = new Date(w0.startISO);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevAsOf = prevEnd.toISOString().slice(0, 10);
    const w1 = computeWindow({ days, asOfISO: prevAsOf, mode });

    // Load canonical tx
    const [currRows, prevRows] = await Promise.all([loadWindowRows(w0), loadWindowRows(w1)]);

    // Aggregate
    const curr = aggregateSectors(currRows);
    const prev = aggregateSectors(prevRows);

    const windowId = stableWindowId(days, mode, w0.endISO);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const windowCredible = curr.uniqueUsers >= LIMITS.MIN_WINDOW_USERS;

    // Write window summary doc (flow_agg/{windowId})
    const topWeights = normalizeWeights(curr.sectors).slice(0, 5);
    const narrativeHighestSector = topWeights[0]?.sector || "—";

    await db.collection("flow_agg").doc(windowId).set(
      {
        windowId,
        days,
        asOf: w0.endISO,
        mode,
        start: w0.startISO,
        end: w0.endISO,
        updatedAt: now,
        cohort: {
          uniqueUsers: curr.uniqueUsers
        },
        credibility: {
          passed: windowCredible,
          reasons: windowCredible ? [] : [`uniqueUsers < ${LIMITS.MIN_WINDOW_USERS}`],
          kUsersMin: LIMITS.MIN_WINDOW_USERS
        },
        narrativeHighestSector,
        topSectors: topWeights
      },
      { merge: true }
    );

    // Write sector docs + flow_signals (Option A)
    const writes = [];

    for (const [sector, currS] of curr.sectors.entries()) {
      const prevS = prev.sectors.get(sector) || { totalSpend: 0, events: 0, users: 0, maxUserShare: 0, top3Share: 0 };
      const deltaPct =
        prevS.totalSpend > 0 ? (currS.totalSpend - prevS.totalSpend) / prevS.totalSpend : (currS.totalSpend > 0 ? 1 : 0);

      const eligibility = eligibilitySector(currS, windowCredible);

      // Sector doc
      const sectorDocId = safeIdSegment(sector);
      const sectorRef = db.collection("flow_agg").doc(windowId).collection("sectors").doc(sectorDocId);

      // weight computed off current totals
      // We'll compute weights from normalized weights map
      // (We can precompute for speed)
      // Simple: compute now:
      const totalSpendAll = Array.from(curr.sectors.values()).reduce((s, x) => s + (x.totalSpend || 0), 0) || 0;
      const weight = totalSpendAll ? currS.totalSpend / totalSpendAll : 0;

      writes.push(
        sectorRef.set(
          {
            windowId,
            sector,
            weight,
            events: currS.events,
            users: currS.users,
            maxUserShare: currS.maxUserShare,
            top3Share: currS.top3Share,
            deltaPct,
            eligibility,
            updatedAt: now
          },
          { merge: true }
        )
      );

      // flow_signals item (what your MonthlyFlow consumes)
      // IMPORTANT: we keep `ticker` as a string for compatibility,
      // but set `type:"sector"` so you can distinguish later.
      const signalDocId = `${windowId}__sector__${sectorDocId}`;
      const signalRef = db.collection("flow_signals").doc(signalDocId);

      writes.push(
        signalRef.set(
          {
            windowId,
            type: "sector",
            ticker: sector.toUpperCase().replace(/\s+/g, "_"),
            sector,
            signal: buildSignalLine(currS, deltaPct),
            count: Math.round(currS.totalSpend), // keeps numeric like your feed
            date: w0.endISO,

            // credibility metadata for Verified badge
            users: currS.users,
            events: currS.events,
            maxUserShare: currS.maxUserShare,
            top3Share: currS.top3Share,
            deltaPct,

            eligibility,
            updatedAt: now
          },
          { merge: true }
        )
      );
    }

    // Batch write (Promise.all is fine here; you can chunk if huge)
    await Promise.all(writes);

    return json(200, {
      ok: true,
      windowId,
      window: w0,
      cohortUsers: curr.uniqueUsers,
      wrote: writes.length
    });
  } catch (e) {
    console.error("rebuild-flow-window error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};
