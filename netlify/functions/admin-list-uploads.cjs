// FILE: netlify/functions/admin-list-uploads.cjs
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
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

  // Admin scheme: admins/{uid} exists
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

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const d = new Date(ts);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return 0;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    await requireAdmin(event);

    const qs = event.queryStringParameters || {};
    const limitN = clampInt(qs.limit || 50, 10, 200, 50);

    let snap;

    try {
      snap = await db.collectionGroup("batches").orderBy("createdAt", "desc").limit(limitN).get();
    } catch (e) {
      // Fallback if collectionGroup+orderBy requires an index
      const msg = String(e?.message || "");
      const looksLikeIndex =
        msg.toLowerCase().includes("index") ||
        msg.toLowerCase().includes("requires") ||
        msg.toLowerCase().includes("failed_precondition");

      if (!looksLikeIndex) throw e;

      snap = await db.collectionGroup("batches").limit(limitN).get();
    }

    const rows = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const parts = d.ref.path.split("/");
      // uploads/{uid}/batches/{batchId}
      const uid = parts[1];

      rows.push({
        uid,
        batchId: data.batchId || d.id,
        filename: data.filename || "",
        createdAt: data.createdAt || null,

        decision: data?.activation?.decision || "—",
        activated: !!data?.activation?.activated,

        flagged: !!data?.quality?.flagged,
        hardFail: !!data?.quality?.hardFail,

        adminStatus: data?.adminStatus || null,
        adminDeletedAt: data?.adminDeletedAt || null,
        adminDeletedBy: data?.adminDeletedBy || null,
        adminDeleteReason: data?.adminDeleteReason || null,

        stats: data.stats || {},
        rollups: {
          unmappedCount: data?.rollups?.unmappedCount || 0,
          unmappedTop: data?.rollups?.unmappedTop || {}
        }
      });
    });

    // Ensure newest-first even if unordered fallback
    rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    return json(200, { ok: true, rows });
  } catch (e) {
    const status = e?.statusCode || 500;
    return json(status, { error: String(e?.message || e), code: e?.code ?? null });
  }
};
