// ─── src/views/PaywallScreen.jsx ─────────────────────────────────────────────
// Shows trial status, days remaining, and upgrade CTA.
// Adapts messaging based on whether trial is active or expired.

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import { T } from "../theme";

export default function PaywallScreen() {
  const { email, logout, trialInfo, subscriptionStatus } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isExpired = trialInfo.expired;
  const daysLeft = trialInfo.daysLeft;

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const createCheckout = httpsCallable(functions, "createCheckoutSession");
      const result = await createCheckout();

      if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        setError("Could not create checkout session. Please try again.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      if (err.code === "functions/failed-precondition") {
        setError("Payments are not configured yet. Contact support.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const benefits = [
    { icon: "\u{1F4CA}", label: "Scored Covered Call Recommendations", desc: "Composite scoring (0\u2013100) across yield, probability, Greeks" },
    { icon: "\u{1F50D}", label: "Unlimited Symbol Research", desc: "Real-time quotes, options chains, and contract analysis" },
    { icon: "\u{1F4CB}", label: "Research History with Context", desc: "Every search saved with contract details and stock price" },
    { icon: "\u{1F4C8}", label: "Portfolio Analytics", desc: "Track your positions and monitor performance" },
  ];

  // ── Dynamic messaging based on trial status ──
  let headlineText, subtitleText, ctaText, urgencyBadge;

  if (isExpired) {
    headlineText = "Your Free Trial Has Ended";
    subtitleText = (
      <>
        Trial for <strong style={{ color: T.text }}>{email}</strong> has expired.
        <br />Subscribe to continue using Covered Calls Manager.
      </>
    );
    ctaText = "Subscribe Now — $10/mo →";
    urgencyBadge = null;
  } else if (daysLeft <= 2) {
    headlineText = `Only ${daysLeft} Day${daysLeft === 1 ? "" : "s"} Left!`;
    subtitleText = (
      <>
        Your free trial for <strong style={{ color: T.text }}>{email}</strong> ends
        {daysLeft === 1 ? " tomorrow" : ` in ${daysLeft} days`}.
        <br />Subscribe now to keep uninterrupted access.
      </>
    );
    ctaText = "Subscribe Now — $10/mo →";
    urgencyBadge = "ENDING SOON";
  } else {
    headlineText = `${daysLeft} Days Left in Your Trial`;
    subtitleText = (
      <>
        You're currently on a free trial for <strong style={{ color: T.text }}>{email}</strong>.
        <br />Subscribe anytime to lock in your access — no interruption.
      </>
    );
    ctaText = "Subscribe Early — $10/mo →";
    urgencyBadge = null;
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, fontFamily: T.fontBody, padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rL,
          padding: "44px 32px", textAlign: "center",
        }}>
          {/* Icon */}
          <div style={{ fontSize: 44, marginBottom: 12 }}>
            {isExpired ? "\u{1F512}" : "\u{23F3}"}
          </div>

          {/* Trial countdown bar (only if trial still active) */}
          {!isExpired && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", fontSize: 11,
                color: T.textDim, fontFamily: T.fontMono, marginBottom: 6,
              }}>
                <span>TRIAL PROGRESS</span>
                <span>{daysLeft} of 7 days remaining</span>
              </div>
              <div style={{
                height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${trialInfo.percentUsed}%`,
                  background: daysLeft <= 2
                    ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                    : `linear-gradient(90deg, ${T.accent}, #00b894)`,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          )}

          {/* Headline */}
          <h2 style={{
            fontSize: 22, fontWeight: 800, color: T.text,
            fontFamily: T.fontDisplay, marginBottom: 8,
          }}>
            {headlineText}
          </h2>
          <p style={{ color: T.textDim, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
            {subtitleText}
          </p>

          {/* Benefits */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, textAlign: "left" }}>
            {benefits.map((b, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, padding: "12px 14px",
                background: "rgba(255,255,255,0.02)", borderRadius: 10,
                border: `1px solid ${T.border}`,
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{b.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.3 }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing card */}
          <div style={{
            padding: "22px 20px", background: T.accentDim, borderRadius: T.r,
            marginBottom: 20, position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
              background: urgencyBadge ? "#ef4444" : T.accent,
              color: urgencyBadge ? "#fff" : T.bg,
              fontSize: 10, fontWeight: 800,
              padding: "3px 12px", borderRadius: 20,
              fontFamily: T.fontMono, letterSpacing: 1,
            }}>
              {urgencyBadge || "MONTHLY"}
            </div>
            <div style={{
              fontSize: 40, fontWeight: 800, color: T.accent,
              fontFamily: T.fontDisplay, lineHeight: 1,
            }}>
              $10<span style={{ fontSize: 16, color: T.textDim, fontWeight: 500 }}>/mo</span>
            </div>
            <div style={{
              fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 4,
            }}>
              Cancel anytime &middot; No commitments
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", marginBottom: 14, borderRadius: 8,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", fontSize: 12, textAlign: "left",
            }}>
              {error}
            </div>
          )}

          {/* CTA */}
          <button onClick={handleUpgrade} disabled={loading} style={{
            width: "100%", padding: "15px", borderRadius: T.r,
            background: loading ? T.textDim : T.accent,
            color: T.bg, border: "none", fontSize: 15, fontWeight: 700,
            cursor: loading ? "wait" : "pointer", marginBottom: 10,
            opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
          }}>
            {loading ? "Redirecting to checkout..." : ctaText}
          </button>

          {/* Back to dashboard (only if trial still active) */}
          {!isExpired && (
            <button onClick={() => window.location.href = "/"} style={{
              width: "100%", padding: "12px", borderRadius: T.r,
              background: "transparent", color: T.accent, border: `1px solid ${T.border}`,
              fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8,
            }}>
              ← Continue Free Trial ({daysLeft} day{daysLeft === 1 ? "" : "s"} left)
            </button>
          )}

          {/* Sign out */}
          <button onClick={logout} style={{
            width: "100%", padding: "12px", borderRadius: T.r,
            background: "transparent", color: T.textDim, border: "none",
            fontSize: 13, cursor: "pointer",
          }}>
            Sign Out
          </button>

          <p style={{ fontSize: 10, color: T.textDim, marginTop: 20, lineHeight: 1.4 }}>
            By subscribing you agree to our Terms of Service and Privacy Policy.
            Subscription renews monthly. You can cancel anytime from your account settings.
            This tool provides informational data only and does not constitute investment advice.
          </p>
        </div>
      </div>
    </div>
  );
}
