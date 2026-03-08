// ─── src/components/ProfileTab.jsx ────────────────────────────────────────────
// User profile, plan management, theme selection, and account settings.

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureAccess, TIER_INFO } from "../hooks/useFeatureAccess";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useTheme, THEME_OPTIONS } from "../contexts/ThemeContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const Card = ({ children, style }) => {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: "20px 24px", marginBottom: 16, ...style,
    }}>{children}</div>
  );
};

const Badge = ({ children, color }) => {
  const { T } = useTheme();
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      fontFamily: T.fontMono, letterSpacing: 0.5, background: color + "18", color,
    }}>{children}</span>
  );
};

export default function ProfileTab() {
  const { T, themeName, setTheme } = useTheme();
  const {
    email, name, userData, trialInfo, subscriptionStatus,
    hasFreeAccessCode, updateProfile, updateUserTheme, currentUser,
  } = useAuth();
  const { plan, canAccess } = useFeatureAccess();
  const [billingLoading, setBillingLoading] = useState(false);
  const [editName, setEditName] = useState(false);
  const [nameInput, setNameInput] = useState(name || "");
  const [saved, setSaved] = useState(false);

  // ── Promo Code State ──
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [promoSuccess, setPromoSuccess] = useState(null);

  const isTrial = subscriptionStatus === "trial";
  const alreadyHasPromo = !!userData?.promoCode;

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setPromoSuccess(null);
    setPromoLoading(true);
    try {
      const promoRef = doc(db, "promoCodes", promoCode.toUpperCase().trim());
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

      // Write promo to user doc
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        promoCode: promoCode.toUpperCase().trim(),
        promoAppliedAt: new Date().toISOString(),
      });

      setPromoSuccess(promoData.description || `Promo applied! ${promoData.discountPercent || 0}% off.`);
      setPromoCode("");
    } catch (err) {
      console.error("Promo code error:", err);
      setPromoError("Could not verify promo code. Please try again.");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingLoading(true);
    try {
      const functions = getFunctions();
      const createPortal = httpsCallable(functions, "createPortalSession");
      const result = await createPortal();
      if (result.data?.url) window.location.href = result.data.url;
    } catch (err) {
      console.error("Portal error:", err);
      alert("Could not open billing portal. Please try again.");
    } finally {
      setBillingLoading(false);
    }
  };

  const saveName = async () => {
    if (nameInput.trim()) {
      await updateProfile({ name: nameInput.trim() });
      setEditName(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleThemeChange = async (themeId) => {
    try {
      setTheme(themeId);
      await updateUserTheme(themeId);
    } catch {}
  };

  const tierInfo = TIER_INFO[plan] || TIER_INFO.basic;

  return (
    <div>
      {/* User Info */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16 }}>👤</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Profile</h3>
          {saved && <Badge color={T.success}>Saved!</Badge>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "12px 16px", alignItems: "center" }}>
          <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: 1 }}>Name</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {editName ? (
              <>
                <input aria-label="Edit your display name" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 13,
                    background: T.card, border: `1px solid ${T.border}`, color: T.text,
                    fontFamily: T.fontBody, outline: "none",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button aria-label="Save name" onClick={saveName} style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: T.accentDim, border: `1px solid ${T.accent}33`, color: T.accent, cursor: "pointer",
                }}>Save</button>
                <button aria-label="Cancel editing" onClick={() => { setEditName(false); setNameInput(name || ""); }} style={{
                  padding: "5px 10px", borderRadius: 6, fontSize: 11,
                  background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer",
                }}>✕</button>
              </>
            ) : (
              <>
                <span style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{name || "—"}</span>
                <button aria-label="Edit your name" onClick={() => setEditName(true)} style={{
                  padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer",
                  background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
                }}>Edit</button>
              </>
            )}
          </div>

          <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: 1 }}>Email</div>
          <span style={{ color: T.text, fontSize: 13, fontFamily: T.fontMono }}>{email}</span>

          <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: 1 }}>Status</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge color={isTrial ? T.accent : hasFreeAccessCode ? T.owner : T.pro}>
              {isTrial ? "FREE TRIAL" : hasFreeAccessCode ? "FAMILY ACCESS" : subscriptionStatus.toUpperCase()}
            </Badge>
            {isTrial && <span style={{ color: T.textDim, fontSize: 11 }}>{trialInfo.daysLeft}d remaining</span>}
          </div>

          <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: 1 }}>Joined</div>
          <span style={{ color: T.text, fontSize: 13 }}>
            {userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString() : "—"}
          </span>
        </div>
      </Card>

      {/* ── Promo Code (trial users only) ── */}
      {isTrial && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>🎟️</span>
            <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Promo Code</h3>
          </div>

          {alreadyHasPromo ? (
            /* Already applied — show current code */
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 8,
              background: T.success + "12", border: `1px solid ${T.success}33`,
            }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div>
                <div style={{ color: T.success, fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>
                  {userData.promoCode} applied
                </div>
                <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>
                  Applied {userData.promoAppliedAt
                    ? new Date(userData.promoAppliedAt).toLocaleDateString()
                    : "during onboarding"}
                </div>
              </div>
            </div>
          ) : (
            /* No promo yet — show input */
            <>
              <div style={{ color: T.textDim, fontSize: 12, marginBottom: 12 }}>
                Have a promo code? Enter it below to unlock a discount when you subscribe.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  aria-label="Enter promo code"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoError(null);
                    setPromoSuccess(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                  placeholder="e.g. FAMILY34"
                  style={{
                    flex: 1, padding: "9px 14px", borderRadius: 8, fontSize: 13,
                    background: T.card, border: `1px solid ${promoError ? T.danger : promoSuccess ? T.success : T.border}`,
                    color: T.text, fontFamily: T.fontMono, letterSpacing: 1,
                    outline: "none", transition: "border-color 0.2s",
                  }}
                />
                <button
                  aria-label="Apply promo code"
                  onClick={applyPromo}
                  disabled={promoLoading || !promoCode.trim()}
                  style={{
                    padding: "9px 20px", borderRadius: 8, cursor: promoLoading || !promoCode.trim() ? "not-allowed" : "pointer",
                    background: T.accentDim, border: `1px solid ${T.accent}44`,
                    color: T.accent, fontSize: 12, fontWeight: 700,
                    fontFamily: T.fontMono, opacity: promoLoading || !promoCode.trim() ? 0.5 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {promoLoading ? "Checking..." : "Apply"}
                </button>
              </div>

              {/* Error message */}
              {promoError && (
                <div style={{
                  marginTop: 8, padding: "8px 12px", borderRadius: 6,
                  background: T.danger + "12", border: `1px solid ${T.danger}33`,
                  color: T.danger, fontSize: 11,
                }}>
                  ❌ {promoError}
                </div>
              )}

              {/* Success message */}
              {promoSuccess && (
                <div style={{
                  marginTop: 8, padding: "8px 12px", borderRadius: 6,
                  background: T.success + "12", border: `1px solid ${T.success}33`,
                  color: T.success, fontSize: 11,
                }}>
                  ✅ {promoSuccess}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Plan Selection */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Plan</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {Object.entries(TIER_INFO).map(([tierId, info]) => {
            const isCurrent = plan === tierId;
            const prices = { basic: 10, advanced: 20, expert: 30 };
            return (
              <div key={tierId} style={{
                padding: "16px", borderRadius: 10,
                background: isCurrent ? info.bg : T.card,
                border: `2px solid ${isCurrent ? info.color : T.border}`,
                transition: "all 0.2s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <span style={{ color: info.color, fontSize: 14, fontWeight: 800, fontFamily: T.fontDisplay }}>
                      {info.icon} {info.label}
                    </span>
                  </div>
                  <span style={{ color: info.color, fontSize: 16, fontWeight: 800, fontFamily: T.fontMono }}>
                    ${prices[tierId]}<span style={{ fontSize: 11, fontWeight: 400 }}>/mo</span>
                  </span>
                </div>
                <div style={{ marginBottom: 12 }}>
                  {info.features.map((f, i) => (
                    <div key={i} style={{ color: T.textDim, fontSize: 11, padding: "3px 0", display: "flex", gap: 6 }}>
                      <span style={{ color: info.color }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{
                    padding: "8px", textAlign: "center", borderRadius: 6,
                    background: info.color + "22", color: info.color,
                    fontSize: 11, fontWeight: 700, fontFamily: T.fontMono,
                  }}>CURRENT PLAN</div>
                ) : (
                  <button onClick={handleManageBilling} style={{
                    width: "100%", padding: "8px", borderRadius: 6, cursor: "pointer",
                    background: "transparent", border: `1px solid ${info.color}44`, color: info.color,
                    fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, transition: "all 0.2s",
                  }}>
                    {tierId === "basic" ? "Downgrade" : "Upgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Theme Selection */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16 }}>🎨</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Theme</h3>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {THEME_OPTIONS.map((t) => {
            const isCurrent = themeName === t.id;
            return (
              <button key={t.id} aria-label={`Switch to ${t.label} theme`} aria-pressed={isCurrent} onClick={() => handleThemeChange(t.id)} style={{
                padding: "12px 20px", borderRadius: 10, cursor: "pointer",
                background: isCurrent ? T.accentDim : T.card,
                border: `2px solid ${isCurrent ? T.accent : T.border}`,
                display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", background: t.preview,
                  border: `2px solid ${T.border}`,
                }} />
                <div>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 600 }}>{t.icon} {t.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Billing */}
      {subscriptionStatus === "active" && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>💳</span>
            <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Billing</h3>
          </div>
          <button aria-label="Open billing portal to manage subscription" onClick={handleManageBilling} disabled={billingLoading} style={{
            padding: "10px 20px", borderRadius: 8, cursor: billingLoading ? "wait" : "pointer",
            background: T.card, border: `1px solid ${T.border}`, color: T.text,
            fontSize: 12, fontWeight: 600, fontFamily: T.fontBody,
            opacity: billingLoading ? 0.6 : 1, transition: "all 0.2s",
          }}>
            {billingLoading ? "Opening..." : "Manage Billing & Subscription →"}
          </button>
          <div style={{ color: T.textDim, fontSize: 11, marginTop: 8 }}>
            View invoices, update payment method, or cancel your subscription via Stripe.
          </div>
        </Card>
      )}
    </div>
  );
}
