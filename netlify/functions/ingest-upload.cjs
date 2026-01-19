// FILE: netlify/functions/ingest-upload.js
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

// -------------------------
// Defensible thresholds
// -------------------------
const THRESH = {
  // hard reject (don’t activate; still store batch record but marked rejected)
  MIN_UNIQUE_TX: 10,
  MIN_DATE_PARSE: 0.85,
  MIN_AMOUNT_PARSE: 0.98,
  MIN_MERCHANT_PARSE: 0.90,

  // soft flag (store + can be overridden later, but won’t auto-activate)
  MIN_COVERAGE_DAYS_RATIO: 0.60, // 60% of days in window
  MIN_COVERAGE_DAYS_ABS_30D: 18,
  MAX_DUP_ROW_RATE_SOFT: 0.35,
  MAX_REFUND_RATE_SOFT: 0.25,

  // window replacement anti-manipulation
  MIN_JACCARD_TO_REPLACE: 0.70,
  MAX_SPEND_DELTA_TO_REPLACE: 0.40, // 40%
  MAX_ACTIVATION_ATTEMPTS_24H: 2
};

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

  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // YYYY-MM-DD
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

// ---- auth ----
async function requireAuth(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");
  const token = m[1].trim();
  const decoded = await admin.auth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("Invalid auth token");
  return decoded.uid;
}

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  };
}

