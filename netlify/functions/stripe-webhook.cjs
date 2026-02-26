// FILE: netlify/functions/stripe-webhook.cjs
// Stripe webhook -> server-truth entitlement writes.
// - Idempotent via stripe_events/{eventId}
// - Entitlement truth lives in users/{uid}.entitlements.flow (and legacy users/{uid}.flowAccess kept in sync)
// - Users cannot grant themselves access if Firestore rules are hardened (see rules below)

const Stripe = require("stripe");
const admin = require("firebase-admin");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// -------------------------
// Firebase Admin init
// -------------------------
function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var (service account JSON).");

  let svc;
  try {
    svc = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON.");
  }

  // Netlify often stores "\n" as "\\n"
  if (svc.private_key && typeof svc.private_key === "string") {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({ credential: admin.credential.cert(svc) });
}
initAdmin();

const db = admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();

function plusDaysTimestamp(days) {
  const ms = Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000;
  return admin.firestore.Timestamp.fromMillis(ms);
}

function getStripeSig(headers = {}) {
  return (
    headers["stripe-signature"] ||
    headers["Stripe-Signature"] ||
    headers["STRIPE-SIGNATURE"] ||
    null
  );
}

// -------------------------
// Idempotency
// -------------------------
async function markEventOnce(stripeEvent) {
  const ref = db.collection("stripe_events").doc(stripeEvent.id);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      type: stripeEvent.type,
      created: stripeEvent.created || null,
      livemode: !!stripeEvent.livemode,
      receivedAt: now()
    });
    return true;
  });
}

// -------------------------
// User lookup
// -------------------------
async function findUsersByCustomerId(customerId) {
  if (!customerId) return [];
  const snap = await db
    .collection("users")
    .where("stripe.customerId", "==", customerId)
    .limit(25)
    .get();
  return snap.docs;
}

// -------------------------
// Entitlement policy
// -------------------------
function entitledFromSubscription(sub) {
  const status = String(sub?.status || "").toLowerCase();
  // clean: active/trialing => entitled
  // everything else not entitled (invoice events can apply grace)
  return status === "active" || status === "trialing";
}

// Writes one consistent entitlement shape
function entitlementPatch({ active, status, source, graceUntil = null }) {
  return {
    entitlements: {
      flow: {
        active: !!active,
        status: String(status || ""),
        source: String(source || "stripe"),
        graceUntil: graceUntil || null,
        updatedAt: now()
      }
    },
    // keep legacy gate for now (lets UI do simple checks)
    flowAccess: !!active,
    updatedAt: now()
  };
}

