// FILE: netlify/functions/public-merchant-rules.cjs
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

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(obj)
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    const snap = await db
      .collection("merchant_rules")
      .where("enabled", "==", true)
      .orderBy("updatedAt", "desc")
      .limit(300)
      .get();

    const rows = snap.docs.map((d) => {
      const x = d.data() || {};
      return {
        id: x.id || d.id,
        mode: x.mode || "contains",
        pattern: x.pattern || "",
        sector: x.sector || null,
        ticker: x.ticker || null
      };
    });

    return json(200, { ok: true, rows });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
