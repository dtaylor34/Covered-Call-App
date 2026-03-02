// ─── src/views/OnboardingScreen.jsx ──────────────────────────────────────────
// Multi-step onboarding flow for new users.
// Collects profile info, preferences, and optional promo code.
// Completes by marking the user's onboarding done and starting their trial.
//
// Steps:
//   1. Profile — name, experience level, investment goal
//   2. Preferences — newsletter opt-in, update frequency
//   3. Promo Code — optional code for discounts or extended trial
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { AnalyticsEvents, analytics } from "../services/analytics";
import { useTheme } from "../contexts/ThemeContext";

const STEPS = [
  { key: "profile", label: "Your Profile", icon: "👤" },
  { key: "preferences", label: "Preferences", icon: "⚙" },
  { key: "promo", label: "Get Started", icon: "🚀" },
];

export default function OnboardingScreen() {
  const { T } = useTheme();
  const { user, email, refreshUserData } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [promoSuccess, setPromoSuccess] = useState(null);

  // ── Form state ──
  const [profile, setProfile] = useState({
    displayName: "",
    experienceLevel: "",
    investmentGoal: "",
    portfolioSize: "",
  });

  const [preferences, setPreferences] = useState({
    newsletterOptIn: true,
    updateFrequency: "weekly",
    notifyNewFeatures: true,
    notifyMarketAlerts: true,
    notifyEducation: true,
  });

  const [promoCode, setPromoCode] = useState("");

  // ── Navigation ──
  const canAdvance = () => {
    if (step === 0) return profile.displayName.trim().length >= 2 && profile.experienceLevel;
    return true; // Steps 2 and 3 have defaults / are optional
  };

  const nextStep = () => {
    if (step < STEPS.length - 1) {
      AnalyticsEvents.onboardingStepCompleted(STEPS[step].key);
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  // ── Promo Code Validation ──
  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setPromoSuccess(null);

    try {
      // Check if promo code exists in Firestore
      const promoRef = doc(db, "promoCodes", promoCode.toUpperCase().trim());
      const promoSnap = await getDoc(promoRef);

      if (!promoSnap.exists()) {
        setPromoError("Invalid promo code. Check the code and try again.");
        return;
      }

      const promoData = promoSnap.data();

      // Check if expired
      if (promoData.expiresAt && new Date(promoData.expiresAt) < new Date()) {
        setPromoError("This promo code has expired.");
        return;
      }

      // Check if max uses reached
      if (promoData.maxUses && promoData.usedCount >= promoData.maxUses) {
        setPromoError("This promo code has reached its maximum uses.");
        return;
      }

      setPromoSuccess(promoData.description || `Promo applied! ${promoData.discountPercent || 0}% off.`);
    } catch (err) {
      console.error("Promo code error:", err);
      setPromoError("Could not verify promo code. You can add it later in settings.");
    }
  };

  // ── Complete Onboarding ──
  const completeOnboarding = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const userRef = doc(db, "users", user.uid);
      const now = new Date().toISOString();

      await updateDoc(userRef, {
        // Profile
        name: profile.displayName.trim(),
        experienceLevel: profile.experienceLevel,
        investmentGoal: profile.investmentGoal || null,
        portfolioSize: profile.portfolioSize || null,

        // Preferences
        newsletterOptIn: preferences.newsletterOptIn,
        updateFrequency: preferences.updateFrequency,
        notifyNewFeatures: preferences.notifyNewFeatures,
        notifyMarketAlerts: preferences.notifyMarketAlerts,
        notifyEducation: preferences.notifyEducation,

        // Promo
        promoCode: promoCode.trim() ? promoCode.toUpperCase().trim() : null,
        promoAppliedAt: promoCode.trim() ? now : null,

        // Onboarding complete
        onboardingComplete: true,
        onboardingCompletedAt: now,

        // Initialize search history
        searchHistory: [],
        watchlist: [],
      });

      await refreshUserData();
      AnalyticsEvents.onboardingCompleted(!!promoCode.trim());
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Onboarding save error:", err);
      analytics.error(err, { context: "onboarding_save", severity: "error", step: STEPS[step].key });
      // Don't block — save what we can
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
          name: profile.displayName.trim(),
          onboardingComplete: true,
          onboardingCompletedAt: new Date().toISOString(),
        });
        await refreshUserData();
        navigate("/", { replace: true });
      } catch {
        navigate("/", { replace: true });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, fontFamily: T.fontBody,
    }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-20%", right: "-10%", width: "50vw", height: "50vw",
          background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`,
          opacity: 0.05, filter: "blur(80px)",
        }} />
      </div>

      <div style={{ width: "100%", maxWidth: 560, padding: 32, position: "relative", zIndex: 1 }}>
        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `linear-gradient(135deg, ${T.accent}, #00b894)`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 900, color: T.bg, fontFamily: T.fontDisplay,
            marginBottom: 16,
          }}>CC</div>
          <h1 style={{
            fontSize: 24, fontWeight: 800, color: T.text,
            fontFamily: T.fontDisplay, marginBottom: 4,
          }}>
            Let's set up your account
          </h1>
          <p style={{ fontSize: 13, color: T.textDim }}>
            {email} — Step {step + 1} of {STEPS.length}
          </p>
        </div>

        {/* ── Progress Bar ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                height: 4, width: "100%", borderRadius: 2,
                background: i <= step ? T.accent : "rgba(255,255,255,0.06)",
                transition: "background 0.3s",
              }} />
              <span style={{
                fontSize: 10, fontFamily: T.fontMono,
                color: i <= step ? T.accent : T.textMuted,
                fontWeight: i === step ? 700 : 400,
              }}>
                {s.icon} {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Step Content ── */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.rL, padding: "32px 28px",
        }}>
          {step === 0 && (
            <StepProfile profile={profile} setProfile={setProfile} />
          )}
          {step === 1 && (
            <StepPreferences preferences={preferences} setPreferences={setPreferences} />
          )}
          {step === 2 && (
            <StepPromo
              promoCode={promoCode}
              setPromoCode={setPromoCode}
              applyPromo={applyPromo}
              promoError={promoError}
              promoSuccess={promoSuccess}
              profile={profile}
              preferences={preferences}
            />
          )}

          {/* ── Navigation Buttons ── */}
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            {step > 0 && (
              <button onClick={prevStep} style={{
                padding: "12px 24px", borderRadius: T.r,
                background: "transparent", border: `1px solid ${T.border}`,
                color: T.textDim, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                ← Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {step < STEPS.length - 1 ? (
              <button onClick={nextStep} disabled={!canAdvance()} style={{
                padding: "12px 32px", borderRadius: T.r,
                background: canAdvance() ? T.accent : "rgba(255,255,255,0.05)",
                color: canAdvance() ? T.bg : T.textMuted,
                border: "none", fontSize: 13, fontWeight: 700, cursor: canAdvance() ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}>
                Continue →
              </button>
            ) : (
              <button onClick={completeOnboarding} disabled={saving} style={{
                padding: "12px 32px", borderRadius: T.r,
                background: T.accent, color: T.bg,
                border: "none", fontSize: 13, fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Setting up..." : "Start My Free Trial →"}
              </button>
            )}
          </div>
        </div>

        {/* ── Skip option ── */}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => { AnalyticsEvents.onboardingSkipped(STEPS[step].key); completeOnboarding(); }} style={{
            background: "none", border: "none", color: T.textMuted,
            fontSize: 12, cursor: "pointer",
          }}>
            Skip for now — I'll set this up later
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

function StepProfile({ profile, setProfile }) {
  const { T } = useTheme();
  const update = (key, val) => setProfile((p) => ({ ...p, [key]: val }));

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>
        About You
      </h2>
      <p style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>
        Help us personalize your experience.
      </p>

      {/* Name */}
      <FieldLabel>Your Name *</FieldLabel>
      <input
        value={profile.displayName}
        onChange={(e) => update("displayName", e.target.value)}
        placeholder="Full name"
        maxLength={60}
        style={inputStyle(T)}
      />

      {/* Experience Level */}
      <FieldLabel style={{ marginTop: 20 }}>Options Experience *</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { value: "beginner", label: "Beginner", desc: "New to options" },
          { value: "intermediate", label: "Intermediate", desc: "Some trades" },
          { value: "advanced", label: "Advanced", desc: "Active trader" },
          { value: "expert", label: "Expert", desc: "Professional" },
        ].map((opt) => (
          <SelectCard
            key={opt.value}
            selected={profile.experienceLevel === opt.value}
            onClick={() => update("experienceLevel", opt.value)}
            label={opt.label}
            desc={opt.desc}
          />
        ))}
      </div>

      {/* Investment Goal */}
      <FieldLabel style={{ marginTop: 20 }}>Primary Goal</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { value: "income", label: "💰 Generate Income", desc: "Premium collection" },
          { value: "learn", label: "📚 Learn Strategies", desc: "Education first" },
          { value: "hedge", label: "🛡 Hedge Holdings", desc: "Protect positions" },
          { value: "explore", label: "🔍 Just Exploring", desc: "Curious about options" },
        ].map((opt) => (
          <SelectCard
            key={opt.value}
            selected={profile.investmentGoal === opt.value}
            onClick={() => update("investmentGoal", opt.value)}
            label={opt.label}
            desc={opt.desc}
          />
        ))}
      </div>

      {/* Portfolio Size */}
      <FieldLabel style={{ marginTop: 20 }}>Approximate Portfolio Size</FieldLabel>
      <select
        value={profile.portfolioSize}
        onChange={(e) => update("portfolioSize", e.target.value)}
        style={{ ...inputStyle(T), cursor: "pointer" }}
      >
        <option value="">Prefer not to say</option>
        <option value="under10k">Under $10,000</option>
        <option value="10k-50k">$10,000 – $50,000</option>
        <option value="50k-100k">$50,000 – $100,000</option>
        <option value="100k-500k">$100,000 – $500,000</option>
        <option value="500kplus">$500,000+</option>
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

function StepPreferences({ preferences, setPreferences }) {
  const { T } = useTheme();
  const toggle = (key) => setPreferences((p) => ({ ...p, [key]: !p[key] }));
  const update = (key, val) => setPreferences((p) => ({ ...p, [key]: val }));

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>
        Communication Preferences
      </h2>
      <p style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>
        Choose what updates you'd like to receive. You can change these anytime.
      </p>

      {/* Newsletter */}
      <ToggleRow
        checked={preferences.newsletterOptIn}
        onChange={() => toggle("newsletterOptIn")}
        label="Newsletter & Updates"
        desc="Product updates, new features, and covered call insights"
      />

      {/* Frequency (only if newsletter on) */}
      {preferences.newsletterOptIn && (
        <div style={{ marginLeft: 42, marginBottom: 16 }}>
          <FieldLabel>Email Frequency</FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => update("updateFrequency", opt.value)}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${preferences.updateFrequency === opt.value ? T.accent : T.border}`,
                  background: preferences.updateFrequency === opt.value ? T.accentDim : "transparent",
                  color: preferences.updateFrequency === opt.value ? T.accent : T.textDim,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 1, background: T.border, margin: "16px 0" }} />

      <ToggleRow
        checked={preferences.notifyNewFeatures}
        onChange={() => toggle("notifyNewFeatures")}
        label="New Feature Announcements"
        desc="Be first to know about new tools and capabilities"
      />

      <ToggleRow
        checked={preferences.notifyMarketAlerts}
        onChange={() => toggle("notifyMarketAlerts")}
        label="Market Alert Summaries"
        desc="Weekly digest of notable covered call opportunities"
      />

      <ToggleRow
        checked={preferences.notifyEducation}
        onChange={() => toggle("notifyEducation")}
        label="Educational Content"
        desc="Tips, tutorials, and strategy guides for covered calls"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: PROMO CODE + SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function StepPromo({ promoCode, setPromoCode, applyPromo, promoError, promoSuccess, profile, preferences }) {
  const { T } = useTheme();
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>
        Almost there!
      </h2>
      <p style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>
        Have a promo code? Enter it below. Otherwise, you're all set to start your 7-day free trial.
      </p>

      {/* Promo Code */}
      <FieldLabel>Promo Code (optional)</FieldLabel>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          placeholder="e.g. LAUNCH50"
          maxLength={20}
          style={{ ...inputStyle(T), flex: 1, fontFamily: T.fontMono, letterSpacing: 1 }}
        />
        <button
          onClick={applyPromo}
          disabled={!promoCode.trim()}
          style={{
            padding: "10px 20px", borderRadius: T.r,
            background: promoCode.trim() ? T.accentDim : "rgba(255,255,255,0.03)",
            border: `1px solid ${promoCode.trim() ? "rgba(0,212,170,0.3)" : T.border}`,
            color: promoCode.trim() ? T.accent : T.textMuted,
            fontSize: 12, fontWeight: 700, cursor: promoCode.trim() ? "pointer" : "default",
          }}
        >
          Apply
        </button>
      </div>
      {promoError && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.danger }}>{promoError}</div>
      )}
      {promoSuccess && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.success, fontWeight: 600 }}>
          ✓ {promoSuccess}
        </div>
      )}

      {/* Summary */}
      <div style={{
        marginTop: 28, padding: "20px", borderRadius: T.r,
        background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay, marginBottom: 12 }}>
          YOUR ACCOUNT SUMMARY
        </div>

        <SummaryRow label="Name" value={profile.displayName || "—"} />
        <SummaryRow label="Experience" value={capitalize(profile.experienceLevel) || "—"} />
        <SummaryRow label="Goal" value={goalLabel(profile.investmentGoal)} />
        <SummaryRow label="Newsletter" value={preferences.newsletterOptIn ? `Yes (${preferences.updateFrequency})` : "No"} />
        {promoSuccess && <SummaryRow label="Promo" value={promoCode} accent />}

        <div style={{ height: 1, background: T.border, margin: "12px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>7-Day Free Trial</div>
            <div style={{ fontSize: 11, color: T.textDim }}>Then $10/mo · Cancel anytime</div>
          </div>
          <div style={{
            padding: "6px 14px", borderRadius: 8,
            background: T.accentDim, border: "1px solid rgba(0,212,170,0.15)",
            fontSize: 11, fontWeight: 700, color: T.accent, fontFamily: T.fontMono,
          }}>
            NO CARD REQUIRED
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function FieldLabel({ children, style = {} }) {
  const { T } = useTheme();
  return (
    <label style={{
      display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
      color: T.textDim, fontFamily: T.fontMono, marginBottom: 6,
      textTransform: "uppercase", ...style,
    }}>
      {children}
    </label>
  );
}

function SelectCard({ selected, onClick, label, desc }) {
  const { T } = useTheme();
  return (
    <button onClick={onClick} style={{
      padding: "12px 14px", borderRadius: T.r, textAlign: "left",
      background: selected ? T.accentDim : "rgba(255,255,255,0.02)",
      border: `1px solid ${selected ? "rgba(0,212,170,0.3)" : T.border}`,
      cursor: "pointer", transition: "all 0.15s",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? T.accent : T.text }}>{label}</div>
      <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{desc}</div>
    </button>
  );
}

function ToggleRow({ checked, onChange, label, desc }) {
  const { T } = useTheme();
  return (
    <div
      onClick={onChange}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", cursor: "pointer",
      }}
    >
      {/* Toggle switch */}
      <div style={{
        width: 38, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? T.accent : "rgba(255,255,255,0.1)",
        position: "relative", transition: "background 0.2s",
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: 8,
          background: "#fff", position: "absolute", top: 3,
          left: checked ? 19 : 3,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</div>
        <div style={{ fontSize: 11, color: T.textDim }}>{desc}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, accent }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: T.textDim }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 600, fontFamily: T.fontMono,
        color: accent ? T.accent : T.text,
      }}>{value}</span>
    </div>
  );
}

function inputStyle(T) {
  return {
    width: "100%", padding: "11px 14px", borderRadius: T.r,
    background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`,
    color: T.text, fontSize: 14, fontFamily: T.fontBody,
    outline: "none", boxSizing: "border-box",
  };
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function goalLabel(goal) {
  const map = {
    income: "Generate Income",
    learn: "Learn Strategies",
    hedge: "Hedge Holdings",
    explore: "Just Exploring",
  };
  return map[goal] || "—";
}
