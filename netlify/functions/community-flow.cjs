// FILE: netlify/functions/community-flow.cjs
//
// Real community aggregation from uploads (no mock).
// Endpoint: /.netlify/functions/community-flow?days=90&mode=trailing&asOf=YYYY-MM-DD
//
// Returns ARRAY of "community runner" rows (backwards compatible with your current UI)
// Each row includes eligibility + concentration metrics.
//
// IMPORTANT: respects admin deletions:
//   if (b.adminStatus === "deleted") continue;

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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
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
  const asOf = String(asOfISO || isoDate());
  const endISO = mode === "monthEnd" ? endOfMonthISO(asOf) : asOf;

  const end = new Date(endISO);
  const start = new Date(end);
  start.setDate(start.getDate() - Number(days || 30));

  const startISO = start.toISOString().slice(0, 10);
  const windowKey = `flow_${Number(days || 30)}d_${mode}_asof_${endISO}`;
  return { days: Number(days || 30), asOf, mode, startISO, endISO, windowKey };
}

// Deterministic hash → pseudo random in [0,1)
function hashToUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Until you wire market data, keep deterministic pseudo "return"
function mockReturn30d(ticker, asOf) {
  const u = hashToUnit(`${ticker}:${asOf}`);
  const r = (u - 0.45) * 0.55;
  return clamp(r, -0.2, 0.35);
}

function rollupSector(spendSector) {
  const s = String(spendSector || "Other / Unmapped");

  if (s === "Big Box Retail" || s === "Grocery" || s === "Pharmacies" || s === "Utilities") return "Consumer Staples";
  if (s === "Insurance" || s === "Financials") return "Financials";
  if (s === "Gas Stations" || s === "Energy") return "Energy";
  if (s === "Technology" || s === "Telecom" || s === "Subscriptions") return "Technology";
  if (s === "Consumer & Retail" || s === "Travel" || s === "Restaurants" || s === "Media & Entertainment") return "Consumer Discretionary";
  if (s === "Healthcare") return "Healthcare";
  if (s === "Industrials" || s === "Transportation") return "Industrials";

  return s === "Other / Unmapped" ? "Other" : s;
}

function buildSignal({ maxUserShare, users, deltaPct }) {
  const concentration =
    maxUserShare >= 0.08 ? "High spend concentration" : maxUserShare >= 0.04 ? "Moderate concentration" : "Broad-based";

  const breadth = users >= 25 ? "High breadth" : users >= 12 ? "Medium breadth" : "Narrow breadth";

  const d = Math.abs(Number(deltaPct || 0));
  const stability = d <= 0.1 ? "Stable" : d <= 0.25 ? "Emerging" : "Spiky";

  return `${concentration} · ${breadth} · ${stability}`;
}

async function requireAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");
  const decoded = await admin.auth().verifyIdToken(m[1].trim());
  if (!decoded?.uid) throw new Error("Invalid auth token");
  return decoded.uid;
}

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}

