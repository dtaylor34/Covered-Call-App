// ─── src/components/SaveViewModal.jsx ────────────────────────────────────────
// Bottom sheet modal for saving or updating a position view.
// Shows a summary of the current position and lets the user name it.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";

export default function SaveViewModal({ position, editingView, onSave, onClose }) {
  const { T } = useTheme();
  const { symbol, contract, stockPrice } = position || {};
  const [name, setName] = useState("");

  useEffect(() => {
    if (editingView) {
      setName(editingView.name);
    } else if (symbol && contract) {
      const expSlice = contract.expiration?.slice(5) || "";
      setName(`${symbol} $${contract.strike?.toFixed(0)} ${expSlice}`);
    }
  }, [editingView, symbol, contract]);

  if (!symbol || !contract) return null;

  const canSave = name.trim().length > 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, padding: "20px 20px 48px", width: "100%", maxWidth: 600, margin: "0 auto" }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: "0 auto 18px" }} />

        <h3 style={{ margin: "0 0 16px", color: T.text, fontWeight: 700, fontSize: 16, fontFamily: T.fontDisplay }}>
          {editingView ? "Update View" : "Save This View"}
        </h3>

        {/* Position summary card */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay }}>{symbol}</span>
            {contract.score != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentDim, borderRadius: 6, padding: "3px 10px", fontFamily: T.fontMono }}>
                Score {contract.score}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SummaryRow label="Strike" value={contract.strike != null ? `$${contract.strike?.toFixed(2)}` : "—"} />
            <SummaryRow label="Expiry" value={contract.expiration?.slice(5) || "—"} />
            <SummaryRow label="Premium" value={contract.premium != null ? `$${(contract.premium * 100).toFixed(0)}` : "—"} color={T.success} />
            <SummaryRow label="Stock Price" value={stockPrice != null ? `$${stockPrice?.toFixed(2)}` : "—"} />
          </div>
        </div>

        {/* Name input */}
        <label style={{ display: "block", fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6, fontFamily: T.fontMono }}>
          View Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AAPL conservative play"
          autoFocus
          style={{
            width: "100%", boxSizing: "border-box",
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: "12px 14px",
            fontSize: 14, color: T.text, outline: "none",
            fontFamily: T.fontBody, marginBottom: 16,
          }}
        />

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: 13, borderRadius: 10, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", fontFamily: T.fontBody, fontSize: 14 }}
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(name.trim())}
            disabled={!canSave}
            style={{
              flex: 2, padding: 13, borderRadius: 10, border: "none",
              background: canSave ? T.accent : T.accentDim,
              color: canSave ? T.bg : T.textDim,
              cursor: canSave ? "pointer" : "default",
              fontFamily: T.fontBody, fontSize: 14, fontWeight: 700,
              transition: "all 0.15s",
            }}
          >
            💾 {editingView ? "Update View" : "Save View"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, color }) {
  const { T } = useTheme();
  return (
    <div style={{ background: T.surface, borderRadius: 8, padding: "10px 12px" }}>
      <p style={{ margin: "0 0 3px", fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: T.fontMono }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: color || T.text, fontFamily: T.fontMono }}>{value}</p>
    </div>
  );
}
