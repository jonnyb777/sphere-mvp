// FILE: netlify/functions/ingest-upload.cjs
const admin = require("firebase-admin");
const crypto = require("crypto");

function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  const svc = JSON.parse(raw);

  // Netlify commonly stores private_key newlines as escaped "\n"
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
const inc = (n) => admin.firestore.FieldValue.increment(n);
const arrayUnion = (...items) => admin.firestore.FieldValue.arrayUnion(...items);

// -------------------------
// Defensible thresholds
// -------------------------
const THRESH = {
  MIN_UNIQUE_TX: 10,
  MIN_DATE_PARSE: 0.85,
  MIN_AMOUNT_PARSE: 0.98,
  MIN_MERCHANT_PARSE: 0.9,

  MIN_COVERAGE_DAYS_RATIO: 0.6,
  MIN_COVERAGE_DAYS_ABS_30D: 18,
  MAX_DUP_ROW_RATE_SOFT: 0.35,
  MAX_REFUND_RATE_SOFT: 0.25,

  MIN_JACCARD_TO_REPLACE: 0.7,
  MAX_SPEND_DELTA_TO_REPLACE: 0.4,
  MAX_ACTIVATION_ATTEMPTS_24H: 2
};

// -------------------------
// Merchant classification (server-side)
// -------------------------
function normalizeMerchantName(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s&'+\-./]/g, "")
    .trim();
}

