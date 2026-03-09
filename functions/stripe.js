// ─── functions/stripe.js ─────────────────────────────────────────────────────
// Stripe integration for Covered Calls Manager.
//
// Exports:
//   createCheckoutSession — Callable: creates Stripe Checkout for subscription
//   createPortalSession   — Callable: creates Stripe Customer Portal session
//   stripeWebhook         — HTTP: handles Stripe webhook events
//
// Environment variables required:
//   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET   — whsec_...
//   STRIPE_PRICE_ID         — price_1T8kwxRFlsXkYLZ30WQrZSEd
//   APP_URL                 — https://covered-calls-prod.web.app
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");

// ── Stripe init (lazy) ──
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
    priceId:       process.env.STRIPE_PRICE_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    appUrl:        process.env.APP_URL || "http://localhost:5173",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// createCheckoutSession
// ═════════════════════════════════════════════════════════════════════════════
// Called from CheckoutScreen (after signup, before onboarding).
// Creates a Stripe Checkout session with:
//   - 7-day free trial (card required upfront)
//   - Optional promo code pre-applied (looked up via Stripe API)
//   - On success: redirects to /onboarding
//   - On cancel:  redirects back to /checkout

exports.createCheckoutSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid   = request.auth.uid;
  const email = request.auth.token.email;
  const stripe = getStripe();
  const config = getConfig();
  const promoCode = (request.data?.promoCode || "").toUpperCase().trim();

  if (!config.priceId) {
    throw new HttpsError("failed-precondition", "Stripe price ID not configured.");
  }

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
    await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
  }

  // ── Resolve promo code to Stripe promotion code ID ──
  let discounts = [];
  let promoApplied = null;

  if (promoCode) {
    try {
      // Look up the promo code in Firestore first to validate it
      const promoSnap = await db.collection("promoCodes").doc(promoCode).get();
      if (promoSnap.exists()) {
        const promoData = promoSnap.data();
        if (promoData.active && promoData.stripePromoId) {
          // Use the stored Stripe promotion code ID
          discounts = [{ promotion_code: promoData.stripePromoId }];
          promoApplied = promoCode;
        } else if (promoData.active) {
          // No Stripe promo ID stored — search Stripe directly
          const promoCodes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
          if (promoCodes.data.length > 0) {
            discounts = [{ promotion_code: promoCodes.data[0].id }];
            promoApplied = promoCode;
            // Save the Stripe promo ID back to Firestore for future use
            await db.collection("promoCodes").doc(promoCode).update({
              stripePromoId: promoCodes.data[0].id,
              stripeCouponId: promoCodes.data[0].coupon.id,
            });
          }
        }
      }
    } catch (err) {
      // Don't block checkout if promo lookup fails — just skip discount
      console.warn("Promo code lookup failed:", err.message);
    }
  }

  // ── Build session params ──
  const sessionParams = {
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: config.priceId, quantity: 1 }],
    // After card saved: go to onboarding
    success_url: `${config.appUrl}/onboarding?checkout=success`,
    // If user cancels Stripe checkout: back to our checkout screen
    cancel_url: `${config.appUrl}/checkout?checkout=cancelled`,
    subscription_data: {
      // 7-day free trial — card saved now, charged after trial
      trial_period_days: 7,
      metadata: { firebaseUid: uid },
    },
    // Require card collection even for 100%-off promos
    payment_method_collection: "always",
    billing_address_collection: "auto",
  };

  // Apply discount if promo resolved — disable allow_promotion_codes
  // so the field isn't shown again on Stripe's page
  if (discounts.length > 0) {
    sessionParams.discounts = discounts;
  } else {
    // No promo pre-applied — show promo field on Stripe's page as fallback
    sessionParams.allow_promotion_codes = true;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return { sessionId: session.id, url: session.url, promoApplied };
});

// ═════════════════════════════════════════════════════════════════════════════
// createPortalSession
// ═════════════════════════════════════════════════════════════════════════════

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

exports.stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const stripe = getStripe();
  const config = getConfig();
  let event;

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

      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;

        const uid = session.subscription
          ? (await stripe.subscriptions.retrieve(session.subscription)).metadata.firebaseUid
          : null;

        if (!uid) {
          const snapshot = await db.collection("users")
            .where("stripeCustomerId", "==", session.customer)
            .limit(1).get();
          if (snapshot.empty) { console.error("No user found for customer:", session.customer); break; }
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

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const uid = sub.metadata.firebaseUid;
        if (!uid) break;
        const status = sub.status === "active" || sub.status === "trialing" ? "active"
          : sub.status === "past_due" ? "past_due" : sub.status;
        await db.collection("users").doc(uid).update({
          subscriptionStatus: status,
          stripeSubscriptionId: sub.id,
          subscriptionUpdatedAt: new Date().toISOString(),
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        });
        console.log(`🔄 Subscription updated for ${uid}: ${status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const uid = sub.metadata.firebaseUid;
        if (uid) {
          await db.collection("users").doc(uid).update({
            subscriptionStatus: "cancelled",
            subscriptionCancelledAt: new Date().toISOString(),
          });
        } else {
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
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    res.status(500).json({ error: err.message });
  }
});
