// FILE: netlify/functions/admin-list-uploads.cjs
const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");
  const svc = JSON.parse(raw);
  if (svc.private_key && typeof svc.private_key === "string") svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}
initAdmin();

const db = admin.firestore();

async function requireAdmin(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");

  const decoded = await admin.auth().verifyIdToken(m[1].trim());
  const uid = decoded?.uid;
  if (!uid) throw new Error("Invalid token");

  // Match your Firestore rules: admins/{uid} exists
  const a = await db.collection("admins").doc(uid).get();
  if (!a.exists) throw new Error("Admin only");

  return uid;
}

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    await requireAdmin(event);

    const limitN = Math.max(10, Math.min(200, Number((event.queryStringParameters || {}).limit || 50)));

    const snap = await db.collectionGroup("batches").orderBy("createdAt", "desc").limit(limitN).get();

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
        stats: data.stats || {},
        rollups: {
          unmappedCount: data?.rollups?.unmappedCount || 0,
          unmappedTop: data?.rollups?.unmappedTop || {}
        }
      });
    });

    return json(200, { ok: true, rows });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