// -------------------------
// Main handler
// -------------------------
exports.handler = async (event) => {
  const sig = getStripeSig(event.headers || {});
  if (!sig) return { statusCode: 400, body: "Missing stripe-signature header" };

  // Netlify sends the raw body in event.body; must use EXACT raw string for constructEvent
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message || err);
    return { statusCode: 400, body: `Invalid signature: ${err?.message || "bad signature"}` };
  }

  try {
    // Optional livemode guard
    if (process.env.STRIPE_EXPECT_LIVEMODE !== undefined) {
      const live = !!stripeEvent.livemode;
      const expectLive = String(process.env.STRIPE_EXPECT_LIVEMODE) === "true";
      if (live !== expectLive) {
        console.warn("Stripe livemode mismatch:", { live, expectLive, type: stripeEvent.type });
        return { statusCode: 200, body: "ok (livemode mismatch)" };
      }
    }

    // Idempotency
    const first = await markEventOnce(stripeEvent);
    if (!first) return { statusCode: 200, body: "ok (duplicate)" };

    // =========================================================
    // A) checkout.session.completed
    // Store stripe IDs only; do NOT grant entitlement here.
    // =========================================================
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;
      const uid = session?.metadata?.uid;
      if (!uid) return { statusCode: 200, body: "ok (no uid)" };

      const email = session?.customer_email || session?.customer_details?.email || null;

      await db.collection("users").doc(uid).set(
        {
          stripe: {
            checkoutSessionId: session?.id || null,
            customerId: session?.customer || null,
            subscriptionId: session?.subscription || null,
            email,
            paymentStatus: session?.payment_status || null,
            mode: session?.mode || null
          },
          billing: {
            ...(session?.payment_status ? { lastCheckoutPaymentStatus: session.payment_status } : {}),
            lastCheckoutAt: now()
          },
          // UI may show "processing" until subscription.updated arrives
          entitlement: { pending: true, source: "checkout.session.completed" },
          updatedAt: now()
        },
        { merge: true }
      );

      return { statusCode: 200, body: "ok" };
    }

    // =========================================================
    // B) customer.subscription.updated (AUTHORITATIVE)
    // =========================================================
    if (stripeEvent.type === "customer.subscription.updated") {
      const sub = stripeEvent.data.object;
      const customerId = sub?.customer || null;
      const status = String(sub?.status || "").toLowerCase();
      const entitled = entitledFromSubscription(sub);

      const docs = await findUsersByCustomerId(customerId);
      if (!docs.length) return { statusCode: 200, body: "ok (no user for customer)" };

      const batch = db.batch();
      for (const docSnap of docs) {
        const prev = docSnap.data() || {};
        batch.set(
          docSnap.ref,
          {
            ...entitlementPatch({
              active: entitled,
              status,
              source: "customer.subscription.updated",
              // if subscription is active again, clear grace
              graceUntil: entitled ? null : (prev?.entitlements?.flow?.graceUntil || null)
            }),
            entitlement: { pending: false, source: "customer.subscription.updated", status, decidedAt: now() },
            stripe: {
              ...(prev.stripe || {}),
              customerId: customerId || prev?.stripe?.customerId || null,
              subscriptionId: sub?.id || prev?.stripe?.subscriptionId || null,
              subscriptionStatus: status || null,
              currentPeriodEnd: sub?.current_period_end ? Number(sub.current_period_end) : null,
              cancelAtPeriodEnd: !!sub?.cancel_at_period_end
            },
            billing: {
              ...(prev.billing || {}),
              pastDue: status === "past_due",
              canceled: status === "canceled"
            }
          },
          { merge: true }
        );
      }
      await batch.commit();
      return { statusCode: 200, body: "ok" };
    }

    // =========================================================
    // C) customer.subscription.deleted (AUTHORITATIVE REVOKE)
    // =========================================================
    if (stripeEvent.type === "customer.subscription.deleted") {
      const sub = stripeEvent.data.object;
      const customerId = sub?.customer || null;

      const docs = await findUsersByCustomerId(customerId);
      if (!docs.length) return { statusCode: 200, body: "ok (no user for customer)" };

      const batch = db.batch();
      for (const docSnap of docs) {
        const prev = docSnap.data() || {};
        batch.set(
          docSnap.ref,
          {
            ...entitlementPatch({
              active: false,
              status: "canceled",
              source: "customer.subscription.deleted",
              graceUntil: null
            }),
            entitlement: { pending: false, source: "customer.subscription.deleted", status: "canceled", decidedAt: now() },
            stripe: {
              ...(prev.stripe || {}),
              customerId: customerId || prev?.stripe?.customerId || null,
              subscriptionId: sub?.id || prev?.stripe?.subscriptionId || null,
              subscriptionStatus: "canceled"
            },
            billing: { ...(prev.billing || {}), canceled: true }
          },
          { merge: true }
        );
      }
      await batch.commit();
      return { statusCode: 200, body: "ok" };
    }

    // =========================================================
    // D) invoice.payment_failed (GRACE, do not hard revoke)
    // =========================================================
    if (stripeEvent.type === "invoice.payment_failed") {
      const inv = stripeEvent.data.object;
      const customerId = inv?.customer || null;

      const docs = await findUsersByCustomerId(customerId);
      if (!docs.length) return { statusCode: 200, body: "ok (no user for customer)" };

      const GRACE_DAYS = Number(process.env.STRIPE_GRACE_DAYS || 7);
      const graceUntil = plusDaysTimestamp(GRACE_DAYS);

      const batch = db.batch();
      for (const docSnap of docs) {
        const prev = docSnap.data() || {};
        batch.set(
          docSnap.ref,
          {
            // Keep access during grace
            ...entitlementPatch({
              active: true,
              status: "past_due",
              source: "invoice.payment_failed",
              graceUntil
            }),
            stripe: {
              ...(prev.stripe || {}),
              customerId,
              lastInvoiceId: inv?.id || null,
              lastInvoiceStatus: inv?.status || "payment_failed"
            },
            billing: {
              ...(prev.billing || {}),
              pastDue: true,
              graceUntil,
              lastInvoiceFailedAt: now()
            }
          },
          { merge: true }
        );
      }

      await batch.commit();
      return { statusCode: 200, body: "ok" };
    }

    // =========================================================
    // E) invoice.payment_succeeded (CLEAR past_due/grace)
    // =========================================================
    if (stripeEvent.type === "invoice.payment_succeeded") {
      const inv = stripeEvent.data.object;
      const customerId = inv?.customer || null;

      const docs = await findUsersByCustomerId(customerId);
      if (!docs.length) return { statusCode: 200, body: "ok (no user for customer)" };

      const batch = db.batch();
      for (const docSnap of docs) {
        const prev = docSnap.data() || {};
        batch.set(
          docSnap.ref,
          {
            ...entitlementPatch({
              active: true,
              status: "paid",
              source: "invoice.payment_succeeded",
              graceUntil: null
            }),
            stripe: {
              ...(prev.stripe || {}),
              customerId,
              lastInvoiceId: inv?.id || prev?.stripe?.lastInvoiceId || null,
              lastInvoiceStatus: inv?.status || "paid"
            },
            billing: {
              ...(prev.billing || {}),
              pastDue: false,
              graceUntil: null,
              lastPaidInvoiceId: inv?.id || null,
              lastPaidAt: now()
            }
          },
          { merge: true }
        );
      }

      await batch.commit();
      return { statusCode: 200, body: "ok" };
    }

    // =========================================================
    // F) charge.refunded (ANNOTATE ONLY)
    // =========================================================
    if (stripeEvent.type === "charge.refunded") {
      const ch = stripeEvent.data.object;
      const customerId = ch?.customer || null;

      const docs = await findUsersByCustomerId(customerId);
      if (!docs.length) return { statusCode: 200, body: "ok (no user for customer)" };

      const batch = db.batch();
      for (const docSnap of docs) {
        const prev = docSnap.data() || {};
        batch.set(
          docSnap.ref,
          {
            billing: {
              ...(prev.billing || {}),
              lastRefundChargeId: ch?.id || null,
              lastRefundedAt: now()
            },
            updatedAt: now()
          },
          { merge: true }
        );
      }
      await batch.commit();
      return { statusCode: 200, body: "ok" };
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Webhook handler error:", err);
    return { statusCode: 500, body: `Webhook failed: ${err?.message || "server error"}` };
  }
};
