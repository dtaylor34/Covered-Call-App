// ─── src/views/Dashboard.jsx ─────────────────────────────────────────────────
// Main dashboard shell with 7-tab layout, tier-based gating, and shared
// activePosition state that flows from Dashboard → Working/Transactions/Setup.
//
// Tab rendering: all tabs stay mounted (display toggle), so state is never lost.
// Locked tabs show blurred preview with upgrade prompt overlay.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureAccess, TIER_INFO, getRequiredTier } from "../hooks/useFeatureAccess";
import { usePersistedState } from "../hooks/usePersistedState";
import { getFunctions, httpsCallable } from "firebase/functions";
import { AnalyticsEvents } from "../services/analytics";
import { useTheme } from "../contexts/ThemeContext";

import { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import CoveredCallsDashboard from "../components/CoveredCallsDashboard";
import SavedViewsList from "../components/SavedViewsList";
import SaveViewModal from "../components/SaveViewModal";
import WorkingTab from "../components/WorkingTab";
import RiskTab from "../components/RiskTab";
import TransactionsTab from "../components/TransactionsTab";
import GlossaryTab from "../components/GlossaryTab";
import SetupTab from "../components/SetupTab";
import ProfileTab from "../components/ProfileTab";
import SelectionTab from "../components/SelectionTab";

// ── Tab definitions ──
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◉", feature: "dashboard" },
  { id: "selection", label: "Selection", icon: "🎯", feature: "selection" },
  { id: "working",   label: "Working",   icon: "📊", feature: "working" },
  { id: "risk",      label: "Risk",      icon: "⚠",  feature: "risk" },
  { id: "transactions", label: "Trades", icon: "📝", feature: "transactions" },
  { id: "glossary",  label: "Glossary",  icon: "📖", feature: "glossary" },
  { id: "setup",     label: "Setup",     icon: "🔧", feature: "setup" },
  { id: "profile",   label: "Profile",   icon: "👤", feature: "profile" },
];

