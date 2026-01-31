// FILE: netlify/functions/whoami.js
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
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

async function requireAuth(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");
  const token = m[1].trim();
  const decoded = await admin.auth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("Invalid auth token");
  return decoded;
}

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    const uid = decoded.uid;

    // Write a tiny ping doc to prove Firestore write works from functions
    const ref = db.collection("debug_pings").doc(uid);
    await ref.set({ uid, at: nowTS(), email: decoded.email || null }, { merge: true });

    return json(200, {
      ok: true,
      uid,
      email: decoded.email || null,
      project: process.env.VITE_FIREBASE_PROJECT_ID || "(not set in function env)",
      wrote: "debug_pings/{uid}"
    });
  } catch (e) {
    console.error("whoami error:", e);
    return json(401, { ok: false, error: String(e?.message || e) });
  }
};
