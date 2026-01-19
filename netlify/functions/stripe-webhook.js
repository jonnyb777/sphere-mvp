// FILE: netlify/functions/stripe-webhook.js
import Stripe from "stripe";
import admin from "firebase-admin";

// 1) Stripe client (server-side)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 2) Firebase Admin (server-side)
if (!admin.apps.length) {
  // ✅ Put the FULL JSON service account in Netlify env as FIREBASE_ADMIN_SERVICE_ACCOUNT
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var (service account JSON).");
  }

  let svc;
  try {
    svc = JSON.parse(raw);
  } catch (e) {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON.");
  }

  // ✅ IMPORTANT: Netlify often stores private_key newlines as "\\n"
  if (svc.private_key && typeof svc.private_key === "string") {
    svc.private_key = svc.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({
    credential: admin.credential.cert(svc)
  });
}

const db = admin.firestore();

export async function handler(event) {
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"] ||
    event.headers["STRIPE-SIGNATURE"];

  if (!sig) return { statusCode: 400, body: "Missing stripe-signature header" };

  // ✅ Netlify may base64 encode the body; Stripe needs exact raw payload
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
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Invalid signature: ${err.message}` };
  }

  try {
    // ✅ Good default for granting access immediately after Checkout
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      const uid = session?.metadata?.uid;
      const email =
        session?.customer_email ||
        session?.customer_details?.email ||
        null;

      if (!uid) {
        console.warn("checkout.session.completed but missing metadata.uid");
        return { statusCode: 200, body: "ok (no uid)" };
      }

      await db.collection("users").doc(uid).set(
        {
          flowAccess: true,
          stripe: {
            checkoutSessionId: session.id || null,
            customerId: session.customer || null,
            subscriptionId: session.subscription || null,
            email
          },
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Webhook handler error:", err);
    return { statusCode: 500, body: `Webhook failed: ${err.message}` };
  }
}
