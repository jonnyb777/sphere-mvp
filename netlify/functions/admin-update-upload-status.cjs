const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  const svc = JSON.parse(raw);
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
    headers: { "Content-Type": "application/json", "cache-control": "no-store" },
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const adminUid = await requireAdmin(event);
    const body = JSON.parse(event.body || "{}");

    const uid = String(body.uid || "").trim();
    const batchId = String(body.batchId || "").trim();
    const action = String(body.action || "").trim();
    const note = String(body.note || "").trim();

    if (!uid || !batchId) return json(400, { error: "uid and batchId required" });

    const allowed = new Set(["activate", "deactivate", "mark_test", "exclude_flow"]);
    if (!allowed.has(action)) return json(400, { error: "Invalid action" });

    let patch = {
      updatedAt: nowTS(),
      adminLastActionBy: adminUid,
      adminLastActionAt: nowTS(),
      adminLastActionNote: note || null
    };

    if (action === "activate") {
      patch = {
        ...patch,
        adminStatus: "active",
        isTest: false,
        excludeFromFlow: false,
        activation: {
          activated: true,
          decision: "approved",
          activatedAt: nowTS(),
          activatedBy: adminUid,
          note: note || null
        }
      };
    }

    if (action === "deactivate") {
      patch = {
        ...patch,
        adminStatus: "reviewed",
        activation: {
          activated: false,
          decision: "reviewed",
          reviewedAt: nowTS(),
          reviewedBy: adminUid,
          note: note || null
        }
      };
    }

    if (action === "mark_test") {
      patch = {
        ...patch,
        adminStatus: "test",
        isTest: true,
        excludeFromFlow: true,
        activation: {
          activated: false,
          decision: "test",
          reviewedAt: nowTS(),
          reviewedBy: adminUid,
          note: note || null
        }
      };
    }

    if (action === "exclude_flow") {
      patch = {
        ...patch,
        adminStatus: "excluded_from_flow",
        excludeFromFlow: true,
        activation: {
          activated: false,
          decision: "excluded_from_flow",
          reviewedAt: nowTS(),
          reviewedBy: adminUid,
          note: note || null
        }
      };
    }

    await db.collection("uploads").doc(uid).collection("batches").doc(batchId).set(patch, { merge: true });

    return json(200, { ok: true, action });
  } catch (e) {
    return json(e?.statusCode || 500, { error: String(e?.message || e), code: e?.code ?? null });
  }
};