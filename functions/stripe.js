const functions = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

// Secrets
const stripeSecretKeyTest = defineSecret("STRIPE_SECRET_KEY_TEST");
const stripeSecretKeyLive = defineSecret("STRIPE_SECRET_KEY_LIVE");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeWebhookSecretTest = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");
const stripeMode = defineSecret("STRIPE_MODE"); // "test" or "live"
const stripePriceIdTest = defineSecret("STRIPE_PRICE_ID_TEST");

// Live price ID is hardcoded (safe — it's not a secret)
const PRICE_ID_LIVE = "price_1T8kwxRFlsXkYLZ30WQrZSEd";

function getStripe(mode) {
  const key =
    mode === "test"
      ? stripeSecretKeyTest.value()
      : stripeSecretKeyLive.value();
  return require("stripe")(key);
}

function getPriceId(mode) {
  return mode === "test" ? stripePriceIdTest.value() : PRICE_ID_LIVE;
}

// ─── createCheckoutSession ───────────────────────────────────────────────────
exports.createCheckoutSession = functions.onCall(
  {
    secrets: [
      stripeSecretKeyTest,
      stripeSecretKeyLive,
      stripeMode,
      stripePriceIdTest,
    ],
  },
  async (request) => {
    const { promoCode, successUrl, cancelUrl } = request.data;
    const uid = request.auth?.uid;
    if (!uid) throw new functions.HttpsError("unauthenticated", "Login required.");

    const mode = stripeMode.value() || "live";
    const stripe = getStripe(mode);
    const priceId = getPriceId(mode);

    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data() || {};

    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email || request.auth.token.email,
        metadata: { firebaseUID: uid },
      });
      customerId = customer.id;
      await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
    }

    const sessionParams = {
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: successUrl || "https://covered-calls-prod.web.app/onboarding",
      cancel_url: cancelUrl || "https://covered-calls-prod.web.app/checkout",
    };

    if (promoCode) {
      try {
        const coupons = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        if (coupons.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: coupons.data[0].id }];
        }
      } catch (e) {
        console.warn("Promo code lookup failed:", e.message);
      }
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return { url: session.url };
  }
);

// ─── createPortalSession ─────────────────────────────────────────────────────
exports.createPortalSession = functions.onCall(
  {
    secrets: [stripeSecretKeyTest, stripeSecretKeyLive, stripeMode],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new functions.HttpsError("unauthenticated", "Login required.");

    const mode = stripeMode.value() || "live";
    const stripe = getStripe(mode);

    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(uid).get();
    const { stripeCustomerId } = userDoc.data() || {};
    if (!stripeCustomerId) throw new functions.HttpsError("not-found", "No Stripe customer found.");

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: "https://covered-calls-prod.web.app/dashboard",
    });

    return { url: session.url };
  }
);

// ─── stripeWebhook ───────────────────────────────────────────────────────────
exports.stripeWebhook = functions.onRequest(
  {
    secrets: [
      stripeSecretKeyTest,
      stripeSecretKeyLive,
      stripeWebhookSecret,
      stripeWebhookSecretTest,
      stripeMode,
    ],
  },
  async (req, res) => {
    const mode = stripeMode.value() || "live";
    const stripe = getStripe(mode);

    const webhookSecret =
      mode === "test"
        ? stripeWebhookSecretTest.value()
        : stripeWebhookSecret.value();

    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = admin.firestore();

    const getUidByCustomer = async (customerId) => {
      const snap = await db
        .collection("users")
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();
      return snap.empty ? null : snap.docs[0].id;
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const uid = await getUidByCustomer(session.customer);
        if (uid) {
          await db.collection("users").doc(uid).update({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: session.subscription,
            checkoutCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const uid = await getUidByCustomer(sub.customer);
        if (uid) {
          await db.collection("users").doc(uid).update({
            subscriptionStatus: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const uid = await getUidByCustomer(sub.customer);
        if (uid) {
          await db.collection("users").doc(uid).update({ subscriptionStatus: "canceled" });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const uid = await getUidByCustomer(invoice.customer);
        if (uid) {
          await db.collection("users").doc(uid).update({ subscriptionStatus: "past_due" });
        }
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);
