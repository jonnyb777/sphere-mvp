// FILE: netlify/functions/admin-upsert-merchant-rule.cjs
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

  admin.initializeApp({ credential: admin.credential.cert(svc) });
}
initAdmin();

const db = admin.firestore();
const nowTS = () => admin.firestore.FieldValue.serverTimestamp();

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(obj)
  };
}

async function requireAdmin(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) {
    const err = new Error("Missing Authorization Bearer token");
    err.statusCode = 401;
    throw err;
  }

  const decoded = await admin.auth().verifyIdToken(m[1].trim());
  const uid = decoded?.uid;
  if (!uid) {
    const err = new Error("Invalid token");
    err.statusCode = 401;
    throw err;
  }

  const a = await db.collection("admins").doc(uid).get();
  if (!a.exists) {
    const err = new Error("Admin only");
    err.statusCode = 403;
    throw err;
  }

  return uid;
}

function cleanUpper(s) {
  return String(s || "").trim().toUpperCase();
}

function cleanText(s) {
  const t = String(s || "").trim();
  return t || "";
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const adminUid = await requireAdmin(event);

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const merchantNorm = cleanText(body.merchantNorm);
    const sector = cleanText(body.sector);
    const ticker = cleanUpper(body.ticker || "");
    const sample = cleanText(body.sample || "");

    if (!merchantNorm) return json(400, { error: "merchantNorm required" });
    if (!sector) return json(400, { error: "sector required" });

    const ref = db.collection("merchant_rules").doc(merchantNorm);

    const existing = await ref.get();
    const isCreate = !existing.exists;

    await ref.set(
      {
        merchantNorm,
        sector,
        ticker: ticker || null,
        sample: sample || null,
        ...(isCreate ? { createdAt: nowTS(), createdBy: adminUid } : {}),
        updatedAt: nowTS(),
        updatedBy: adminUid
      },
      { merge: true }
    );

    return json(200, { ok: true, created: isCreate, merchantNorm });
  } catch (e) {
    return json(e?.statusCode || 500, { error: String(e?.message || e), code: e?.code ?? null });
  }
};
