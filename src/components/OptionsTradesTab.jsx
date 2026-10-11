// ─── src/components/OptionsTradesTab.jsx ─────────────────────────────────────
// Options Manager → Trades: a flat chronological transaction log — every open
// and every close as its own line item, with cash flow per row and running
// totals. Complements History (which groups into closed trades). CSV export.

import { useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionPositions } from "../hooks/useOptionPositions";
import { optType, isLong, closedOptionPnL } from "../lib/optionsMath";

const usd = (n, signed) => { const a = Math.abs(n || 0); const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s; return (n < -0.005 ? "−" : "") + s; };
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const csExp = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}` : ""; };
const dstr = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "—");

function buildTxns(positions, closed) {
  const out = [];
  const contract = (r) => `${r.sym} ${optType(r)} $${r.strike} ${csExp(r.expiry)}`;
  // Open legs still working
  for (const p of positions) {
    const qty = Math.max(1, Math.round(p.contracts || 1)), mult = Number(p.multiplier) || 100, price = Number(p.fillPrice) || 0;
    out.push({ ms: p.openedAtMs ?? 0, date: dstr(p.openedAtMs), action: isLong(p) ? "Buy to open" : "Sell to open", contract: contract(p), qty, price, cash: (isLong(p) ? -1 : 1) * price * mult * qty, status: "open", acct: p.acct || "" });
  }
  // Closed: the open + the close
  for (const r of closed) {
    const qty = Math.max(1, Math.round(r.contracts || 1)), mult = Number(r.multiplier) || 100;
    const fill = r.fillPrice != null ? Number(r.fillPrice) : null, exit = Number(r.exitPrice) || 0;
    if (fill != null) out.push({ ms: r.openedAtMs ?? 0, date: dstr(r.openedAtMs), action: isLong(r) ? "Buy to open" : "Sell to open", contract: contract(r), qty, price: fill, cash: (isLong(r) ? -1 : 1) * fill * mult * qty, status: "closed", acct: r.acct || "" });
    const closeAction = r.how === "expired" ? "Expired" : r.how === "exercised" ? (isLong(r) ? "Exercised" : "Assigned") : (isLong(r) ? "Sell to close" : "Buy to close");
    const closeCash = r.how === "expired" ? 0 : (isLong(r) ? 1 : -1) * exit * mult * qty;
    out.push({ ms: r.closedOnMs ?? 0, date: dstr(r.closedOnMs), action: closeAction, contract: contract(r), qty, price: r.how === "expired" ? 0 : exit, cash: closeCash, status: "closed", acct: r.acct || "" });
  }
  return out.sort((a, b) => (b.ms || 0) - (a.ms || 0));
}

export default function OptionsTradesTab() {
  const { T } = useTheme();
  const { positions, closed } = useOptionPositions();
  const txns = useMemo(() => buildTxns(positions, closed), [positions, closed]);
  const realized = useMemo(() => (closed || []).reduce((a, r) => { const p = closedOptionPnL(r); return a + (p.pl || 0); }, 0), [closed]);
  const netCash = useMemo(() => txns.reduce((a, t) => a + (t.cash || 0), 0), [txns]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const font = T.fontMono;
  const th = { textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, fontFamily: font };
  const td = { textAlign: "right", padding: "8px 10px", color: T.text, fontFamily: font, fontSize: 12.5, borderBottom: `1px solid ${T.border}` };
  const actionColor = (a) => (a.includes("Buy to open") || a === "Exercised" || a === "Assigned" ? T.text : a.includes("to close") || a.includes("Sell to open") ? T.text : T.textDim);

  const exportCsv = () => {
    const rows = [["Date", "Action", "Contract", "Qty", "Price", "Cash flow", "Status", "Account"], ...txns.map((t) => [t.date, t.action, t.contract, t.qty, t.price, t.cash.toFixed(2), t.status, t.acct])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "options-trades.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div role="region" aria-label="Options trades">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Trades · Transaction log</h2>
        {txns.length > 0 && <button onClick={exportCsv} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, cursor: "pointer", background: "transparent", color: T.textDim, fontFamily: font, fontSize: 12, fontWeight: 700 }}>⬇ Export CSV</button>}
      </div>

      {txns.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "44px 20px", color: T.textDim }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📝</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 6 }}>No transactions yet</div>
          <div style={{ fontSize: 13 }}>Open or close options in the Working tab and every action is logged here.</div>
        </div>
      ) : (<>
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <Tot T={T} label="Transactions" value={String(txns.length)} />
          <Tot T={T} label="Realized P&L" value={usd(realized, true)} color={realized >= 0 ? T.success : T.danger} />
          <Tot T={T} label="Net cash flow" value={usd(netCash, true)} color={netCash >= 0 ? T.success : T.danger} />
        </div>
        <div style={{ ...card, padding: "16px 10px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead><tr>{["Date", "Action", "Contract", "Qty", "Price", "Cash flow", ""].map((h, i) => <th key={h} style={{ ...th, textAlign: i < 3 ? "left" : i === 6 ? "center" : "right" }}>{h}</th>)}</tr></thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={i}>
                  <td style={{ ...td, textAlign: "left", color: T.textDim }}>{t.date}</td>
                  <td style={{ ...td, textAlign: "left", fontWeight: 700, color: actionColor(t.action) }}>{t.action}</td>
                  <td style={{ ...td, textAlign: "left" }}>{t.contract}</td>
                  <td style={td}>{t.qty}</td>
                  <td style={td}>{t.price ? usd(t.price) : "—"}</td>
                  <td style={{ ...td, color: t.cash > 0 ? T.success : t.cash < 0 ? T.danger : T.textDim, fontWeight: 700 }}>{t.cash ? usd(t.cash, true) : "—"}</td>
                  <td style={{ ...td, textAlign: "center", color: T.textDim, fontSize: 10 }}>{t.status === "open" ? "● open" : "closed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ color: T.textMuted || T.textDim, fontSize: 11, fontFamily: font }}>
          Cash flow: premium paid shows negative (buys), premium received positive (sells). Realized P&L counts only closed trades. Expiries show $0.
        </div>
      </>)}
    </div>
  );
}

function Tot({ T, label, value, color }) {
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