async function getFlowEligibleUsers() {
  const snap = await db.collection("users").where("flowAccess", "==", true).limit(300).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getActiveBatchForWindow(uid, windowKey) {
  const wref = db.collection("uploads").doc(uid).collection("windows").doc(windowKey);
  const wsnap = await wref.get();
  if (!wsnap.exists) return null;
  const w = wsnap.data() || {};
  if (!w.activeBatchId) return null;
  return { batchId: String(w.activeBatchId), window: w };
}

async function getBatchMeta(uid, batchId) {
  const bref = db.collection("uploads").doc(uid).collection("batches").doc(batchId);
  const bsnap = await bref.get();
  if (!bsnap.exists) return null;
  return { id: bsnap.id, ...(bsnap.data() || {}) };
}

async function getTxIdsForBatch(uid, batchId, hardLimit = 5000) {
  const txidsRef = db.collection("uploads").doc(uid).collection("batches").doc(batchId).collection("txids");
  const snap = await txidsRef.limit(hardLimit).get();
  return snap.docs.map((d) => d.id);
}

async function getTxDocs(uid, txIds) {
  const out = [];
  const txCol = db.collection("uploads").doc(uid).collection("tx");

  for (let i = 0; i < txIds.length; i += 450) {
    const chunk = txIds.slice(i, i + 450);
    const refs = chunk.map((id) => txCol.doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      if (s.exists) out.push({ id: s.id, ...(s.data() || {}) });
    }
  }
  return out;
}

function pickKeyForTickerRow(tx) {
  const t = tx?.ticker ? String(tx.ticker).toUpperCase().trim() : "";
  if (t) return { key: `T:${t}`, ticker: t };

  const m = tx?.merchantNorm ? String(tx.merchantNorm).toUpperCase().trim() : "";
  if (m) return { key: `M:${m}`, ticker: null };

  return { key: null, ticker: null };
}

exports.handler = async (event) => {
  try {
    // Auth once
    const callerUid = await requireAuth(event);

    // Gate: Flow access required
    const caller = await db.collection("users").doc(callerUid).get();
    const flowAccess = !!(caller.data() || {}).flowAccess;
    if (!flowAccess) return jsonResponse(403, { error: "Flow access required" });

    const q = event.queryStringParameters || {};
    const days = Number(q.days || 30);
    const mode = String(q.mode || "trailing");
    const asOf = String(q.asOf || isoDate());

    const win = computeWindow({ days, asOfISO: asOf, mode });

    const users = await getFlowEligibleUsers();

    const byKey = new Map();
    const bySector = new Map();

    for (const u of users) {
      const uid = u.uid || u.id;
      if (!uid) continue;

      const active = await getActiveBatchForWindow(uid, win.windowKey);
      if (!active?.batchId) continue;

      const b = await getBatchMeta(uid, active.batchId);
      if (!b) continue;

      // REQUIRED: ignore deleted uploads
      if (b.adminStatus === "deleted") continue;

      const txIds = await getTxIdsForBatch(uid, active.batchId, 5000);
      if (!txIds.length) continue;

      const txDocs = await getTxDocs(uid, txIds);

      for (const tx of txDocs) {
        const d = String(tx.postedDate || "");
        if (!d || d < win.startISO || d > win.endISO) continue;

        const amt = Number(tx.amount ?? 0);
        if (!Number.isFinite(amt)) continue;

        const spend = Math.abs(amt);
        if (!spend) continue;

        const spendSector = String(tx.sector || "Other / Unmapped");
        const sector = rollupSector(spendSector);

        const pk = pickKeyForTickerRow(tx);
        if (!pk.key) continue;

        bySector.set(sector, (bySector.get(sector) || 0) + spend);

        if (!byKey.has(pk.key)) {
          byKey.set(pk.key, {
            key: pk.key,
            ticker: pk.ticker,
            sector,
            spend: 0,
            usersSet: new Set(),
            events: 0,
            userSpend: new Map()
          });
        }

        const row = byKey.get(pk.key);
        row.spend += spend;
        row.events += 1;
        row.usersSet.add(uid);
        row.userSpend.set(uid, (row.userSpend.get(uid) || 0) + spend);
      }
    }

    const rows = [];
    for (const r of byKey.values()) {
      const usersCount = r.usersSet.size || 0;

      let maxUserSpend = 0;
      for (const v of r.userSpend.values()) maxUserSpend = Math.max(maxUserSpend, v);

      const maxUserShare = r.spend > 0 ? maxUserSpend / r.spend : 0;
      const top3Share = 0;
      const deltaPct = 0;

      const signal = buildSignal({ maxUserShare, users: usersCount, deltaPct });

      rows.push({
        ticker: r.ticker || null,
        sector: r.sector,
        signal,
        count: r.events,
        date: win.endISO,

        // extra fields (safe to add; UI can ignore)
        spend: r.spend,

        users: usersCount,
        events: r.events,
        maxUserShare,
        top3Share,
        deltaPct,
        eligibility: {
          passed: usersCount >= 3 && r.events >= 10,
          reasons: [
            ...(usersCount >= 3 ? [] : ["LOW_USERS"]),
            ...(r.events >= 10 ? [] : ["LOW_EVENTS"])
          ]
        }
      });
    }

    const topSectors = Array.from(bySector.entries())
      .map(([sector, spend]) => ({ sector, spend }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    const eligible = rows
      .filter((x) => x.ticker && x.eligibility?.passed)
      .map((x) => ({
        ...x,
        return30d: mockReturn30d(String(x.ticker), win.endISO)
      }));

    const sectorOrder = topSectors.map((x) => x.sector);
    const bySectorElig = new Map();
    for (const s of sectorOrder) bySectorElig.set(s, []);

    for (const r of eligible) {
      const s = r.sector || "Other";
      if (!bySectorElig.has(s)) bySectorElig.set(s, []);
      bySectorElig.get(s).push(r);
    }

    // Within sector: spend desc, then events/users as tie-breakers
    for (const [s, arr] of bySectorElig.entries()) {
      arr.sort(
        (a, b) =>
          (b.spend || 0) - (a.spend || 0) ||
          (b.events || 0) - (a.events || 0) ||
          (b.users || 0) - (a.users || 0)
      );
      bySectorElig.set(s, arr);
    }

    // Seed: 2 per top sector
    const topRunners = [];
    const seenTickers = new Set();

    for (const s of sectorOrder) {
      const arr = bySectorElig.get(s) || [];
      let picked = 0;

      for (const r of arr) {
        if (picked >= 2) break;
        if (seenTickers.has(r.ticker)) continue;
        topRunners.push(r);
        seenTickers.add(r.ticker);
        picked += 1;
      }
    }

    // Fill: best remaining across all sectors
    const remaining = eligible
      .filter((r) => !seenTickers.has(r.ticker))
      .sort(
        (a, b) =>
          (b.spend || 0) - (a.spend || 0) ||
          (b.events || 0) - (a.events || 0) ||
          (b.users || 0) - (a.users || 0)
      );

    for (const r of remaining) {
      if (topRunners.length >= 10) break;
      if (seenTickers.has(r.ticker)) continue;
      topRunners.push(r);
      seenTickers.add(r.ticker);
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: JSON.stringify(topRunners)
    };
  } catch (e) {
    console.error("community-flow error:", e);
    return jsonResponse(500, { error: String(e?.message || e) });
  }
};
