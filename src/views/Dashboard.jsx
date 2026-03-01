// ─── src/views/Dashboard.jsx ─────────────────────────────────────────────────
// Main user dashboard. Replace the placeholder content below with your
// actual covered calls App.jsx component.

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { AnalyticsEvents } from "../services/analytics";
import { T } from "../theme";
import CoveredCallsDashboard from "../components/CoveredCallsDashboard";

export default function Dashboard() {
  const { email, name, trialInfo, subscriptionStatus, logout, searchHistory } = useAuth();
  const isTrial = subscriptionStatus === "trial";
  const isActive = subscriptionStatus === "active";
  const historyCount = (searchHistory || []).length;
  const [billingLoading, setBillingLoading] = useState(false);

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

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontBody, padding: "20px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", marginBottom: 16,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, #00b894)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.bg, fontFamily: T.fontDisplay }}>CC</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Covered Calls Manager</div>
              <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{email}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link to="/history" style={{
              padding: "6px 14px", borderRadius: 6,
              background: historyCount > 0 ? T.proDim : "transparent",
              border: `1px solid ${historyCount > 0 ? "rgba(129,140,248,0.2)" : T.border}`,
              color: historyCount > 0 ? T.pro : T.textDim,
              fontSize: 11, fontWeight: 600, textDecoration: "none",
              fontFamily: T.fontMono, display: "flex", alignItems: "center", gap: 5,
            }}>
              📋 History{historyCount > 0 && <span style={{
                background: "rgba(129,140,248,0.2)", borderRadius: 4,
                padding: "1px 5px", fontSize: 10, fontWeight: 700,
              }}>{historyCount}</span>}
            </Link>
            <span style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1,
              background: isTrial ? T.accentDim : "rgba(129,140,248,0.12)",
              color: isTrial ? T.accent : "#818cf8",
            }}>
              {isTrial ? "FREE TRIAL" : "PRO MEMBER"}
            </span>
            <button onClick={() => { AnalyticsEvents.logoutClicked(); logout(); }} style={{
              padding: "6px 14px", borderRadius: 6,
              background: "transparent", border: `1px solid ${T.border}`,
              color: T.textDim, fontSize: 11, cursor: "pointer", fontFamily: T.fontBody,
            }}>Sign Out</button>
            {isActive && (
              <button onClick={handleManageBilling} disabled={billingLoading} style={{
                padding: "6px 14px", borderRadius: 6,
                background: "transparent", border: `1px solid ${T.border}`,
                color: T.textDim, fontSize: 11, cursor: billingLoading ? "wait" : "pointer",
                fontFamily: T.fontBody, opacity: billingLoading ? 0.6 : 1,
              }}>{billingLoading ? "..." : "Billing"}</button>
            )}
          </div>
        </div>

        {/* Trial banner */}
        {isTrial && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            padding: "12px 20px", marginBottom: 16,
            background: trialInfo.daysLeft <= 2 ? T.warnDim : T.accentDim,
            border: `1px solid ${trialInfo.daysLeft <= 2 ? "rgba(245,158,11,0.3)" : "rgba(0,212,170,0.2)"}`,
            borderRadius: T.r,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: trialInfo.daysLeft <= 2 ? T.warn : T.accent }}>
                {trialInfo.daysLeft <= 2 ? "⚡" : "🎯"} {trialInfo.daysLeft} day{trialInfo.daysLeft !== 1 ? "s" : ""} left in your free trial
              </div>
              <div style={{ width: 200, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 6 }}>
                <div style={{ width: `${trialInfo.percentUsed}%`, height: "100%", background: trialInfo.daysLeft <= 2 ? T.warn : T.accent, borderRadius: 2 }} />
              </div>
            </div>
            <a href="/upgrade" style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: T.accent, color: T.bg, textDecoration: "none",
            }}>Upgrade — $10/mo</a>
          </div>
        )}

        {/* ── Covered Calls Dashboard ── */}
        <CoveredCallsDashboard />

        {/* ── Financial Disclaimer ── */}
        <div style={{
          marginTop: 32, padding: "16px 20px", borderRadius: T.r,
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
        </div>

      </div>
    </div>
  );
}
