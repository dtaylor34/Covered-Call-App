// ─── src/components/ClosedTradesTab.jsx ──────────────────────────────────────
// Closed covered-call history with estimated tax per row and tax-rate inputs.
// Estimate only — not tax advice. Tier-gating is handled by the Dashboard panel.

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
const HOW = { bought: "Bought back", expired: "Expired worthless", called: "Called away" };
const expShort = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "—";
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function ClosedTradesTab() {
  const { T } = useTheme();
  const { positions, closed } = usePositions();
  const [rates, setRates] = usePersistedState("cc:taxRates", { fed: "24", state: "9.3", niit: false });
  const year = new Date().getFullYear();
  const set = (k) => (e) => setRates({ ...rates, [k]: k === "niit" ? e.target.checked : e.target.value });

  const y = useMemo(
    () => ytdSummary(closed, positions, { fed: Number(rates.fed) || 0, state: Number(rates.state) || 0, niit: !!rates.niit }, year),
    [closed, positions, rates, year]
  );

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const inp = { width: 70, minHeight: 38, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13 };
  const th = { textAlign: "right", padding: "8px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 };
  const td = { textAlign: "right", padding: "8px", color: T.text, fontFamily: T.fontMono, fontSize: 12 };

  return (
    <div role="region" aria-label="Closed trades and tax">
      {/* Tax rate inputs */}
      <div style={{ ...card, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16 }}>Tax estimate</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>Applied to positive realized gains. Estimate only — not tax advice.</div>
        </div>
        <label style={{ fontSize: 11, color: T.textDim }}>Federal %<br /><input value={rates.fed} onChange={set("fed")} style={inp} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>State %<br /><input value={rates.state} onChange={set("state")} style={inp} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, minHeight: 40 }}>
          <input type="checkbox" checked={!!rates.niit} onChange={set("niit")} style={{ width: 18, height: 18 }} /> Add 3.8% NIIT
        </label>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>Est. tax on {year} realized</div>
          <div style={{ color: T.warn, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono }}>{usd(y.realizedTax)}</div>
        </div>
      </div>

      {/* Closed history */}
      <div style={{ ...card, padding: "18px 16px" }}>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: "0 0 12px" }}>Closed covered calls · {year}</h3>
        {y.rows.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 13 }}>No closed calls yet this year. Close a call from the Working tab and it lands here.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr>
                {["Symbol", "Contract", "Closed", "Outcome", "Premium", "Buyback", "Option P&L", "Stock P&L", "Est. tax"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i < 4 ? "left" : "right" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {y.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{r.sym}</td>
                    <td style={{ ...td, textAlign: "left" }}>{expShort(r.expiry)} ${r.strike} ×{r.contracts || 1}</td>
                    <td style={{ ...td, textAlign: "left", color: T.textDim }}>{expShort(r.closedOn)}</td>
                    <td style={{ ...td, textAlign: "left", color: T.textDim }}>{HOW[r.how] || r.how}{r.how === "bought" ? ` at ${usd(r.buyback / ((r.contracts || 1) * 100))}` : r.how === "called" ? ` at ${usd(r.strike)}` : ""}</td>
                    <td style={td}>{usd(r.premium)}</td>
                    <td style={td}>{usd(r.buyback)}</td>
                    <td style={{ ...td, color: r.opt >= 0 ? T.success : T.danger }}>{usd(r.opt, true)}</td>
                    <td style={{ ...td, color: r.stock >= 0 ? T.success : T.danger }}>{usd(r.stock, true)}</td>
                    <td style={{ ...td, color: T.warn }}>{usd(r.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
