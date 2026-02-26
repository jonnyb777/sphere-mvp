// FILE: netlify/functions/admin-list-merchant-rules.cjs
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

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    await requireAdmin(event);

    const qs = event.queryStringParameters || {};
    const limitN = clampInt(qs.limit || 200, 1, 500, 200);

    // rules live at merchant_rules/{merchantNorm}
    const snap = await db.collection("merchant_rules").limit(limitN).get();

    const rows = [];
    snap.forEach((d) => {
      const x = d.data() || {};
      rows.push({
        id: d.id,
        merchantNorm: x.merchantNorm || d.id,
        sector: x.sector || null,
        ticker: x.ticker || null,
        sample: x.sample || null,
        createdAt: x.createdAt || null,
        updatedAt: x.updatedAt || null,
        createdBy: x.createdBy || null,
        updatedBy: x.updatedBy || null
      });
    });

    // stable-ish ordering: merchantNorm asc
    rows.sort((a, b) => String(a.merchantNorm || "").localeCompare(String(b.merchantNorm || ""), undefined, { sensitivity: "base" }));

    return json(200, { ok: true, rows });
  } catch (e) {
    return json(e?.statusCode || 500, { error: String(e?.message || e), code: e?.code ?? null });
  }
};
