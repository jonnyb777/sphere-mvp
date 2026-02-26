// FILE: netlify/functions/spherical-ai.js
const OpenAI = require("openai");

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

/** --------- Firebase Admin SDK (server only) --------- */
let _admin = null;
let _db = null;

function getAdminDbOrThrow() {
  if (_db) return _db;

  // ✅ Support either env var name (you've used FIREBASE_ADMIN_SERVICE_ACCOUNT locally)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT (or FIREBASE_ADMIN_SERVICE_ACCOUNT) env var");

  let svc = null;
  try {
    svc = JSON.parse(raw);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must be valid JSON (stringified).");
  }

  // lazy-require to avoid bundler issues
  // eslint-disable-next-line global-require
  const admin = require("firebase-admin");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(svc)
    });
  }

  _admin = admin;
  _db = admin.firestore();
  return _db;
}

async function findRecentRipplePendingByDedupeKey(db, dedupeKey, minutes = 360) {
  if (!dedupeKey) return null;

  const cutoff = Date.now() - minutes * 60 * 1000;

  const snap = await db
    .collection("posts_pending")
    .where("source", "==", "ripple")
    .where("dedupeKey", "==", String(dedupeKey))
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data() || {};
  let createdAtMs = 0;

  try {
    if (data.createdAt && typeof data.createdAt.toMillis === "function") createdAtMs = data.createdAt.toMillis();
    else if (data.createdAt && typeof data.createdAt.toDate === "function") createdAtMs = data.createdAt.toDate().getTime();
  } catch {
    createdAtMs = 0;
  }

  // If it exists at all, we treat it as “already exists”
  if (createdAtMs && createdAtMs >= cutoff) return { id: doc.id, ...data };
  return { id: doc.id, ...data };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return json(500, { error: "Missing OPENAI_API_KEY env var" });

    const body = JSON.parse(event.body || "{}");

    const {
      // server write control
      createPending = false,
      dedupeKey = "",
      ripple = { name: "Ripple", email: "ripple@sphere" },

      // ✅ NEW: optional admin-provided steering text for a manual push
      angle = "",

      // Context summaries (NOT raw transactions)
      window = null,
      flow = null,
      marketPulse = null,
      alignment = null
    } = body;

    const rippleName = String(ripple?.name || "Ripple").trim() || "Ripple";

    const angleLine = String(angle || "").trim()
      ? `Admin angle (optional): ${String(angle).trim()}`
      : "";

    // ---- prompt (engagement-shaped) ----
    const prompt = `
You are ${rippleName}, Sphere’s calm community bot.
${angleLine}

Write ONE short community post (max 6 sentences). No hype. No financial advice. No “confidence” talk.
Use plain language. Sound like a thoughtful product/community manager.

Hard rules:
- Include exactly ONE specific observation from Flow (sectors / runners / merchants).
- Include exactly ONE specific observation from Market Pulse (sector leader ETFs).
- Include exactly ONE sentence about alignment overlap (shared tickers / shared areas).
- Include exactly ONE “what to watch next” sentence.
- End with ONE engagement question that invites replies.
- Do NOT mention “JSON”, “context”, “as-of”, or internal field names.
- Do NOT fabricate numbers. If a detail is missing, say “we don’t have enough signal yet”.

Context (aggregate-only, no raw transactions):
Window: ${JSON.stringify(window || {}, null, 0)}
Flow: ${JSON.stringify(flow || {}, null, 0)}
MarketPulse: ${JSON.stringify(marketPulse || {}, null, 0)}
Alignment: ${JSON.stringify(alignment || {}, null, 0)}
`.trim();

    const client = new OpenAI({ apiKey: key });

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const text =
      resp.output_text ||
      (resp.output && resp.output[0] && resp.output[0].content && resp.output[0].content[0]?.text) ||
      "";

    const finalText = String(text || "").trim();
    if (!finalText) return json(200, { ok: true, text: "", created: false, skipped: true });

    // If caller just wants the text, return it.
    if (!createPending) {
      return json(200, { ok: true, text: finalText, created: false });
    }

    // ---- create pending post as Ripple (Admin SDK) ----
    const db = getAdminDbOrThrow();

    // server-side dedupe (6 hours default)
    const existing = await findRecentRipplePendingByDedupeKey(db, String(dedupeKey || ""), 360);
    if (existing) {
      return json(200, { ok: true, text: finalText, created: false, skipped: true, reason: "dedupe" });
    }

    const rippleEmail = String(ripple?.email || "ripple@sphere").trim() || "ripple@sphere";

    await db.collection("posts_pending").add({
      title: `${rippleName} · Flow insight`,
      body: finalText,
      tag: rippleName,
      authorEmail: rippleEmail,
      authorName: rippleName,
      createdAt: _admin.firestore.FieldValue.serverTimestamp(),
      status: "pending",
      source: "ripple",
      dedupeKey: String(dedupeKey || ""),
      window: window || null,

      // optional metadata (helps debugging + future analytics)
      angle: String(angle || "").trim() || null
    });

    return json(200, { ok: true, text: finalText, created: true });
  } catch (e) {
    console.error("spherical-ai error:", e);
    return json(500, { error: String(e?.message || e) });
  }
};