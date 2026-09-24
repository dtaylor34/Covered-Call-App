// ─── src/components/YearToDateStrip.jsx ──────────────────────────────────────
// Year-to-date summary for the Dashboard: premium realized, stock gains
// realized, open P&L, estimated tax on premium, net after tax, and account
// health. Estimate only — not tax advice.

import { useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { usePositions } from "../hooks/usePositions";
import { usePersistedState } from "../hooks/usePersistedState";
import { ytdSummary } from "../lib/ytd";

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};

export default function YearToDateStrip() {
  const { T } = useTheme();
  const { positions, closed } = usePositions();
  const [rates] = usePersistedState("cc:taxRates", { fed: "24", state: "9.3", niit: false });
  const year = new Date().getFullYear();

  const y = useMemo(
    () => ytdSummary(closed, positions, { fed: Number(rates.fed) || 0, state: Number(rates.state) || 0, niit: !!rates.niit }, year),
    [closed, positions, rates, year]
  );

  if (!positions.length && !closed.length) return null;

  const cell = (label, value, color, sub) => (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 22, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 }} role="region" aria-label="Year to date summary">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>{year} Year to date</h3>
        <span style={{ color: T.textDim, fontSize: 11 }}>estimate — not tax advice</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14 }}>
        {cell("Premium realized", usd(y.premiumRealized, true), y.premiumRealized >= 0 ? T.success : T.danger, `${y.closedCount} closed, after buy-backs`)}
        {cell("Stock gains realized", usd(y.stockRealized, true), y.stockRealized >= 0 ? T.success : T.danger, "From shares called away")}
        {cell("Open P&L", usd(y.openPL, true), y.openPL >= 0 ? T.success : T.danger, "If closed now")}
        {cell("Est. tax on premium", usd(y.premTax), T.warn, `at ${(y.rate * 100).toFixed(1)}%`)}
        {cell("Net after tax", usd(y.net, true), y.net >= 0 ? T.success : T.danger, "Realized + open, post-tax")}
        {cell("Account health", `${(y.accountHealth * 100).toFixed(1)}%`, T.accent, "Value + premium vs cost")}
      </div>
    </div>
  );
}
