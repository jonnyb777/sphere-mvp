// FILE: netlify/functions/create-checkout.js
import Stripe from "stripe";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_FLOW_PRICE_ID; // Stripe Price ID for Flow subscription
const siteUrl = process.env.URL || "http://localhost:8888";

const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

export async function handler(event) {
  try {
    if (!stripeSecret || !priceId) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Missing STRIPE_SECRET_KEY or STRIPE_FLOW_PRICE_ID. Set them in Netlify env vars (and netlify dev env)."
        })
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Optional: accept { email } to prefill Stripe Checkout
    let email = "";
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      email = typeof body.email === "string" ? body.email : "";
    } catch {
      // ignore
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // you can add allow_promotion_codes: true if you want coupon support
      // allow_promotion_codes: true,

      success_url: `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=cancel`,

      ...(email ? { customer_email: email } : {}),

      // Nice-to-have metadata for your webhook / future entitlement writes
      metadata: {
        product: "flow"
      }
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error("create-checkout error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || String(err) })
    };
  }
}
