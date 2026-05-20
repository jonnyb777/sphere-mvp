// FILE: netlify/functions/rebuild-flow-window.cjs
//
// CommonJS (Netlify-safe)
// Admin-only endpoint to rebuild Flow aggregates/signals for a given window.
//
// IMPORTANT: Your stated intent:
// - Flow includes ALL tx across the database in the window (no flowAccess gating).
// - Still respects admin deletions: if a batch is deleted, its tx do not count.
//
// How deletions are respected (P0):
// - ingest writes tx docs containing { uid, batchId, windowKey }.
// - rebuild queries collectionGroup("tx") by postedDate, then checks originating
//   batch status with a small concurrency limit + caching.
//
// Output:
// - flow_agg/{windowId} window summary
// - flow_agg/{windowId}/sectors/{sectorId} sector breakdown
// - flow_signals/{windowId}__sector__{sectorId} items for the UI
//

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
const FLOW_LIMITS = require("../shared/flowLimits.json");

/**
 * Defensible defaults (tune later).
 */
const LIMITS = {
  // Sector eligibility (Verified) — mapped to shared thresholds
  MIN_SECTOR_USERS: FLOW_LIMITS.MIN_CONTRIBUTORS,
  MIN_SECTOR_EVENTS: FLOW_LIMITS.MIN_EVENTS,
  MAX_SECTOR_MAX_USER_SHARE: FLOW_LIMITS.MAX_USER_SHARE,
  MAX_SECTOR_TOP3_SHARE: FLOW_LIMITS.MAX_TOP3_SHARE,

  // Window-level credibility
  MIN_WINDOW_USERS: FLOW_LIMITS.MIN_WINDOW_USERS,

  // Safety caps
  MAX_TX_DOCS_PER_WINDOW: FLOW_LIMITS.MAX_TX_DOCS_PER_WINDOW,
  BATCH_STATUS_CONCURRENCY: FLOW_LIMITS.BATCH_STATUS_CONCURRENCY
};

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

  const startISO = start.toISOString().slice(0, 10);
  const windowId = `flow_${Number(days || 30)}d_${mode}_asof_${endISO}`;

  return { days: Number(days || 30), mode: String(mode || "trailing"), asOf, startISO, endISO, windowId };
}

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

