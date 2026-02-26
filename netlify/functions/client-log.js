// FILE: netlify/functions/client-log.js
import admin from "firebase-admin";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-log-secret"
    },
    body: JSON.stringify(obj)
  };
}

// Firebase Admin init
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var.");

  let svc;
  try {
    svc = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON.");
  }

  if (svc.private_key && typeof svc.private_key === "string") {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

const db = admin.firestore();

async function getUidFromAuthHeader(headers = {}) {
  const h = headers.authorization || headers.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return decoded?.uid || null;
  } catch {
    return null;
  }
}

function str(x, max) {
  const s = x == null ? "" : String(x);
  return s.length > max ? s.slice(0, max) : s;
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

    // Optional secret gate
    const REQUIRED = process.env.CLIENT_LOG_SECRET;
    if (REQUIRED) {
      const got =
        event.headers?.["x-log-secret"] ||
        event.headers?.["X-Log-Secret"] ||
        event.headers?.["x-log-secret".toLowerCase()] ||
        null;

      if (!got || String(got) !== String(REQUIRED)) {
        // allow if authed
        const uid = await getUidFromAuthHeader(event.headers || {});
        if (!uid) return json(401, { ok: false, error: "Unauthorized" });
      }
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON" });
    }

    const uid = (await getUidFromAuthHeader(event.headers || {})) || body.uid || null;

    const doc = {
      uid: uid ? str(uid, 128) : null,

      level: str(body.level || "error", 20),
      type: str(body.type || "client_log", 40),

      message: str(body.message || "", 2000),
      stack: str(body.stack || "", 12000),
      componentStack: str(body.componentStack || "", 12000),

      href: str(body.href || "", 2000),
      userAgent: str(body.userAgent || "", 400), // ✅ matches client now
      release: str(body.release || "", 80),

      // optional extra debug fields
      filename: str(body.filename || "", 500),
      lineno: Number(body.lineno || 0),
      colno: Number(body.colno || 0),

      tsClient: Number(body.ts || 0) || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("client_logs").add(doc);
    return json(200, { ok: true });
  } catch (e) {
    console.error("client-log error:", e);
    return json(500, { ok: false, error: e?.message || "Server error" });
  }
}
