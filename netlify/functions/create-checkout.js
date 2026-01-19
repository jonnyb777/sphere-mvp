// FILE: netlify/functions/create-checkout.js
import Stripe from "stripe";

/**
 * IMPORTANT
 * - STRIPE_SECRET_KEY must be set (server env only; NEVER in VITE_)
 * - STRIPE_FLOW_PRICE_ID must be set (server env; you can also set VITE_STRIPE_FLOW_PRICE_ID for client display)
 * - URL or DEPLOY_PRIME_URL must be available (Netlify sets these in deploy; netlify dev may not)
 */

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

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing ${name} env var`);
  }
  return String(v).trim();
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization"
        },
        body: ""
      };
    }

    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    // ---- Env ----
    const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
    const STRIPE_FLOW_PRICE_ID = requireEnv("STRIPE_FLOW_PRICE_ID");

    // Netlify provides one of these in real deploys.
    // For local `netlify dev`, set URL=http://localhost:8888 in .env.local (or use SITE_URL below).
    const baseUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.SITE_URL ||
      "http://localhost:8888";

    // ---- Stripe client (safe initialization) ----
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      // If you ever use Stripe Connect later, you'd add:
      // appInfo: { name: "Sphere", version: "0.1.0" }
    });

    // ---- Body ----
    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const uid = String(payload.uid || "").trim();
    const email = String(payload.email || "").trim();

    // You said you want STRICT: require both.
    if (!uid || !email) {
      return json(400, { error: "Missing uid or email" });
    }

    // Optional: pass through timeframe/plan later (keep simple now)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // Stripe no longer requires payment_method_types explicitly in many cases,
      // but leaving it is fine.
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: STRIPE_FLOW_PRICE_ID, quantity: 1 }],

      success_url: `${baseUrl}/?flow=success`,
      cancel_url: `${baseUrl}/?flow=cancel`,

      // This is what your webhook should use to grant access.
      metadata: { uid },

      // Optional but nice: allow promotion codes (coupons)
      allow_promotion_codes: true
    });

    return json(200, { ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json(500, { ok: false, error: err?.message || "Server error" });
  }
}