function safeIdSegment(s) {
  return String(s || "")
    .trim()
    .replace(/[^A-Za-z0-9_ -]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function buildSignalLine({ maxUserShare, users }, deltaPct) {
  const concentration =
    maxUserShare >= 0.12 ? "High spend concentration" : maxUserShare >= 0.08 ? "Moderate concentration" : "Broad-based";

  const breadth = users >= 80 ? "High breadth" : users >= 40 ? "Medium breadth" : "Narrow breadth";

  const stability = Math.abs(deltaPct) < 0.20 ? "Stable" : Math.abs(deltaPct) < 0.40 ? "Emerging" : "Spiky";

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

// Admin auth: requires admins/{uid} exists
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

// Simple concurrency limiter
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }

  const workers = [];
  const n = Math.max(1, Math.min(limit || 1, items.length || 1));
  for (let k = 0; k < n; k++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// Load tx docs for the window (global)
async function loadTxDocsForWindow({ startISO, endISO }) {
  const snap = await db
    .collectionGroup("tx")
    .where("postedDate", ">=", startISO)
    .where("postedDate", "<=", endISO)
    .get();

  if (snap.size > LIMITS.MAX_TX_DOCS_PER_WINDOW) {
    throw new Error(`Window too large (${snap.size}). Raise MAX_TX_DOCS_PER_WINDOW or narrow the window.`);
  }

  const rows = [];
  snap.forEach((d) => rows.push(d.data() || {}));
  return rows;
}

// Batch eligibility cache: uid__batchId -> full batch metadata
function isFlowEligibleBatch(batch) {
  if (!batch) return false;

  if (batch.adminStatus === "deleted") return false;
  if (batch.excludeFromFlow === true) return false;
  if (batch.isTest === true) return false;
  if (batch?.quality?.flagged === true) return false;
  if (batch?.activation?.activated !== true) return false;

  return true;
}

async function fetchBatchMeta(uid, batchId) {
  if (!uid || !batchId) return null;

  const ref = db
    .collection("uploads")
    .doc(uid)
    .collection("batches")
    .doc(batchId);

  const snap = await ref.get();

  if (!snap.exists) return null;

  return snap.data() || null;
}

// Aggregate spend by sector, excluding deleted batches, and counting only spend (amount < 0)
async function aggregateSectorsGlobal(rows) {
  // sector -> { totalSpend, events, userTotals: Map<uid, spend> }
  const buckets = new Map();
  const cohortUsers = new Set();

  // Build unique batch keys for status lookups
  const batchKeys = [];
  const seenBatchKey = new Set();

  for (const r of rows) {
    const uid = String(r.uid || "").trim();
    const batchId = String(r.batchId || "").trim();
    if (!uid || !batchId) continue;

    const k = `${uid}__${batchId}`;
    if (!seenBatchKey.has(k)) {
      seenBatchKey.add(k);
      batchKeys.push({ k, uid, batchId });
    }
  }

  // Fetch batch statuses with concurrency + caching
  const statusByKey = new Map();
  await mapLimit(batchKeys, LIMITS.BATCH_STATUS_CONCURRENCY, async (b) => {
    const meta = await fetchBatchMeta(b.uid, b.batchId);
statusByKey.set(b.k, meta);
    return null;
  });

  // Aggregate
  for (const r of rows) {
    const uid = String(r.uid || "").trim();
    if (!uid) continue;

    const batchId = String(r.batchId || "").trim();
    const k = uid && batchId ? `${uid}__${batchId}` : null;

    // Respect deletions
    if (k) {
      const meta = statusByKey.get(k);
if (!isFlowEligibleBatch(meta)) continue;
    }

    // Only include spend (amount < 0)
    const amt = Number(r.amount);
    if (!Number.isFinite(amt)) continue;
    if (amt >= 0) continue;

    const spend = Math.abs(amt);
    if (!spend) continue;

    cohortUsers.add(uid);

    const sector = String(r.sector || "Other / Unmapped");
    if (!sector || sector === "Other / Unmapped") continue;

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
  const sectors = new Map();
  for (const [sector, b] of buckets.entries()) {
    const totals = Array.from(b.userTotals.values()).sort((a, c) => c - a);
    const users = totals.length;
    const totalSpend = b.totalSpend || 0;

    const maxUserShare = users && totalSpend ? totals[0] / totalSpend : 0;
    const top3Share = users && totalSpend ? totals.slice(0, 3).reduce((s, x) => s + x, 0) / totalSpend : 0;

    sectors.set(sector, {
      sector,
      totalSpend,
      events: b.events,
      users,
      maxUserShare,
      top3Share
    });
  }

  return { sectors, uniqueUsers: cohortUsers.size };
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

    // Load tx (global) for both windows
    const [currRows, prevRows] = await Promise.all([loadTxDocsForWindow(w0), loadTxDocsForWindow(w1)]);

    // Aggregate (global, respects deletions, spend-only)
    const curr = await aggregateSectorsGlobal(currRows);
    const prev = await aggregateSectorsGlobal(prevRows);

    const windowId = w0.windowId;
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

    // Write sector docs + flow_signals
    const writes = [];

    // Precompute total spend (so we don't recompute inside the loop)
    const totalSpendAll = Array.from(curr.sectors.values()).reduce((s, x) => s + (x.totalSpend || 0), 0) || 0;

    for (const [sector, currS] of curr.sectors.entries()) {
      const prevS = prev.sectors.get(sector) || {
        totalSpend: 0,
        events: 0,
        users: 0,
        maxUserShare: 0,
        top3Share: 0
      };

      const deltaPct =
        prevS.totalSpend > 0 ? (currS.totalSpend - prevS.totalSpend) / prevS.totalSpend : currS.totalSpend > 0 ? 1 : 0;

      const eligibility = eligibilitySector(currS, windowCredible);

      const sectorDocId = safeIdSegment(sector);
      const sectorRef = db.collection("flow_agg").doc(windowId).collection("sectors").doc(sectorDocId);

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

      const signalDocId = `${windowId}__sector__${sectorDocId}`;
      const signalRef = db.collection("flow_signals").doc(signalDocId);

      writes.push(
        signalRef.set(
          {
            windowId,
            type: "sector",
            ticker: sector.toUpperCase().replace(/\s+/g, "_"), // kept for compatibility
            sector,
            signal: buildSignalLine(currS, deltaPct),
            count: Math.round(currS.totalSpend), // numeric for UI
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
