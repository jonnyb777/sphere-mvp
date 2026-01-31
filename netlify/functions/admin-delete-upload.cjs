// FILE: netlify/functions/admin-delete-upload.cjs
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
const nowTS = () => admin.firestore.FieldValue.serverTimestamp();

async function requireAdmin(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization token");
  const decoded = await admin.auth().verifyIdToken(m[1].trim());
  const uid = decoded?.uid;
  if (!uid) throw new Error("Invalid token");

  const adminDoc = await db.collection("admins").doc(uid).get();
  if (!adminDoc.exists) throw new Error("Not an admin");
  return uid;
}

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const adminUid = await requireAdmin(event);
    const body = JSON.parse(event.body || "{}");
    const uid = String(body.uid || "").trim();
    const batchId = String(body.batchId || "").trim();
    const reason = String(body.reason || "Admin removed").trim();

    if (!uid || !batchId) return json(400, { error: "uid and batchId required" });

    const batchRef = db.collection("uploads").doc(uid).collection("batches").doc(batchId);

    // Soft-delete marker
    await batchRef.set(
      {
        adminStatus: "deleted",
        adminDeletedAt: nowTS(),
        adminDeletedBy: adminUid,
        adminDeleteReason: reason,
        updatedAt: nowTS()
      },
      { merge: true }
    );

    // Mirror into global index doc (used by admin-list-uploads)
    const idxRef = db.collection("upload_batches").doc(`${uid}__${batchId}`);
    await idxRef.set(
      {
        uid,
        batchId,
        adminStatus: "deleted",
        adminDeletedAt: nowTS(),
        adminDeletedBy: adminUid,
        adminDeleteReason: reason,
        updatedAt: nowTS()
      },
      { merge: true }
    );

    return json(200, { ok: true });
  } catch (e) {
    console.error("admin-delete-upload error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};