// ── Locked Overlay ──
function LockedOverlay({ feature }) {
  const { T } = useTheme();
  const requiredTier = getRequiredTier(feature);
  const tierInfo = TIER_INFO[requiredTier] || TIER_INFO.advanced;

  return (
    <div role="dialog" aria-label={`Feature locked — ${tierInfo.label} plan required`} aria-modal="false" style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(5,7,11,0.75)", backdropFilter: "blur(8px)",
      borderRadius: T.r,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rL,
        padding: "32px 40px", textAlign: "center", maxWidth: 360,
      }}>
        <div aria-hidden="true" style={{
          width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px",
          background: tierInfo.bg, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: tierInfo.color, fontWeight: 900,
        }}>🔒</div>
        <h3 style={{
          color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: "0 0 8px",
        }}>
          {tierInfo.label} Feature
        </h3>
        <p style={{ color: T.textDim, fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
          Upgrade to the <strong style={{ color: tierInfo.color }}>{tierInfo.label}</strong> plan to unlock this feature.
        </p>
        <div style={{ marginBottom: 16 }}>
          {tierInfo.features.slice(0, 4).map((f, i) => (
            <div key={i} style={{
              color: T.textDim, fontSize: 11, padding: "3px 0",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span aria-hidden="true" style={{ color: tierInfo.color }}>✓</span> {f}
            </div>
          ))}
        </div>
        <a href="/upgrade" aria-label={`Upgrade to ${tierInfo.label} plan`} style={{
          display: "inline-block", padding: "10px 28px", borderRadius: 8,
          background: tierInfo.color, color: T.bg, textDecoration: "none",
          fontSize: 13, fontWeight: 700, fontFamily: T.fontBody,
        }}>
          Upgrade to {tierInfo.label} →
        </a>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { T, isMobile } = useTheme();
  const {
    email, name, trialInfo, subscriptionStatus, logout,
    searchHistory, hasFreeAccessCode,
  } = useAuth();
  const { canAccess, plan } = useFeatureAccess();

  const isTrial = subscriptionStatus === "trial";
  const isActive = subscriptionStatus === "active";
  const [billingLoading, setBillingLoading] = useState(false);

  // Persisted active tab
  const [activeTab, setActiveTab] = usePersistedState("cc:tab", "dashboard");

  // Dashboard sub-tabs: "finder" | "saved"
  const [dashSubTab, setDashSubTab] = useState("finder");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingView, setEditingView] = useState(null);

  // Shared active position — flows from Dashboard → Working, Transactions, Setup
  const [activePosition, setActivePosition] = usePersistedState("cc:position", {
    symbol: null, contract: null,
  });

  // ── Sticky header: hides on scroll down, reappears on scroll up ──
  const headerRef = useRef(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) {
        // At the top — always show
        setIsHeaderVisible(true);
      } else if (currentY > lastScrollY.current && currentY > 80) {
        // Scrolling down past threshold — hide header
        setIsHeaderVisible(false);
      } else if (currentY < lastScrollY.current) {
        // Scrolling up — show header
        setIsHeaderVisible(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handlePositionChange = useCallback((pos) => {
    setActivePosition(pos);
  }, []);

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

  // ── Save / Update a view to Firestore ──
  const handleSaveView = async (name) => {
    if (!currentUser?.uid || !activePosition?.symbol || !activePosition?.contract) return;
    const db = getFirestore();
    const payload = {
      name,
      symbol: activePosition.symbol,
      stockPrice: activePosition.contract.stockPrice || null,
      contract: {
        strike: activePosition.contract.strike,
        expiration: activePosition.contract.expiration,
        premium: activePosition.contract.premium != null ? activePosition.contract.premium / 100 : null,
        score: activePosition.contract.score,
      },
      updatedAt: serverTimestamp(),
    };
    if (editingView) {
      await updateDoc(doc(db, "users", currentUser.uid, "savedViews", editingView.id), payload);
    } else {
      await addDoc(collection(db, "users", currentUser.uid, "savedViews"), {
        ...payload, createdAt: serverTimestamp(),
      });
    }
    setShowSaveModal(false);
    setEditingView(null);
    setDashSubTab("saved");
  };

  const handleEditView = (view) => {
    setEditingView(view);
    setDashSubTab("finder");
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontBody }}>

      {/* ── Fixed Header — slides away on scroll down, returns on scroll up ── */}
      <div ref={headerRef} role="banner" aria-label="App header" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.3s ease",
        background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        boxShadow: isHeaderVisible ? `0 2px 12px ${T.overlay}` : "none",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "10px 14px" : "12px 20px",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(135deg, ${T.accent}, #00b894)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 900, color: T.bg, fontFamily: T.fontDisplay,
            }}>CC</div>
            <div>
              <div style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>
                Covered Calls Manager
              </div>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>{email}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {/* Plan badge */}
            <span role="status" aria-label={`Current plan: ${isTrial ? "free trial" : hasFreeAccessCode ? "family access" : plan}`} style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 9, fontWeight: 700,
              fontFamily: T.fontMono, letterSpacing: 1,
              background: isTrial ? T.accentDim : hasFreeAccessCode ? "rgba(245,158,11,0.12)" : TIER_INFO[plan]?.bg || T.proDim,
              color: isTrial ? T.accent : hasFreeAccessCode ? T.owner : TIER_INFO[plan]?.color || T.pro,
            }}>
              {isTrial ? "TRIAL" : hasFreeAccessCode ? "FAMILY" : plan.toUpperCase()}
            </span>
            <button aria-label="Sign out of your account" onClick={() => { AnalyticsEvents.logoutClicked(); logout(); }} style={{
              padding: "5px 12px", borderRadius: 6,
              background: "transparent", border: `1px solid ${T.border}`,
              color: T.textDim, fontSize: 10, cursor: "pointer", fontFamily: T.fontBody,
            }}>Sign Out</button>
            {isActive && (
              <button aria-label="Manage billing and subscription" onClick={handleManageBilling} disabled={billingLoading} style={{
                padding: "5px 12px", borderRadius: 6,
                background: "transparent", border: `1px solid ${T.border}`,
                color: T.textDim, fontSize: 10, cursor: billingLoading ? "wait" : "pointer",
                fontFamily: T.fontBody, opacity: billingLoading ? 0.6 : 1,
              }}>{billingLoading ? "..." : "Billing"}</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Fixed Tab Bar — sits below header, slides up when header hides ── */}
      <nav role="tablist" aria-label="Dashboard navigation" style={{
        position: "fixed",
        top: isHeaderVisible ? (isMobile ? 52 : 56) : 0,
        left: 0, right: 0,
        zIndex: 45,
        background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        transition: "top 0.3s ease, box-shadow 0.3s ease",
        boxShadow: !isHeaderVisible ? `0 2px 8px ${T.overlay}` : "none",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex",
          padding: "0 8px",
          overflowX: "auto", overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}>
          {TABS.map((tab) => {
            const isTabActive = activeTab === tab.id;
            const isLocked = !canAccess(tab.feature);
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isTabActive}
                aria-label={`${tab.label} tab${isLocked ? " (locked — upgrade required)" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: isMobile ? "8px 10px" : "10px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: isTabActive ? `2px solid ${T.accent}` : "2px solid transparent",
                  color: isTabActive ? T.accent : isLocked ? T.textDim : T.text,
                  fontSize: isMobile ? 10 : 11,
                  fontWeight: isTabActive ? 700 : 500,
                  fontFamily: T.fontMono,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 4,
                  whiteSpace: "nowrap", flexShrink: 0,
                  opacity: isLocked ? 0.7 : 1,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: isMobile ? 11 : 12 }}>{tab.icon}</span>
                {tab.label}
                {isLocked && <span aria-hidden="true" style={{ fontSize: 8 }}>🔒</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Spacer for fixed header + tab bar ── */}
      <div aria-hidden="true" style={{ height: isMobile ? 92 : 100 }} />

      {/* ── Main Content ── */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "12px" : "16px 24px" }}>

        {/* ── Trial Banner ── */}
        {isTrial && (
          <div role="alert" aria-label={`${trialInfo.daysLeft} days left in free trial`} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "10px 16px", marginBottom: 16, flexWrap: "wrap",
            background: trialInfo.daysLeft <= 2 ? T.warnDim : T.accentDim,
            border: `1px solid ${trialInfo.daysLeft <= 2 ? "rgba(245,158,11,0.3)" : "rgba(0,212,170,0.2)"}`,
            borderRadius: T.r,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: trialInfo.daysLeft <= 2 ? T.warn : T.accent }}>
                {trialInfo.daysLeft <= 2 ? "⚡" : "🎯"} {trialInfo.daysLeft} day{trialInfo.daysLeft !== 1 ? "s" : ""} left
              </div>
              <div style={{ width: 160, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 4 }}>
                <div style={{ width: `${trialInfo.percentUsed}%`, height: "100%", background: trialInfo.daysLeft <= 2 ? T.warn : T.accent, borderRadius: 2 }} />
              </div>
            </div>
            <a href="/upgrade" aria-label="Upgrade your subscription" style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: T.accent, color: T.bg, textDecoration: "none",
            }}>Upgrade</a>
          </div>
        )}

        {/* ── Tab Content (display toggle — all stay mounted) ── */}

        {/* Dashboard — with Position Finder / Saved Views sub-tabs */}
        <div role="tabpanel" aria-label="Dashboard" style={{ display: activeTab === "dashboard" ? "block" : "none" }}>

          {/* Sub-tab toggle */}
          <div style={{ display: "flex", gap: 4, background: T.surface, borderRadius: 10, padding: 4, marginBottom: 16, border: `1px solid ${T.border}` }}>
            {[{ id: "finder", label: "📊 Position Finder" }, { id: "saved", label: "📌 Saved Views" }].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setDashSubTab(id)}
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                  background: dashSubTab === id ? T.accentDim : "transparent",
                  color: dashSubTab === id ? T.accent : T.textDim,
                  fontWeight: dashSubTab === id ? 700 : 400,
                  fontSize: isMobile ? 11 : 12, fontFamily: T.fontBody,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Position Finder */}
          {dashSubTab === "finder" && (
            <>
              <CoveredCallsDashboard onPositionChange={handlePositionChange} />
              {/* Save View button — only shown when a contract is selected */}
              {activePosition?.contract && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => { setEditingView(null); setShowSaveModal(true); }}
                    style={{
                      width: "100%", padding: 13, borderRadius: 10,
                      background: T.accentDim, border: `1px solid ${T.accent}44`,
                      color: T.accent, cursor: "pointer",
                      fontFamily: T.fontBody, fontSize: 13, fontWeight: 700,
                    }}
                  >
                    💾 Save This View
                  </button>
                </div>
              )}
            </>
          )}

          {/* Saved Views */}
          {dashSubTab === "saved" && (
            <SavedViewsList onEditView={handleEditView} />
          )}
        </div>

        {/* Selection (basic -- always unlocked) */}
        <div role="tabpanel" aria-label="Position selection and analysis" style={{ display: activeTab === "selection" ? "block" : "none" }}>
          <SelectionTab onNavigateToGlossary={() => setActiveTab("glossary")} />
        </div>

        {/* Working (tier-gated) */}
        <div role="tabpanel" aria-label="Working P&L analysis" style={{ display: activeTab === "working" ? "block" : "none", position: "relative", minHeight: 300 }}>
          {!canAccess("working") && <LockedOverlay feature="working" />}
          <div style={{ filter: !canAccess("working") ? "blur(4px)" : "none", pointerEvents: !canAccess("working") ? "none" : "auto" }}>
            <WorkingTab activePosition={activePosition} />
          </div>
        </div>

        {/* Risk (tier-gated) */}
        <div role="tabpanel" aria-label="Risk scenarios" style={{ display: activeTab === "risk" ? "block" : "none", position: "relative", minHeight: 300 }}>
          {!canAccess("risk") && <LockedOverlay feature="risk" />}
          <div style={{ filter: !canAccess("risk") ? "blur(4px)" : "none", pointerEvents: !canAccess("risk") ? "none" : "auto" }}>
            <RiskTab />
          </div>
        </div>

        {/* Transactions (tier-gated) */}
        <div role="tabpanel" aria-label="Transaction log" style={{ display: activeTab === "transactions" ? "block" : "none", position: "relative", minHeight: 300 }}>
          {!canAccess("transactions") && <LockedOverlay feature="transactions" />}
          <div style={{ filter: !canAccess("transactions") ? "blur(4px)" : "none", pointerEvents: !canAccess("transactions") ? "none" : "auto" }}>
            <TransactionsTab activePosition={activePosition} />
          </div>
        </div>

        {/* Glossary (basic — always unlocked) */}
        <div role="tabpanel" aria-label="Glossary" style={{ display: activeTab === "glossary" ? "block" : "none" }}>
          <GlossaryTab />
        </div>

        {/* Setup (tier-gated — expert) */}
        <div role="tabpanel" aria-label="Broker setup guides" style={{ display: activeTab === "setup" ? "block" : "none", position: "relative", minHeight: 300 }}>
          {!canAccess("setup") && <LockedOverlay feature="setup" />}
          <div style={{ filter: !canAccess("setup") ? "blur(4px)" : "none", pointerEvents: !canAccess("setup") ? "none" : "auto" }}>
            <SetupTab activePosition={activePosition} />
          </div>
        </div>

        {/* Profile (always unlocked) */}
        <div role="tabpanel" aria-label="Profile and settings" style={{ display: activeTab === "profile" ? "block" : "none" }}>
          <ProfileTab />
        </div>

        {/* ── Financial Disclaimer ── */}
        <aside aria-label="Financial disclaimer" style={{
          marginTop: 32, padding: "14px 18px", borderRadius: T.r,
          border: `1px solid ${T.border}`, background: T.surface,
        }}>
          <p style={{
            fontSize: 10, color: T.textDim, lineHeight: 1.5, textAlign: "center",
            fontFamily: T.fontBody, margin: 0,
          }}>
            <strong style={{ color: T.textMuted }}>Disclaimer:</strong> Covered Calls Manager provides informational data and analytical tools only.
            Nothing on this platform constitutes investment advice, a recommendation, or an offer to buy or sell securities.
            Options trading involves significant risk and is not appropriate for all investors. Past performance does not guarantee future results.
            Always consult a qualified financial advisor before making investment decisions. Market data may be delayed.
          </p>
        </aside>

      </main>

      {/* ── Save View Modal ── */}
      {showSaveModal && (
        <SaveViewModal
          position={activePosition}
          editingView={editingView}
          onSave={handleSaveView}
          onClose={() => { setShowSaveModal(false); setEditingView(null); }}
        />
      )}

    </div>
  );
}
