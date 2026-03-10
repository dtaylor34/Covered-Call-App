// ─── src/views/CheckoutScreen.jsx ────────────────────────────────────────────
// Shown after signup, before onboarding.
// Collects credit card via Stripe Checkout with optional promo code.
// 7-day free trial — card saved now, charged after trial ends.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { db, functions } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function CheckoutScreen() {
  const { T } = useTheme();
  const { user, email, name } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [promoCode, setPromoCode]       = useState("");
  const [promoError, setPromoError]     = useState(null);
  const [promoSuccess, setPromoSuccess] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [validatedPromo, setValidatedPromo] = useState(null); // code that passed validation

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // Show cancellation message if returning from Stripe
  const cancelled = searchParams.get("checkout") === "cancelled";

  // ── Promo Code Validation ──
  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setPromoSuccess(null);
    setValidatedPromo(null);
    setPromoLoading(true);
    try {
      const promoRef  = doc(db, "promoCodes", promoCode.toUpperCase().trim());
      const promoSnap = await getDoc(promoRef);

      if (!promoSnap.exists()) {
        setPromoError("Invalid promo code. Check the code and try again.");
        return;
      }

      const promoData = promoSnap.data();

      if (!promoData.active) {
        setPromoError("This promo code is no longer active.");
        return;
      }
      if (promoData.expiresAt && new Date(promoData.expiresAt) < new Date()) {
        setPromoError("This promo code has expired.");
        return;
      }
      if (promoData.maxUses && promoData.usedCount >= promoData.maxUses) {
        setPromoError("This promo code has reached its maximum uses.");
        return;
      }

      setPromoSuccess(promoData.description || `Promo applied!`);
      setValidatedPromo(promoCode.toUpperCase().trim());
    } catch (err) {
      console.error("Promo code error:", err);
      setPromoError("Could not verify promo code. You can skip this and add it later.");
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Start Checkout ──
  const handleStartTrial = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const createCheckout = httpsCallable(functions, "createCheckoutSession");
      const result = await createCheckout({
        promoCode: validatedPromo || "",
        successUrl: `${window.location.origin}/onboarding`,
        cancelUrl: `${window.location.origin}/checkout?checkout=cancelled`,
      });
      if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        setError("Could not start checkout. Please try again.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, fontFamily: T.fontBody, padding: "24px 16px",
    }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-20%", left: "-10%", width: "50vw", height: "50vw",
          background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`,
          opacity: 0.06, filter: "blur(80px)",
        }} />
      </div>

      <div style={{ width: "100%", maxWidth: 480, position: "relative", zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, margin: "0 auto 16px",
            background: `linear-gradient(135deg, ${T.accent}, #00b894)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 900, color: T.bg, fontFamily: T.fontDisplay,
          }}>CC</div>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: T.text,
            fontFamily: T.fontDisplay, marginBottom: 6,
          }}>
            Start your free trial
          </h1>
          <p style={{ fontSize: 13, color: T.textDim }}>
            {email}
          </p>
        </div>

        {/* ── Cancelled banner ── */}
        {cancelled && (
          <div style={{
            padding: "12px 16px", borderRadius: 8, marginBottom: 16,
            background: T.warnDim, border: `1px solid ${T.warn}33`,
            color: T.warn, fontSize: 13,
          }}>
            ⚠️ Checkout was cancelled — you can try again below.
          </div>
        )}

        {/* ── Main card ── */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.rL, padding: "28px 24px",
        }}>

          {/* What you get */}
          <div style={{
            padding: "16px", borderRadius: 10, marginBottom: 24,
            background: T.accentDim, border: `1px solid ${T.accent}22`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 10 }}>
              🎉 7-Day Free Trial — Full Access
            </div>
            {[
              "Real-time options chain analysis",
              "Strike price recommendations & scoring",
              "Paper trade simulator",
              "Private Slack community",
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: T.accent, fontSize: 12 }}>✓</span>
                <span style={{ color: T.text, fontSize: 12 }}>{f}</span>
              </div>
            ))}
            <div style={{
              marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ color: T.textDim, fontSize: 12 }}>After trial</span>
              <span style={{ color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.fontMono }}>
                $10<span style={{ fontSize: 11, fontWeight: 400 }}>/month</span>
              </span>
            </div>
          </div>

          {/* Promo Code */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
              color: T.textDim, fontFamily: T.fontMono, marginBottom: 6,
              textTransform: "uppercase",
            }}>
              Promo Code <span style={{ color: T.textMuted, fontWeight: 400 }}>(optional)</span>
            </label>

            {validatedPromo ? (
              /* Applied state */
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: 8,
                background: T.success + "12", border: `1px solid ${T.success}33`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>✅</span>
                  <div>
                    <div style={{ color: T.success, fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>
                      {validatedPromo}
                    </div>
                    <div style={{ color: T.textDim, fontSize: 11 }}>{promoSuccess}</div>
                  </div>
                </div>
                <button
                  onClick={() => { setValidatedPromo(null); setPromoSuccess(null); setPromoCode(""); }}
                  style={{
                    background: "none", border: "none", color: T.textDim,
                    fontSize: 12, cursor: "pointer",
                  }}
                >Remove</button>
              </div>
            ) : (
              /* Input state */
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                    placeholder="e.g. CODE123"
                    maxLength={20}
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${promoError ? T.danger : T.border}`,
                      color: T.text, fontFamily: T.fontMono, letterSpacing: 1,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={applyPromo}
                    disabled={promoLoading || !promoCode.trim()}
                    style={{
                      padding: "10px 18px", borderRadius: 8, cursor: "pointer",
                      background: promoCode.trim() ? T.accentDim : "rgba(255,255,255,0.03)",
                      border: `1px solid ${promoCode.trim() ? T.accent + "44" : T.border}`,
                      color: promoCode.trim() ? T.accent : T.textMuted,
                      fontSize: 12, fontWeight: 700,
                      opacity: promoLoading || !promoCode.trim() ? 0.5 : 1,
                    }}
                  >
                    {promoLoading ? "..." : "Apply"}
                  </button>
                </div>
                {promoError && (
                  <div style={{ marginTop: 6, fontSize: 12, color: T.danger }}>
                    ❌ {promoError}
                  </div>
                )}
              </>
            )}
          </div>

          {/* CTA Button */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12,
              background: T.dangerDim, border: `1px solid ${T.danger}33`,
              color: T.danger, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleStartTrial}
            disabled={loading}
            style={{
              width: "100%", padding: "14px", borderRadius: T.r,
              background: T.accent, color: T.bg, border: "none",
              fontSize: 14, fontWeight: 700, fontFamily: T.fontBody,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.2s",
            }}
          >
            {loading ? "Redirecting to Stripe..." : "Start Free Trial → Enter Card"}
          </button>

          {/* Disclaimer */}
          <div style={{
            marginTop: 16, padding: "12px 14px", borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`,
          }}>
            <p style={{ fontSize: 11, color: T.textDim, lineHeight: 1.6, margin: 0 }}>
              🔒 <strong style={{ color: T.text }}>No charge today.</strong> By entering your card,
              you agree to be charged <strong style={{ color: T.text }}>$10/month</strong> automatically
              after your 7-day free trial ends.{" "}
              <strong style={{ color: T.text }}>Cancel anytime</strong> before the trial ends and
              you won't be charged. Your card details are handled securely by Stripe — we never
              store your card information.
            </p>
          </div>
        </div>

        {/* Sign out link */}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            onClick={() => navigate("/login")}
            style={{
              background: "none", border: "none", color: T.textMuted,
              fontSize: 12, cursor: "pointer",
            }}
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
