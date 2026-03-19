// ─── src/views/SchwabCallback.jsx ────────────────────────────────────────────
// Handles the Schwab OAuth redirect after the user authenticates.
// Route: /api/schwab/callback
// Branch: feature/api-integration
//
// Flow:
//   1. Schwab redirects here with ?code=XXX
//   2. This component calls the schwabExchangeToken Cloud Function
//   3. Function stores tokens + fetches account list
//   4. User is redirected back to the main dashboard → APIs tab
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleSchwabCallback } from "../services/schwabApi";
import { useTheme } from "../contexts/ThemeContext";

export default function SchwabCallback() {
  const { T } = useTheme();
  const navigate  = useNavigate();
  const [status, setStatus]   = useState("exchanging"); // exchanging | success | error
  const [message, setMessage] = useState("Completing Schwab connection...");
  const [accounts, setAccounts] = useState(0);

  useEffect(() => {
    async function exchange() {
      try {
        const result = await handleSchwabCallback();
        setAccounts(result.accountCount || 0);
        setStatus("success");
        setMessage("Schwab connected successfully!");
        // Redirect to dashboard after 2 seconds
        setTimeout(() => navigate("/", { replace: true }), 2000);
      } catch (err) {
        console.error("SchwabCallback error:", err);
        setStatus("error");
        setMessage(err.message || "Connection failed. Please try again.");
      }
    }
    exchange();
  }, []); // eslint-disable-line

  const colors = {
    exchanging: T.accent,
    success:    T.success,
    error:      T.danger,
  };
  const icons = {
    exchanging: null,
    success:    "✓",
    error:      "✕",
  };
  const color = colors[status];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, fontFamily: T.fontBody, color: T.text,
    }}>
      <div style={{
        maxWidth: 420, width: "90%", padding: 32, textAlign: "center",
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rL,
      }}>
        {/* Spinner or icon */}
        {status === "exchanging" ? (
          <div style={{
            width: 48, height: 48, borderRadius: "50%", margin: "0 auto 20px",
            border: `3px solid ${T.border}`, borderTopColor: T.accent,
            animation: "spin 0.8s linear infinite",
          }} />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: "50%", margin: "0 auto 20px",
            background: color + "18", color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700,
          }}>
            {icons[status]}
          </div>
        )}

        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: T.fontDisplay, marginBottom: 10 }}>
          {status === "exchanging" ? "Connecting to Schwab" :
           status === "success"    ? "Connection Complete" :
           "Connection Failed"}
        </div>

        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, marginBottom: 16 }}>
          {message}
        </div>

        {status === "success" && accounts > 0 && (
          <div style={{
            padding: "10px 16px", borderRadius: 8,
            background: T.successDim, border: `1px solid ${T.success}33`,
            color: T.success, fontSize: 13, fontFamily: T.fontMono, marginBottom: 16,
          }}>
            {accounts} account{accounts !== 1 ? "s" : ""} linked
          </div>
        )}

        {status === "success" && (
          <div style={{ color: T.textMuted, fontSize: 12, fontFamily: T.fontMono }}>
            Redirecting to dashboard...
          </div>
        )}

        {status === "error" && (
          <button
            onClick={() => navigate("/", { replace: true })}
            style={{
              padding: "12px 24px", borderRadius: 8, border: "none",
              background: T.accent, color: T.bg,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.fontBody,
            }}
          >
            Back to Dashboard
          </button>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
