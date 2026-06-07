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

async function fetchJsonWithTimeout(url, opts = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal
    });

    const body = await res.json().catch(() => ({}));

    return {
      status: res.status,
      body,
      timedOut: false
    };
  } catch (e) {
    return {
      status: 0,
      body: { error: String(e?.message || e) },
      timedOut: true
    };
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async () => {
  const results = [];

  try {
    const siteUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      "http://localhost:8888";

    const secret = process.env.MARKET_WARM_SECRET;

    if (!secret) {
      throw new Error("Missing MARKET_WARM_SECRET");
    }

    const flowRebuildDays = [30, 60, 90];

    for (const days of flowRebuildDays) {
      const rebuildUrl =
        `${siteUrl}/.netlify/functions/rebuild-flow-window` +
        `?days=${days}&mode=trailing&secret=${encodeURIComponent(secret)}`;

      const {
        status,
        body,
        timedOut
      } = await fetchJsonWithTimeout(
        rebuildUrl,
        { method: "POST" },
        9000
      );

      results.push({
        type: "rebuild-flow-window",
        days,
        status,
        timedOut,
        ok: !!body.ok,
        wrote: Number(body.wrote || 0),
        cohortUsers: Number(body.cohortUsers || 0),
        error: body.error || null
      });
    }

    await db.collection("system_jobs").doc("scheduled-flow-rebuild").set(
      {
        updatedAt: nowTS(),
        flowRebuildDays,
        lastResults: results
      },
      { merge: true }
    );

    console.log("scheduled-flow-rebuild complete", results);
    return {
  statusCode: 200,
  body: ""
};
  } catch (e) {
    console.error("scheduled-flow-rebuild error:", e);

    await db.collection("system_jobs").doc("scheduled-flow-rebuild").set(
      {
        updatedAt: nowTS(),
        error: String(e?.message || e),
        lastResults: results
      },
      { merge: true }
    );

    return {
  statusCode: 200,
  body: ""
};
  }
};