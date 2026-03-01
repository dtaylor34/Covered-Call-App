// ─── src/views/PaywallScreen.jsx ─────────────────────────────────────────────
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import { T } from "../theme";

export default function PaywallScreen() {
  const { email, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
          <div style={{ fontSize: 44, marginBottom: 12 }}>{"\u{1F512}"}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 8 }}>
            Your Free Trial Has Ended
          </h2>
          <p style={{ color: T.textDim, fontSize: 14, marginBottom: 28 }}>
            Trial for <strong style={{ color: T.text }}>{email}</strong> has expired.
            <br />Subscribe to continue using Covered Calls Manager.
          </p>

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

          <div style={{
            padding: "22px 20px", background: T.accentDim, borderRadius: T.r,
            marginBottom: 20, position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
              background: T.accent, color: T.bg, fontSize: 10, fontWeight: 800,
              padding: "3px 12px", borderRadius: 20, fontFamily: T.fontMono, letterSpacing: 1,
            }}>
              MONTHLY
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay, lineHeight: 1 }}>
              $10<span style={{ fontSize: 16, color: T.textDim, fontWeight: 500 }}>/mo</span>
            </div>
            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 4 }}>
              Cancel anytime &middot; No commitments
            </div>
          </div>

          {error && (
            <div style={{
              padding: "10px 14px", marginBottom: 14, borderRadius: 8,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", fontSize: 12, textAlign: "left",
            }}>
              {error}
            </div>
          )}

          <button onClick={handleUpgrade} disabled={loading} style={{
            width: "100%", padding: "15px", borderRadius: T.r,
            background: loading ? T.textDim : T.accent,
            color: T.bg, border: "none", fontSize: 15, fontWeight: 700,
            cursor: loading ? "wait" : "pointer", marginBottom: 10,
            opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
          }}>
            {loading ? "Redirecting to checkout..." : "Subscribe Now \u2014 $10/mo \u2192"}
          </button>

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
