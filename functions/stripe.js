// ─── functions/stripe.js ─────────────────────────────────────────────────────
// Stripe integration for Covered Calls Manager.
//
// Exports:
//   createCheckoutSession — Callable: creates Stripe Checkout for subscription
//   createPortalSession   — Callable: creates Stripe Customer Portal session
//   stripeWebhook         — HTTP: handles Stripe webhook events
//
// Environment variables required (set via firebase functions:config or .env):
//   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET   — whsec_... (from Stripe Dashboard → Webhooks)
//   STRIPE_PRICE_ID         — price_... (monthly subscription price ID)
//   APP_URL                 — https://yourdomain.com (for redirect URLs)
//
// Setup:
//   1. npm install stripe (in functions/)
//   2. Create a Product + Price in Stripe Dashboard
//   3. Add webhook endpoint: https://<region>-<project>.cloudfunctions.net/stripeWebhook
//   4. Set env vars via: firebase functions:config:set stripe.secret_key="sk_..."
//      OR use .env file in functions/ directory
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");

// ── Stripe init (lazy — only loads when a Stripe function is called) ──
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new HttpsError("failed-precondition", "Stripe is not configured.");
    const Stripe = require("stripe");
    _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  }
  return _stripe;
}

function getConfig() {
  return {
    priceId: process.env.STRIPE_PRICE_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    appUrl: process.env.APP_URL || "http://localhost:5173",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// createCheckoutSession
// ═════════════════════════════════════════════════════════════════════════════
// Called from PaywallScreen. Creates a Stripe Checkout session and returns
// the URL for the client to redirect to.

exports.createCheckoutSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  const stripe = getStripe();
  const config = getConfig();

  if (!config.priceId) {
    throw new HttpsError("failed-precondition", "Stripe price ID not configured.");
  }

  // Check if user already has a Stripe customer ID
  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(uid).get();
  const userData = userDoc.data() || {};
  let customerId = userData.stripeCustomerId || null;

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { firebaseUid: uid },
    });
    customerId = customer.id;

    // Save customer ID to Firestore
    await db.collection("users").doc(uid).update({
      stripeCustomerId: customerId,
    });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: config.priceId, quantity: 1 }],
    success_url: `${config.appUrl}/?checkout=success`,
    cancel_url: `${config.appUrl}/upgrade?checkout=cancelled`,
    subscription_data: {
      metadata: { firebaseUid: uid },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  return { sessionId: session.id, url: session.url };
});

// ═════════════════════════════════════════════════════════════════════════════
// createPortalSession
// ═════════════════════════════════════════════════════════════════════════════
// Called from settings/account page. Opens Stripe Customer Portal so users
// can manage billing, cancel subscription, update payment method.

exports.createPortalSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid = request.auth.uid;
  const stripe = getStripe();
  const config = getConfig();

  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(uid).get();
  const customerId = userDoc.data()?.stripeCustomerId;

  if (!customerId) {
    throw new HttpsError("not-found", "No billing account found. Subscribe first.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.appUrl}/`,
  });

  return { url: session.url };
});

// ═════════════════════════════════════════════════════════════════════════════
// stripeWebhook
// ═════════════════════════════════════════════════════════════════════════════
// HTTP endpoint (not callable). Stripe sends events here when subscriptions
// change. Updates Firestore user doc to reflect current subscription status.
//
// Events handled:
//   checkout.session.completed — New subscription created
//   customer.subscription.updated — Plan change, renewal, payment method update
//   customer.subscription.deleted — Subscription cancelled or expired
//   invoice.payment_failed — Payment declined

exports.stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const stripe = getStripe();
  const config = getConfig();
  let event;

  // Verify webhook signature
  try {
    const sig = req.headers["stripe-signature"];
    if (!config.webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not set");
      res.status(500).send("Webhook secret not configured");
      return;
    }
    event = stripe.webhooks.constructEvent(req.rawBody, sig, config.webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  const db = admin.firestore();

  try {
    switch (event.type) {
      // ── New subscription via Checkout ──
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;

        const uid = session.subscription
          ? (await stripe.subscriptions.retrieve(session.subscription)).metadata.firebaseUid
          : null;

        if (!uid) {
          // Fallback: find user by Stripe customer ID
          const snapshot = await db.collection("users")
            .where("stripeCustomerId", "==", session.customer)
            .limit(1).get();

          if (snapshot.empty) {
            console.error("No user found for customer:", session.customer);
            break;
          }

          await snapshot.docs[0].ref.update({
            subscriptionStatus: "active",
            stripeSubscriptionId: session.subscription,
            subscribedAt: new Date().toISOString(),
          });
        } else {
          await db.collection("users").doc(uid).update({
            subscriptionStatus: "active",
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer,
            subscribedAt: new Date().toISOString(),
          });
        }

        console.log(`✅ Subscription activated for customer ${session.customer}`);
        break;
      }

      // ── Subscription updated (renewal, plan change, etc.) ──
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const uid = sub.metadata.firebaseUid;
        if (!uid) break;

        const status = sub.status === "active" || sub.status === "trialing"
          ? "active"
          : sub.status === "past_due"
            ? "past_due"
            : sub.status;

        await db.collection("users").doc(uid).update({
          subscriptionStatus: status,
          stripeSubscriptionId: sub.id,
          subscriptionUpdatedAt: new Date().toISOString(),
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        });

        console.log(`🔄 Subscription updated for ${uid}: ${status}`);
        break;
      }

      // ── Subscription cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const uid = sub.metadata.firebaseUid;

        if (uid) {
          await db.collection("users").doc(uid).update({
            subscriptionStatus: "cancelled",
            subscriptionCancelledAt: new Date().toISOString(),
          });
          console.log(`❌ Subscription cancelled for ${uid}`);
        } else {
          // Fallback: find by customer ID
          const snapshot = await db.collection("users")
            .where("stripeCustomerId", "==", sub.customer)
            .limit(1).get();

          if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({
              subscriptionStatus: "cancelled",
              subscriptionCancelledAt: new Date().toISOString(),
            });
          }
        }
        break;
      }

      // ── Payment failed ──
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const uid = sub.metadata.firebaseUid;
        if (!uid) break;

        await db.collection("users").doc(uid).update({
          subscriptionStatus: "past_due",
          lastPaymentFailedAt: new Date().toISOString(),
        });

        console.log(`⚠️ Payment failed for ${uid}`);
        break;
      }

      default:
        // Unhandled event type — log but don't error
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    res.status(500).json({ error: err.message });
  }
});