async function readTxIdSetForBatch(uid, batchId) {
  // txids stored as docs: uploads/{uid}/batches/{batchId}/txids/{txId}
  const snap = await db.collection("uploads").doc(uid).collection("batches").doc(batchId).collection("txids").get();
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

    const batchId = String(body.batchId || "").trim() || sha256Hex(`${uid}|${Date.now()}|${Math.random()}`);

    // Stats + sets
    const seenExact = new Set(); // txId
    const coverageDays = new Set(); // distinct YYYY-MM-DD
    let dateOk = 0;
    let amountOk = 0;
    let merchantOk = 0;

    let totalRows = rows.length;
    let parsedRows = 0;
    let exactDupes = 0;

    let spendTotal = 0;
    let incomeTotal = 0;
    let refundCount = 0;

    // We will:
    // 1) write canonical tx to uploads/{uid}/tx/{txId} (merge)
    // 2) write txids index under batch: uploads/{uid}/batches/{batchId}/txids/{txId}
    //
    // Use WriteBatch in chunks of <= 450 writes for safety.
    const txIdsForBatch = [];

    function extractFields(r) {
      const merchantRaw = r.merchant ?? r.Merchant ?? r.name ?? r.Name ?? r.description ?? r.Description ?? r.payee ?? r.Payee ?? "";
      const amountRaw = r.amount ?? r.Amount ?? r.value ?? r.Value ?? r.amt ?? r.Amt ?? r.debit ?? r.Debit ?? 0;
      const dateRaw = r.date ?? r.Date ?? r.posted ?? r.Posted ?? r.posted_at ?? r.PostedAt ?? r.transactionDate ?? r.TransactionDate ?? "";

      const merchantNorm = normalizeMerchant(merchantRaw);
      const dateISO = toISODateAny(dateRaw);

      const amt = Number(typeof amountRaw === "string" ? amountRaw.replace(/[$,]/g, "").trim() : amountRaw);
      const amountCents = Number.isFinite(amt) ? Math.round(amt * 100) : null;

      return {
        merchantRaw: String(merchantRaw || "").trim(),
        merchantNorm,
        dateISO,
        amt,
        amountCents,
        description: String(r.description || r.Description || r.memo || r.Memo || "").trim()
      };
    }

    // First pass: compute txIds + stats
    const parsed = [];
    for (const r of rows) {
      const x = extractFields(r);

      if (x.dateISO) {
        dateOk += 1;
        coverageDays.add(x.dateISO);
      }
      if (x.merchantNorm) merchantOk += 1;
      if (Number.isFinite(x.amt)) amountOk += 1;

      // only canonicalize if we have date + merchant + amount
      if (!x.dateISO || !x.merchantNorm || !Number.isFinite(x.amt) || x.amountCents === null) continue;

      parsedRows += 1;

      // Exact txId: date + merchantNorm + exact cents
      const txId = sha256Hex(`${x.dateISO}|${x.merchantNorm}|${x.amountCents}`);

      if (seenExact.has(txId)) {
        exactDupes += 1;
        continue;
      }
      seenExact.add(txId);

      // Spend/income/refund heuristics (MVP)
      // If user provides positives for spend, leave as spend.
      // If negatives appear, treat negative as refund (spend reversal).
      const amtAbs = Math.abs(x.amt);
      if (x.amt < 0) {
        refundCount += 1;
        spendTotal += amtAbs;
      } else {
        spendTotal += amtAbs;
      }

      parsed.push({ ...x, txId });
      txIdsForBatch.push(txId);
    }

    const uniqueTxCount = seenExact.size;
    const dupRowRate = safeDiv(exactDupes, totalRows);
    const dateParseRate = safeDiv(dateOk, totalRows);
    const merchantParseRate = safeDiv(merchantOk, totalRows);
    const amountParseRate = safeDiv(amountOk, totalRows);
    const coverageDaysCount = coverageDays.size;

    const refundRate = uniqueTxCount ? refundCount / uniqueTxCount : 0;

    // Hard fail / soft flag
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

    // Write canonical tx + txids index
    // (idempotent canonical ledger; lastSeenAt updates)
    const txRoot = db.collection("uploads").doc(uid).collection("tx");
    const batchTxidsRef = db.collection("uploads").doc(uid).collection("batches").doc(batchId).collection("txids");

    const writeOps = [];
    for (const x of parsed) {
      const txRef = txRoot.doc(x.txId);
      const txidRef = batchTxidsRef.doc(x.txId);

      // Canonical tx record: merge (idempotent)
      writeOps.push({ kind: "set", ref: txRef, data: {
        uid,
        postedDate: x.dateISO, // YYYY-MM-DD (string)
        amount: x.amt,
        amountCents: x.amountCents,
        merchant: x.merchantRaw,
        merchantNorm: x.merchantNorm,
        description: x.description,
        source,
        lastSeenAt: nowTS()
      }});

      // txid index for this batch
      writeOps.push({ kind: "set", ref: txidRef, data: { createdAt: nowTS() }});
    }

    // commit in batches (<= 450 writes)
    for (let i = 0; i < writeOps.length; i += 450) {
      const chunk = writeOps.slice(i, i + 450);
      const batch = db.batch();
      for (const op of chunk) batch.set(op.ref, op.data, { merge: true });
      await batch.commit();
    }

    // Batch doc (audit record)
    const batchRef = db.collection("uploads").doc(uid).collection("batches").doc(batchId);

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
      refundRate
    };

    const txSetHash = sha256Hex(txIdsForBatch.slice().sort().join("|"));

    // Activation decision against current active batch for this windowKey
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

    // throttling
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
      // flagged batches never auto-activate
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

    // Only evaluate replacement if there is an active batch and we’re otherwise eligible
    if (activeBatchId && decision === "processed") {
      const newSet = new Set(txIdsForBatch);
      const oldSet = await readTxIdSetForBatch(uid, activeBatchId);

      jaccardOverlap = jaccard(newSet, oldSet);

      // old spend pulled from window doc (copied at activation time)
      const oldSpend = Number(windowData?.activeStats?.totalSpend ?? 0);
      const newSpend = Number(batchStats.totalSpend ?? 0);
      totalSpendDeltaPct = oldSpend > 0 ? (newSpend - oldSpend) / oldSpend : (newSpend > 0 ? 1 : 0);

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

    // If no active batch exists and we passed hard/flag/cooldown, auto-activate
    const shouldActivate = !activeBatchId && decision === "processed";

    // If active exists and we still stayed "processed", we allow replacement
    const shouldReplace = !!activeBatchId && decision === "processed";

    // Activation updates
    let activated = false;
    if (shouldActivate || shouldReplace) {
      activated = true;
      decision = "accepted";

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
      // record attempt if there *was* an active batch (replacement attempt),
      // or if no active but we failed (still a meaningful attempt)
      await windowRef.set(
        {
          activationAttempts24h: attempts24h + 1,
          lastAttemptAt: nowTS(),
          updatedAt: nowTS()
        },
        { merge: true }
      );
    }

    await batchRef.set(
      {
        uid,
        batchId,
        source,
        filename,
        createdAt: nowTS(),
        processedAt: nowTS(),
        window: {
          ...windowMeta,
          start: windowMeta.startISO,
          end: windowMeta.endISO
        },
        stats: batchStats,
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

    return jsonResponse(200, {
      ok: true,
      uid,
      batchId,
      windowKey: windowMeta.windowKey,
      decision,
      activated,
      reasons,
      stats: batchStats
    });
  } catch (e) {
    console.error("ingest-upload error:", e);
    return jsonResponse(500, { error: String(e?.message || e) });
  }
};