const MERCHANT_RULES = [
  { re: /\bwendy'?s\b|\bwendys\b/i, sector: "Restaurants", ticker: "WEN" },
  { re: /\bmcdonald'?s\b|\bmcdonalds\b|\bmcd\b/i, sector: "Restaurants", ticker: "MCD" },
  { re: /\bstarbucks\b|\bsbux\b/i, sector: "Restaurants", ticker: "SBUX" },
  { re: /\bchipotle\b|\bcmg\b/i, sector: "Restaurants", ticker: "CMG" },
  { re: /\bdomino'?s\b|\bdominos\b|\bdpz\b/i, sector: "Restaurants", ticker: "DPZ" },
  { re: /\byum\b|\byum brands\b|\btaco bell\b|\bkfc\b|\bpizza hut\b/i, sector: "Restaurants", ticker: "YUM" },

  { re: /\btrader joe'?s\b|\btrader joes\b/i, sector: "Grocery", ticker: null },
  { re: /\bwhole foods\b|\bwholefoods\b/i, sector: "Grocery", ticker: "AMZN" },
  { re: /\bkroger\b|\bfred meyer\b|\bralphs\b|\bharris teeter\b/i, sector: "Grocery", ticker: "KR" },
  { re: /\balbertsons\b|\bsafeway\b|\bvons\b|\bpavilions\b|\bacme\b/i, sector: "Grocery", ticker: "ACI" },
  { re: /\binstacart\b/i, sector: "Grocery", ticker: null },

  { re: /\bwalmart\b|\bwal-mart\b/i, sector: "Big Box Retail", ticker: "WMT" },
  { re: /\btarget\b/i, sector: "Big Box Retail", ticker: "TGT" },
  { re: /\bcostco\b/i, sector: "Big Box Retail", ticker: "COST" },
  { re: /\bsams club\b|\bsam's club\b/i, sector: "Big Box Retail", ticker: "WMT" },

  { re: /\bchevron\b/i, sector: "Gas Stations", ticker: "CVX" },
  { re: /\bexxon\b|\bexxonmobil\b|\bmobil\b/i, sector: "Gas Stations", ticker: "XOM" },
  { re: /\bshell\b/i, sector: "Gas Stations", ticker: null },

  { re: /\bcvs\b|\bcvs pharmacy\b|\bcvs health\b/i, sector: "Pharmacies", ticker: "CVS" },
  { re: /\bwalgreens\b|\bwalgreen\b|\bduane reade\b/i, sector: "Pharmacies", ticker: "WBA" },

  { re: /\bpg&e\b|\bpge\b|\bpacific gas\b/i, sector: "Utilities", ticker: null },
  { re: /\bedison\b|\bsce\b|\bsouthern california edison\b/i, sector: "Utilities", ticker: null },
  { re: /\bcon ed\b|\bconed\b|\bcon edison\b/i, sector: "Utilities", ticker: null },

  { re: /\ballstate\b/i, sector: "Insurance", ticker: "ALL" },
  { re: /\bprogressive\b/i, sector: "Insurance", ticker: "PGR" },
  { re: /\blemonade\b/i, sector: "Insurance", ticker: "LMND" },

  { re: /\bverizon\b|\bvzw\b/i, sector: "Telecom", ticker: "VZ" },
  { re: /\bat&t\b|\batt\b/i, sector: "Telecom", ticker: "T" },
  { re: /\bt-mobile\b|\btmobile\b/i, sector: "Telecom", ticker: "TMUS" },
  { re: /\bcomcast\b|\bxfinity\b/i, sector: "Telecom", ticker: "CMCSA" },

  { re: /\bnetflix\b/i, sector: "Subscriptions", ticker: "NFLX" },
  { re: /\bspotify\b/i, sector: "Subscriptions", ticker: "SPOT" },
  { re: /\bhulu\b|\bdisney\+?\b|\bdisney plus\b/i, sector: "Subscriptions", ticker: "DIS" },
  { re: /\bamazon prime\b|\bprime video\b/i, sector: "Subscriptions", ticker: "AMZN" },

  { re: /\buber\b|\buber\*trip\b|\buber trip\b/i, sector: "Transportation", ticker: "UBER" },
  { re: /\blyft\b/i, sector: "Transportation", ticker: "LYFT" },

  { re: /\bairbnb\b/i, sector: "Travel", ticker: "ABNB" },
  { re: /\bbooking\.com\b|\bbookingcom\b|\bpriceline\b/i, sector: "Travel", ticker: "BKNG" },
  { re: /\bexpedia\b/i, sector: "Travel", ticker: "EXPE" },

  { re: /\bapple\b|\bapple\.com\/bill\b|\bicloud\b|\bapp store\b/i, sector: "Technology", ticker: "AAPL" },
  { re: /\bmicrosoft\b|\bmsft\b|\bxbox\b/i, sector: "Technology", ticker: "MSFT" },
  { re: /\bgoogle\b|\balphabet\b|\bgoogl\b|\bgoogle play\b/i, sector: "Technology", ticker: "GOOGL" },
  { re: /\bmeta\b|\bfacebook\b|\binstagram\b/i, sector: "Technology", ticker: "META" },

  { re: /\bamazon\b|\bamzn\b/i, sector: "Consumer & Retail", ticker: "AMZN" }
];

function keywordHeuristics(normalized) {
  const m = String(normalized || "");

  if (/\bpharmacy\b|\bdrugstore\b|\bprescription\b|\brx\b/.test(m)) return { sector: "Pharmacies" };
  if (/\bclinic\b|\burgen(t)? care\b|\bhospital\b|\bhealth\b|\bdent(al|ist)\b/.test(m)) return { sector: "Healthcare" };

  if (/\bgrocery\b|\bsupermarket\b|\bproduce\b|\bbutcher\b/.test(m)) return { sector: "Grocery" };
  if (/\bgas\b|\bgasoline\b|\bfuel\b|\bdiesel\b|\bpump\b/.test(m)) return { sector: "Gas Stations" };
  if (/\butility\b|\belectric\b|\bpower\b|\bwater\b|\bsewer\b|\btrash\b|\brefuse\b/.test(m)) return { sector: "Utilities" };
  if (/\bwireless\b|\bcell(ular)?\b|\bmobile plan\b|\bbroadband\b|\bcable\b|\binternet\b/.test(m)) return { sector: "Telecom" };

  if (/\binsurance\b|\binsur\b|\bpolicy\b|\bpremium\b|\bins\b|\bprem\b|\bcas\b/.test(m)) return { sector: "Insurance" };
  if (/\bsubscription\b|\brecurring\b|\bmember(ship)?\b/.test(m)) return { sector: "Subscriptions" };

  if (/\bhotel\b|\bflight\b|\bairline\b|\bcar rental\b|\bresort\b|\bbooking\b|\bexpedia\b/.test(m)) return { sector: "Travel" };
  if (/\brestaurant\b|\bcafe\b|\bcoffee\b|\bpizza\b|\bburger\b|\bgrill\b/.test(m)) return { sector: "Restaurants" };
  if (/\btransit\b|\btrain\b|\bbus\b|\btoll\b|\bparking\b/.test(m)) return { sector: "Transportation" };

  return null;
}

function classifyMerchant(merchant = "") {
  const m = normalizeMerchantName(merchant);
  if (!m) return { sector: "Other / Unmapped", ticker: null, unmapped: true };

  for (const r of MERCHANT_RULES) {
    if (r.re.test(m)) {
      const sector = r.sector || "Other / Unmapped";
      return {
        sector,
        ticker: r.ticker || null,
        unmapped: sector === "Other / Unmapped"
      };
    }
  }

  const h = keywordHeuristics(m);
  if (h?.sector) {
    return {
      sector: h.sector,
      ticker: null,
      unmapped: h.sector === "Other / Unmapped"
    };
  }

  return { sector: "Other / Unmapped", ticker: null, unmapped: true };
}

function formatSectorLabel(sector = "") {
  const s = String(sector || "").trim();

  if (/restaurant/i.test(s)) return "Restaurants";
  if (/travel|transportation/i.test(s)) return "Travel";
  if (/health|fitness|pharm/i.test(s)) return "Health";
  if (/apparel|retail|consumer/i.test(s)) return "Retail";
  if (/technology|subscription|telecom/i.test(s)) return "Digital";
  if (/grocery|staples/i.test(s)) return "Essentials";
  if (/financial|insurance/i.test(s)) return "Financial protection";
  if (/energy|gas/i.test(s)) return "Energy";

  return s || "Other";
}

function buildAlignmentReport({
  topSectorsSnapshot = [],
  priorTopSectors = [],
  tickersSnapshot = [],
  totalSpend = 0,
  uniqueTxCount = 0
}) {
  const current = Array.isArray(topSectorsSnapshot) ? topSectorsSnapshot : [];
  const prior = Array.isArray(priorTopSectors) ? priorTopSectors : [];

  const currentMap = new Map(
    current.map((x) => [String(x.sector || ""), Number(x.amount || 0)])
  );

  const priorMap = new Map(
    prior.map((x) => [String(x.sector || ""), Number(x.amount || 0)])
  );

  const sectors = Array.from(
    new Set([...currentMap.keys(), ...priorMap.keys()].filter(Boolean))
  );

let moves = sectors
  .map((sector) => {
    const now = currentMap.get(sector) || 0;
    const before = priorMap.get(sector) || 0;
    const delta = now - before;

    return {
      sector,
      label: formatSectorLabel(sector),
      direction: delta >= 0 ? "up" : "down",
      delta,
      currentAmount: now,
      priorAmount: before
    };
  })
  .filter((x) => Math.abs(x.delta) > 0)
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

// If this is the same file or no prior movement is detected,
// still create a useful report from the strongest current categories.
if (!moves.length) {
  moves = current.slice(0, 4).map((x) => ({
    sector: x.sector,
    label: formatSectorLabel(x.sector),
    direction: "up",
    delta: Number(x.amount || 0),
    currentAmount: Number(x.amount || 0),
    priorAmount: 0,
    stable: true
  }));
}

const ups = moves.filter((x) => x.direction === "up").slice(0, 2);
const downs = moves.filter((x) => x.direction === "down").slice(0, 2);

  const topCurrent = current[0]?.sector || "your top category";
  const topCurrentLabel = formatSectorLabel(topCurrent);

  const primaryUp = ups[0]?.label || topCurrentLabel;
  const primaryDown = downs[0]?.label || "other categories";

const hasStableFallback = moves.some((x) => x.stable);

const interpretation = hasStableFallback
  ? `Consumers like you appear most connected to ${primaryUp.toLowerCase()} behavior in this snapshot. Future uploads will show whether that pattern is rising or fading.`
  : prior.length
  ? `Consumers like you appear to be prioritizing ${primaryUp.toLowerCase()} over ${primaryDown.toLowerCase()} in this snapshot.`
  : `Consumers like you currently appear most connected to ${topCurrentLabel.toLowerCase()} behavior. Future uploads will show whether that pattern is rising or fading.`;

  const companies = Array.from(
    new Set((Array.isArray(tickersSnapshot) ? tickersSnapshot : []).slice(0, 6))
  );

  return {
    version: 1,
    title: "Consumers Like You",
    periodLabel: prior.length ? "Compared with your previous upload" : "Current snapshot",
    moves: [
      ...ups.map((x) => ({
        direction: "up",
        label: x.label,
        sector: x.sector,
        delta: Number(x.delta.toFixed(2))
      })),
      ...downs.map((x) => ({
        direction: "down",
        label: x.label,
        sector: x.sector,
        delta: Number(x.delta.toFixed(2))
      }))
    ],
    interpretation,
    companies,
    disclaimer: "Informational only. Not investment advice.",
    proof: {
      totalSpend: Number(totalSpend || 0),
      uniqueTxCount: Number(uniqueTxCount || 0),
      sectorCount: current.length
    },
    shareText: `${prior.length ? "Consumers like me shifted" : "Consumers like me are showing"} toward ${primaryUp.toLowerCase()}.`
  };
}

// -------------------------
// Helpers
// -------------------------
function normalizeMerchant(name = "") {
  return String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toISODateAny(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;

  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function sha256Hex(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function endOfMonthISO(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function computeWindow({ days, asOfISO, mode }) {
  const asOf = String(asOfISO || new Date().toISOString().slice(0, 10));
  const endISO = mode === "monthEnd" ? endOfMonthISO(asOf) : asOf;

  const end = new Date(endISO);
  const start = new Date(end);
  start.setDate(start.getDate() - Number(days || 30));

  const startISO = start.toISOString().slice(0, 10);
  const windowKey = `flow_${Number(days || 30)}d_${mode}_asof_${endISO}`;

  return { days: Number(days || 30), asOf, mode, startISO, endISO, windowKey };
}

function safeDiv(a, b) {
  return b ? a / b : 0;
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const uni = setA.size + setB.size - inter;
  return uni ? inter / uni : 0;
}

async function requireAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");

  const token = m[1].trim();
  const decoded = await admin.auth().verifyIdToken(token);
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

async function readTxIdSetForBatch(uid, batchId) {
  const snap = await db
    .collection("uploads")
    .doc(uid)
    .collection("batches")
    .doc(batchId)
    .collection("txids")
    .get();

  const set = new Set();
  snap.forEach((d) => set.add(d.id));
  return set;
}

async function getOrInitWindowDoc(uid, windowKey, windowMeta) {
  const ref = db.collection("uploads").doc(uid).collection("windows").doc(windowKey);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set(
      {
        ...windowMeta,
        activeBatchId: null,
        activeSetHash: null,
        activeStats: null,
        activationAttempts24h: 0,
        lastAttemptAt: null,
        createdAt: nowTS(),
        updatedAt: nowTS()
      },
      { merge: true }
    );
  }
  return ref;
}

function isWithinLast24h(ts) {
  if (!ts) return false;
  const dt = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(dt.getTime())) return false;
  return Date.now() - dt.getTime() <= 24 * 60 * 60 * 1000;
}

// -------------------------
// Main
// -------------------------
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    const uid = await requireAuth(event);
    const body = JSON.parse(event.body || "{}");

    const source = String(body.source || "upload");
    const filename = String(body.filename || "");
    const rows = Array.isArray(body.rows) ? body.rows : [];

    const days = Number(body.days || 30);
    const asOf = String(body.asOf || new Date().toISOString().slice(0, 10));
    const mode = String(body.mode || "trailing");

    if (!rows.length) return jsonResponse(400, { error: "No rows provided" });

    const windowMeta = computeWindow({ days, asOfISO: asOf, mode });
    // --- Stable batch id (idempotent) ---
// If the client supplies a batchId, trust it.
// Otherwise derive it from content so re-uploading the same file doesn't create a new "active" batch.
function computeBatchIdFromUpload({ uid, filename, source, windowKey, txSetHash }) {
  const f = String(filename || "").trim().toLowerCase();
  const s = String(source || "upload").trim().toLowerCase();
  const w = String(windowKey || "").trim();
  const h = String(txSetHash || "").trim();
  // include uid so different users don't collide; include windowKey so identical file used in different windows doesn't collide
  return sha256Hex(`${uid}|${s}|${f}|${w}|${h}`);
}

let batchId = String(body.batchId || "").trim();
if (!batchId) {
  // txSetHash is computed later, so temporarily set a placeholder; we'll finalize after txSetHash is computed.
  batchId = ""; 
}

    // Tracking
    const seenExact = new Set();
    const coverageDays = new Set();
    let dateOk = 0;
    let amountOk = 0;
    let merchantOk = 0;

    const totalRows = rows.length;
    let parsedRows = 0;
    let exactDupes = 0;

    let spendTotal = 0;
    let incomeTotal = 0;
    let refundCount = 0;

    const txIdsForBatch = [];

    // Unmapped tracking
    const unmappedCounts = new Map(); // merchantNorm -> count
    const unmappedSamples = new Map(); // merchantNorm -> sample raw (best effort)
    const inferredTickers = new Set();

    function extractFields(r) {
      const merchantRaw =
        r.merchant ?? r.Merchant ?? r.name ?? r.Name ?? r.description ?? r.Description ?? r.payee ?? r.Payee ?? "";

      const amountRaw = r.amount ?? r.Amount ?? r.value ?? r.Value ?? r.amt ?? r.Amt ?? r.debit ?? r.Debit ?? 0;

      const dateRaw =
        r.date ??
        r.Date ??
        r.posted ??
        r.Posted ??
        r.posted_at ??
        r.PostedAt ??
        r.transactionDate ??
        r.TransactionDate ??
        "";

      const merchantNorm = normalizeMerchant(merchantRaw);
      const dateISO = toISODateAny(dateRaw);

      const amt = Number(typeof amountRaw === "string" ? amountRaw.replace(/[$,]/g, "").trim() : amountRaw);
      const amountCents = Number.isFinite(amt) ? Math.round(amt * 100) : null;

      const cls = classifyMerchant(String(merchantRaw || ""));
      const sector = cls?.sector || "Other / Unmapped";
      const ticker = cls?.ticker ? String(cls.ticker).toUpperCase().trim() : null;

      // IMPORTANT: treat explicit "unmapped" as unmapped too
      const sectorUnmapped = !!cls?.unmapped || sector === "Other / Unmapped";

      return {
        merchantRaw: String(merchantRaw || "").trim(),
        merchantNorm,
        dateISO,
        amt,
        amountCents,
        description: String(r.description || r.Description || r.memo || r.Memo || "").trim(),
        sector,
        ticker,
        sectorUnmapped
      };
    }

    // Parse
    const parsed = [];
    for (const r of rows) {
      const x = extractFields(r);

      if (x.dateISO) {
        dateOk += 1;
        coverageDays.add(x.dateISO);
      }
      if (x.merchantNorm) merchantOk += 1;
      if (Number.isFinite(x.amt)) amountOk += 1;
      if (x.ticker) {
  inferredTickers.add(String(x.ticker).toUpperCase().trim());
}

      if (!x.dateISO || !x.merchantNorm || !Number.isFinite(x.amt) || x.amountCents === null) continue;

      parsedRows += 1;

      const txId = sha256Hex(`${x.dateISO}|${x.merchantNorm}|${x.amountCents}`);

      if (seenExact.has(txId)) {
        exactDupes += 1;
        continue;
      }
      seenExact.add(txId);

      const amtAbs = Math.abs(x.amt);
      // IMPORTANT: spend should be NEGATIVE; refunds/income should be POSITIVE
      if (x.amt < 0) spendTotal += amtAbs;
      if (x.amt > 0) {
        incomeTotal += amtAbs;
        refundCount += 1;
      }

      if (x.sectorUnmapped) {
        const mn = x.merchantNorm;
        unmappedCounts.set(mn, (unmappedCounts.get(mn) || 0) + 1);

        // keep one sample per norm, cap at 30 samples stored in batchStats
        if (!unmappedSamples.has(mn) && unmappedSamples.size < 30) {
          unmappedSamples.set(mn, x.merchantRaw || null);
        }
      }

      parsed.push({ ...x, txId });
      txIdsForBatch.push(txId);
    }

    // Stats / Quality
    const uniqueTxCount = seenExact.size;
    const dupRowRate = safeDiv(exactDupes, totalRows);
    const dateParseRate = safeDiv(dateOk, totalRows);
    const merchantParseRate = safeDiv(merchantOk, totalRows);
    const amountParseRate = safeDiv(amountOk, totalRows);
    const coverageDaysCount = coverageDays.size;

    const refundRate = uniqueTxCount ? refundCount / uniqueTxCount : 0;

    const hardFail =
      uniqueTxCount < THRESH.MIN_UNIQUE_TX ||
      dateParseRate < THRESH.MIN_DATE_PARSE ||
      amountParseRate < THRESH.MIN_AMOUNT_PARSE ||
      merchantParseRate < THRESH.MIN_MERCHANT_PARSE;

    const minCoverageDays =
      windowMeta.days === 30
        ? THRESH.MIN_COVERAGE_DAYS_ABS_30D
        : Math.floor(windowMeta.days * THRESH.MIN_COVERAGE_DAYS_RATIO);

    const flagged =
      coverageDaysCount < minCoverageDays ||
      dupRowRate > THRESH.MAX_DUP_ROW_RATE_SOFT ||
      refundRate > THRESH.MAX_REFUND_RATE_SOFT;

      // Compute tx set hash now (needed for stable batchId)
const txSetHash = sha256Hex(txIdsForBatch.slice().sort().join("|"));

// Finalize stable batchId if client didn't provide one
if (!batchId) {
  batchId = computeBatchIdFromUpload({
    uid,
    filename,
    source,
    windowKey: windowMeta.windowKey,
    txSetHash
  });
}

    // Write tx + txids
    const txRoot = db.collection("uploads").doc(uid).collection("tx");
    const batchTxidsRef = db.collection("uploads").doc(uid).collection("batches").doc(batchId).collection("txids");

    const writeOps = [];
    for (const x of parsed) {
      writeOps.push({
        ref: txRoot.doc(x.txId),
        data: {
          uid,

          // Keep latest batchId for backward compatibility,
          // but also remember every batch this transaction appeared in.
          batchId,
          batchIds: arrayUnion(batchId),

          postedDate: x.dateISO,
          amount: x.amt,
          amountCents: x.amountCents,
          merchant: x.merchantRaw,
          merchantNorm: x.merchantNorm,
          description: x.description,
          source,
          sector: x.sector || "Other / Unmapped",
          ticker: x.ticker || null,
          sectorUnmapped: !!x.sectorUnmapped,
          lastSeenAt: nowTS()
        }
      });

      writeOps.push({
  ref: batchTxidsRef.doc(x.txId),
  data: { createdAt: nowTS(), updatedAt: nowTS() }
});
    }

    for (let i = 0; i < writeOps.length; i += 450) {
      const chunk = writeOps.slice(i, i + 450);
      const batch = db.batch();
      for (const op of chunk) batch.set(op.ref, op.data, { merge: true });
      await batch.commit();
    }

    const uploadTickers = Array.from(
  new Set(
    parsed
      .map((x) => String(x.ticker || "").toUpperCase().trim())
      .filter(Boolean)
  )
);

if (uploadTickers.length) {
  let tickerBatch = db.batch();
  let tickerOps = 0;

  for (const ticker of uploadTickers) {
    const ref = db.collection("market_ticker_queue").doc(ticker);

    tickerBatch.set(
      ref,
      {
        ticker,
        sources: admin.firestore.FieldValue.arrayUnion("upload"),
        lastSeenInUploadAt: nowTS(),
        updatedAt: nowTS()
      },
      { merge: true }
    );

    tickerOps += 1;

    if (tickerOps >= 450) {
      await tickerBatch.commit();
      tickerBatch = db.batch();
      tickerOps = 0;
    }
  }

  if (tickerOps > 0) await tickerBatch.commit();
}

    // Write per-merchant unmapped docs (REAL counts)
    if (unmappedCounts.size) {
      let batch = db.batch();
      let ops = 0;

      for (const [mn, c] of unmappedCounts.entries()) {
        const ref = db.collection("uploads").doc(uid).collection("unmapped_merchants").doc(mn);
        const sample = unmappedSamples.get(mn) || null;

        batch.set(
          ref,
          {
            merchantNorm: mn,
            sampleMerchant: sample,
            count: inc(c),
            lastSeenAt: nowTS()
          },
          { merge: true }
        );

        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    // Rollups for Admin UI
    const unmappedTopObj = {};
    Array.from(unmappedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .forEach(([mn, c]) => {
        unmappedTopObj[mn] = c;
      });

    const rollups = {
      unmappedCount: unmappedCounts.size,
      unmappedTop: unmappedTopObj
    };

    // Batch stats (keep backward compatible keys)
    const batchStats = {
      totalRows,
      parsedRows,
      uniqueTxCount,
      exactDupes,
      dupRowRate,
      dateParseRate,
      merchantParseRate,
      amountParseRate,
      coverageDays: coverageDaysCount,
      totalSpend: Number.isFinite(spendTotal) ? spendTotal : 0,
      totalIncome: Number.isFinite(incomeTotal) ? incomeTotal : 0,
      refundCount,
      refundRate,
      unmappedCount: unmappedCounts.size,
      unmappedSample: Array.from(unmappedSamples.entries())
        .slice(0, 30)
        .map(([merchantNorm, merchant]) => ({ merchant, merchantNorm }))
    };

    const windowRef = await getOrInitWindowDoc(uid, windowMeta.windowKey, {
      windowKey: windowMeta.windowKey,
      days: windowMeta.days,
      asOf: windowMeta.asOf,
      mode: windowMeta.mode,
      start: windowMeta.startISO,
      end: windowMeta.endISO
    });

    const windowSnap = await windowRef.get();
    const windowData = windowSnap.data() || {};
    const activeBatchId = windowData.activeBatchId || null;

    let attempts24h = Number(windowData.activationAttempts24h || 0);
    const lastAttemptAt = windowData.lastAttemptAt || null;
    if (!isWithinLast24h(lastAttemptAt)) attempts24h = 0;

    let decision = "processed";
    const reasons = [];

    if (hardFail) {
      decision = "rejected_for_activation";
      reasons.push("HARD_FAIL_PARSE_OR_TOO_SMALL");
    }
    if (flagged) {
      decision = "flagged";
      reasons.push("FLAGGED_QUALITY");
    }
    if (attempts24h >= THRESH.MAX_ACTIVATION_ATTEMPTS_24H) {
      decision = "queued";
      reasons.push("COOLDOWN_ACTIVE");
    }

    let jaccardOverlap = null;
    let totalSpendDeltaPct = null;
    let comparedToBatchId = activeBatchId;

    // Replacement checks (only if we *might* accept)
    if (activeBatchId && decision === "processed") {
      const newSet = new Set(txIdsForBatch);
      const oldSet = await readTxIdSetForBatch(uid, activeBatchId);

      jaccardOverlap = jaccard(newSet, oldSet);

      const oldSpend = Number(windowData?.activeStats?.totalSpend ?? 0);
      const newSpend = Number(batchStats.totalSpend ?? 0);
      totalSpendDeltaPct = oldSpend > 0 ? (newSpend - oldSpend) / oldSpend : newSpend > 0 ? 1 : 0;

      if (jaccardOverlap < THRESH.MIN_JACCARD_TO_REPLACE) {
        decision = "rejected_for_activation";
        reasons.push("LOW_OVERLAP");
      }
      if (Math.abs(totalSpendDeltaPct) > THRESH.MAX_SPEND_DELTA_TO_REPLACE) {
        decision = "rejected_for_activation";
        reasons.push("HIGH_SPEND_DELTA");
      }
      if (coverageDaysCount < minCoverageDays) {
        decision = "rejected_for_activation";
        reasons.push("LOW_COVERAGE");
      }
    }

    const shouldActivate = !activeBatchId && decision === "processed";
    const shouldReplace = !!activeBatchId && decision === "processed";

    let activated = false;

    if (shouldActivate || shouldReplace) {
  activated = true;
  decision = "accepted";

  // If uploads materially overlap, mark the older batch as superseded.
// Otherwise keep both uploads active so older date ranges can still
// contribute to trailing windows like 60d/90d.

if (shouldReplace && activeBatchId && activeBatchId !== batchId) {
  const prevBatchRef = db.collection("uploads").doc(uid).collection("batches").doc(activeBatchId);

  const prevSnap = await prevBatchRef.get();
  const prev = prevSnap.exists ? (prevSnap.data() || {}) : {};

  const prevStart = String(prev?.stats?.minDate || "");
  const prevEnd = String(prev?.stats?.maxDate || "");

  const nextStart = String(stats?.minDate || "");
  const nextEnd = String(stats?.maxDate || "");

  // overlap exists if date windows intersect
  const overlaps =
    prevStart &&
    prevEnd &&
    nextStart &&
    nextEnd &&
    !(nextEnd < prevStart || nextStart > prevEnd);

  // only supersede if uploads materially overlap
  if (overlaps) {
    await prevBatchRef.set(
      {
        adminStatus: "superseded",
        supersededBy: batchId,
        supersededAt: nowTS(),
        updatedAt: nowTS()
      },
      { merge: true }
    );
  }
}

  await windowRef.set(
    {
      activeBatchId: batchId,
      activeSetHash: txSetHash,
      activeStats: {
        uniqueTxCount,
        coverageDays: coverageDaysCount,
        totalSpend: batchStats.totalSpend
      },
      activationAttempts24h: attempts24h + 1,
      lastAttemptAt: nowTS(),
      updatedAt: nowTS()
    },
    { merge: true }
  );
} else {
      // still track attempts + time
      await windowRef.set(
        {
          activationAttempts24h: attempts24h + 1,
          lastAttemptAt: nowTS(),
          updatedAt: nowTS()
        },
        { merge: true }
      );
    }

    // Persist batch doc
    const batchRef = db.collection("uploads").doc(uid).collection("batches").doc(batchId);
    const existingBatchSnap = await batchRef.get();
    const isRepeatUpload = existingBatchSnap.exists;

    await batchRef.set(
      {
        uid,
        batchId,
        source,
        filename,
        createdAt: nowTS(),
        processedAt: nowTS(),

        // IMPORTANT:
        // downstream reads (Flow rebuild, Drip loaders) should treat adminStatus:"deleted" as excluded.
        adminStatus: activated ? "active" : "pending",

        window: {
          ...windowMeta,
          start: windowMeta.startISO,
          end: windowMeta.endISO
        },
        stats: batchStats,
        rollups,
        fingerprint: {
          txSetHash,
          sampleTxIds: txIdsForBatch.slice(0, 10)
        },
        quality: {
          hardFail,
          flagged,
          minCoverageDays
        },
        activation: {
          decision,
          activated,
          reasons,
          comparedToBatchId,
          jaccardOverlap,
          totalSpendDeltaPct
        }
      },
      { merge: true }
    );

    // Persist lightweight insight snapshot for future insight-card engine.
// Stores derived summaries only, not raw transactions.
const insightSnapshotRef = db
  .collection("users")
  .doc(uid)
  .collection("insight_snapshots")
  .doc(batchId);

const topMerchantsSnapshot = Array.from(
  parsed.reduce((map, x) => {
    const merchant = x.merchantRaw || x.merchantNorm || "Unknown";
    const spend = x.amt < 0 ? Math.abs(x.amt) : 0;
    if (!spend) return map;

    map.set(merchant, (map.get(merchant) || 0) + spend);
    return map;
  }, new Map())
)
  .map(([merchant, amount]) => ({ merchant, amount }))
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 10);

const topSectorsRaw = Array.from(
  parsed.reduce((map, x) => {
    const sector = x.sector || "Other / Unmapped";
    const spend = x.amt < 0 ? Math.abs(x.amt) : 0;
    if (!spend || sector === "Other / Unmapped") return map;

    map.set(sector, (map.get(sector) || 0) + spend);
    return map;
  }, new Map())
)
  .map(([sector, amount]) => ({ sector, amount }))
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 5);

const topSectorsTotal = topSectorsRaw.reduce(
  (sum, s) => sum + Number(s.amount || 0),
  0
);

let sectorRunningPct = 0;

const topSectorsSnapshot = topSectorsRaw.map((s, idx) => {
  const pct = topSectorsTotal
    ? (Number(s.amount || 0) / topSectorsTotal) * 100
    : 0;

  const pctRounded =
    idx === topSectorsRaw.length - 1
      ? Math.max(0, 100 - sectorRunningPct)
      : Number(pct.toFixed(1));

  sectorRunningPct += pctRounded;

  return {
    sector: s.sector,
    amount: Number(s.amount || 0),
    pct,
    pctRounded
  };
});

const tickersSnapshot = Array.from(
  new Set(parsed.map((x) => String(x.ticker || "").toUpperCase().trim()).filter(Boolean))
);

const priorSnapshotSnap = await db
  .collection("users")
  .doc(uid)
  .collection("insight_snapshots")
  .orderBy("createdAt", "desc")
  .limit(1)
  .get();

let priorTopSectors = [];

priorSnapshotSnap.forEach((doc) => {
  if (doc.id !== batchId) {
    const data = doc.data() || {};
    priorTopSectors = Array.isArray(data.topSectors) ? data.topSectors : [];
  }
});

const alignmentReport = buildAlignmentReport({
  topSectorsSnapshot,
  priorTopSectors,
  tickersSnapshot,
  totalSpend: batchStats.totalSpend,
  uniqueTxCount
});

await insightSnapshotRef.set(
  {
    uid,
    batchId,
    source,
    filename,
    createdAt: nowTS(),
    updatedAt: nowTS(),
    lastUploadedAt: nowTS(),

    timeframeDays: windowMeta.days,
    asOfDate: windowMeta.asOf,
    mode: windowMeta.mode,
    windowKey: windowMeta.windowKey,

    totalSpend: batchStats.totalSpend,
    uniqueTxCount,
coverageDays: coverageDaysCount,
behavioralStart: Array.from(coverageDays).sort()[0] || null,
behavioralAsOf: Array.from(coverageDays).sort().slice(-1)[0] || null,

topMerchants: topMerchantsSnapshot,
topSectors: topSectorsSnapshot,
priorTopSectors,

alignmentReport,

tickers: tickersSnapshot,

    duplicateRisk: {
      exactDupes,
      dupRowRate,
      jaccardOverlap,
      totalSpendDeltaPct,
      reasons
    },

    quality: {
      hardFail,
      flagged,
      minCoverageDays
    },

    cardStatus: "ready_for_generation"
  },
  { merge: true }
);

return jsonResponse(200, {
  ok: true,
  uid,
  batchId,
  windowKey: windowMeta.windowKey,
  decision,
  activated,
  reasons,
  stats: batchStats,

  insightSnapshot: {
    id: batchId,
    status: "ready_for_generation"
  },

  duplicateRisk: {
    possibleDuplicate:
  isRepeatUpload ||
  exactDupes > 0 ||
  dupRowRate > 0.15 ||
  reasons.includes("LOW_OVERLAP") ||
  reasons.includes("HIGH_SPEND_DELTA"),
    exactDupes,
    dupRowRate,
    jaccardOverlap,
    totalSpendDeltaPct,
    reasons
  }
});
  } catch (e) {
    console.error("ingest-upload error:", e);
    return jsonResponse(500, { error: String(e?.message || e) });
  }
};
