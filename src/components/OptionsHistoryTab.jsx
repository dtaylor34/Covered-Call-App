// ─── src/components/OptionsHistoryTab.jsx ────────────────────────────────────
// Options Manager → History: closed option positions (expired / sold / exercised)
// with per-trade lifecycle charts, realized P&L, inline edits, and a full-page
// Monthly P&L track record. Mirrors the Covered Calls Trade History.

import { useState, useMemo, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionPositions } from "../hooks/useOptionPositions";
import { closedOptionPnL, optType, isLong } from "../lib/optionsMath";
import ClosedTradeChart from "./ClosedTradeChart";

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const csExp = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}` : ""; };
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return `${MONTH3[(m || 1) - 1]} '${String(y).slice(-2)}`; };
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);

const howLabel = (r) => {
  if (r.how === "expired") return "Expired worthless";
  if (r.how === "exercised") return isLong(r) ? "Exercised" : "Assigned";
  return isLong(r) ? "Sold to close" : "Bought to close";
};
const chartReason = (how) => (how === "expired" ? "expired" : how === "exercised" ? "called" : "sold");

export default function OptionsHistoryTab() {
  const { T } = useTheme();
  const { closed, updateClosed, deleteClosed } = useOptionPositions();
  const [open, setOpen] = useState({});
  const [showMonthly, setShowMonthly] = useState(false);
  const font = T.fontMono;

  const rows = useMemo(() => [...(closed || [])].sort((a, b) => (b.closedOnMs || 0) - (a.closedOnMs || 0)), [closed]);
  const totals = useMemo(() => rows.reduce((a, r) => {
    const p = closedOptionPnL(r);
    return { flow: a.flow + (p.entryVal != null ? Math.abs(p.entryVal) : 0), realized: a.realized + (p.pl || 0), wins: a.wins + (p.pl > 0 ? 1 : 0), known: a.known + (p.premiumKnown ? 1 : 0), n: a.n + 1 };
  }, { flow: 0, realized: 0, wins: 0, known: 0, n: 0 }), [rows]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const cell = { fontFamily: font, fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 };
  const COLS = "150px 90px 70px 100px 130px 130px 26px";

  return (
    <div role="region" aria-label="Options history">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Options History</h2>
        {rows.length > 0 && (
          <button onClick={() => setShowMonthly(true)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: T.accent, color: "#0A0A0A", fontFamily: font, fontSize: 12, fontWeight: 700 }}>📅 Monthly P&L</button>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "44px 20px" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📜</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 6 }}>No closed options yet</div>
          <div style={{ color: T.textDim, fontSize: 13, maxWidth: 460, margin: "0 auto" }}>Close an option from the Working tab (sell/buy to close, expired, or exercised) and it lands here with its full lifecycle chart.</div>
        </div>
      ) : (<>
        {/* realized totals */}
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          <Tot T={T} label="Closed trades" value={String(totals.n)} />
          <Tot T={T} label="Premium flow" value={usd(totals.flow)} color={T.success} tip="Total premium that moved on entry across all closed options (paid for longs, received for shorts)." />
          <Tot T={T} label="Realized P&L" value={usd(totals.realized, true)} color={totals.realized >= 0 ? T.success : T.danger} tip={`Net realized profit/loss on closed options.${totals.known < totals.n ? ` Excludes ${totals.n - totals.known} with an unknown entry price — add it in the row.` : ""}`} />
          <Tot T={T} label="Win rate" value={`${totals.wins}/${totals.known} (${totals.known ? Math.round((totals.wins / totals.known) * 100) : 0}%)`} tip="Closed options with a positive realized P&L (of those with a known entry price)." />
        </div>

        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "9px 16px", borderBottom: `1px solid ${T.border}` }}>
              {["Contract", "Side", "Strike", "Closed", "Entry → Exit", "Realized", ""].map((h, i) => (
                <div key={i} style={{ color: T.textDim, fontSize: 9, fontFamily: font, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
              ))}
            </div>
            {rows.map((r) => {
              const isOpen = !!open[r.id];
              const p = closedOptionPnL(r);
              const long = isLong(r);
              return (
                <div key={r.id} style={{ borderBottom: `1px solid ${T.border}`, background: isOpen ? T.card : "transparent" }}>
                  <div onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} style={{ cursor: "pointer", padding: "10px 16px", display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                    <div style={{ ...cell, fontWeight: 700 }}>{r.sym} {optType(r)} {csExp(r.expiry)}</div>
                    <div style={{ ...cell, color: long ? T.success : T.danger, fontWeight: 700 }}>{long ? "LONG" : "SHORT"} ×{p.qty}</div>
                    <div style={cell}>{usd(r.strike)}</div>
                    <div style={{ ...cell, color: T.textDim }}>{r.closedOn}</div>
                    <div style={cell}>{p.premiumKnown ? usd(r.fillPrice) : "—"} → {usd(r.exitPrice)}</div>
                    <div style={{ ...cell, color: p.pl == null ? T.textDim : p.pl >= 0 ? T.success : T.danger, fontWeight: 700 }}>
                      {p.pl == null ? "add entry" : usd(p.pl, true)}
                      <div style={{ color: T.textDim, fontSize: 10, fontWeight: 400 }}>{howLabel(r)}{p.daysHeld != null ? ` · ${p.daysHeld}d` : ""}</div>
                    </div>
                    <div style={{ ...cell, textAlign: "right", color: T.textDim, transform: isOpen ? "rotate(180deg)" : "none" }}>▾</div>
                  </div>
                  {isOpen && <OptionClosedDetail T={T} r={r} p={p} onUpdate={updateClosed} onDelete={deleteClosed} />}
                </div>
              );
            })}
          </div>
        </div>
      </>)}

      {showMonthly && <OptionsMonthlyPnL closed={rows} onBack={() => setShowMonthly(false)} />}
    </div>
  );
}

function OptionClosedDetail({ T, r, p, onUpdate, onDelete }) {
  const font = T.fontMono;
  const [confirmDel, setConfirmDel] = useState(false);
  const box = { textAlign: "center", padding: "10px 8px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` };
  const lbl = { color: T.textDim, fontSize: 9, fontFamily: font, letterSpacing: 1, textTransform: "uppercase" };
  const val = { fontSize: 16, fontWeight: 700, fontFamily: font, marginTop: 4 };
  const editStyle = { width: 120, minHeight: 36, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };
  const call = optType(r) === "CALL";
  const breakeven = (Number(r.strike) > 0 && p.premiumKnown) ? (call ? Number(r.strike) + r.fillPrice : Number(r.strike) - r.fillPrice) : null;
  const ghost = { padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: font, fontSize: 12, cursor: "pointer" };

  return (
    <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, margin: "14px 0" }}>
        <div style={box}><div style={lbl}>{p.long ? "Paid" : "Received"}</div><div style={{ ...val, color: T.text }}>{p.entryVal != null ? usd(Math.abs(p.entryVal)) : "—"}</div></div>
        <div style={box}><div style={lbl}>Exit value</div><div style={{ ...val, color: T.text }}>{usd(p.exitVal)}</div></div>
        <div style={box}><div style={lbl}>Realized</div><div style={{ ...val, color: p.pl == null ? T.textDim : p.pl >= 0 ? T.success : T.danger }}>{p.pl == null ? "—" : usd(p.pl, true)}</div></div>
        <div style={box}><div style={lbl}>Breakeven</div><div style={{ ...val, color: T.warn }}>{breakeven != null ? usd(breakeven) : "—"}</div></div>
        <div style={box}><div style={lbl}>Days held</div><div style={{ ...val, color: T.text }}>{p.daysHeld != null ? p.daysHeld : "—"}</div></div>
      </div>
      {!p.premiumKnown && <div style={{ color: T.warn || T.warning, fontSize: 11, fontFamily: font, marginBottom: 10 }}>Entry price unknown — enter "Entry price / sh" below to compute realized P&L.</div>}

      <ClosedTradeChart
        symbol={r.sym} strike={r.strike} breakeven={breakeven}
        entryStock={r.fillUnderlying} entryMs={r.openedAtMs}
        exitMs={r.closedOnMs} exitStock={r.exitUnderlying} exitReason={chartReason(r.how)}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, alignItems: "flex-end" }}>
        <label style={{ fontSize: 11, color: T.textDim }}>Entry date<br /><input type="date" defaultValue={msToDate(r.openedAtMs)} onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) onUpdate?.(r.id, { openedAtMs: ms }); }} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Exit date<br /><input type="date" defaultValue={msToDate(r.closedOnMs)} onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) onUpdate?.(r.id, { closedOnMs: ms, closedOn: e.target.value }); }} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Outcome<br /><select defaultValue={r.how} onChange={(e) => onUpdate?.(r.id, { how: e.target.value })} style={{ ...editStyle, width: 150 }}><option value="sold">Sold / bought to close</option><option value="expired">Expired worthless</option><option value="exercised">Exercised / assigned</option></select></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Entry price / sh<br /><input defaultValue={r.fillPrice ?? ""} placeholder="—" onBlur={(e) => onUpdate?.(r.id, { fillPrice: e.target.value === "" ? null : (Number(e.target.value) || 0) })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Exit price / sh<br /><input defaultValue={r.exitPrice ?? ""} onBlur={(e) => onUpdate?.(r.id, { exitPrice: Number(e.target.value) || 0 })} style={editStyle} /></label>
        <div style={{ marginLeft: "auto" }}>
          {confirmDel ? (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: T.danger, fontSize: 11, fontFamily: font }}>Remove from history?</span>
              <button onClick={() => onDelete?.(r.id)} style={{ ...ghost, color: T.danger, borderColor: T.danger, fontWeight: 700 }}>Delete</button>
              <button onClick={() => setConfirmDel(false)} style={ghost}>Cancel</button>
            </span>
          ) : <button onClick={() => setConfirmDel(true)} style={ghost}>Delete</button>}
        </div>
      </div>
    </div>
  );
}

// ── Monthly P&L (full-page) ───────────────────────────────────────────────────
function OptionsMonthlyPnL({ closed, onBack }) {
  const { T } = useTheme();
  const font = T.fontMono;
  const [year, setYear] = useState("all");
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape") onBack(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onBack]);

  const allMonths = useMemo(() => {
    const m = new Map();
    for (const r of closed) {
      const key = (r.closedOn && /^\d{4}-\d{2}/.test(r.closedOn)) ? r.closedOn.slice(0, 7) : (Number.isFinite(r.closedOnMs) ? new Date(r.closedOnMs).toISOString().slice(0, 7) : null);
      if (!key) continue;
      const p = closedOptionPnL(r);
      if (!m.has(key)) m.set(key, { key, realized: 0, flow: 0, trades: 0, wins: 0, known: 0, unknown: 0 });
      const o = m.get(key);
      o.trades++; o.flow += p.entryVal != null ? Math.abs(p.entryVal) : 0;
      if (p.pl == null) o.unknown++; else { o.realized += p.pl; o.known++; if (p.pl > 0) o.wins++; }
    }
    return [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [closed]);

  const years = useMemo(() => [...new Set(allMonths.map((o) => o.key.slice(0, 4)))].sort().reverse(), [allMonths]);
  const months = useMemo(() => {
    const list = (year === "all" ? allMonths : allMonths.filter((o) => o.key.startsWith(year))).map((o) => ({ ...o }));
    let cum = 0; for (const o of list) { cum += o.realized; o.cumulative = cum; }
    return list;
  }, [allMonths, year]);

  const overall = useMemo(() => months.reduce((a, o) => ({ realized: a.realized + o.realized, flow: a.flow + o.flow, trades: a.trades + o.trades, wins: a.wins + o.wins, known: a.known + o.known, best: Math.max(a.best, o.realized), worst: Math.min(a.worst, o.realized) }), { realized: 0, flow: 0, trades: 0, wins: 0, known: 0, best: -Infinity, worst: Infinity }), [months]);

  const VBW = 980, VBH = 360, PL = 56, PR = 964, PT = 24, PB = 310;
  const vals = months.map((o) => o.realized);
  let hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  if (hi === lo) { hi = 1; lo = -1; }
  const pad = (hi - lo) * 0.1 || 1; hi += pad; lo -= pad;
  const yP = (v) => PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT);
  const n = months.length, slot = n ? (PR - PL) / n : (PR - PL), barW = Math.min(46, slot * 0.6);
  const cx = (i) => PL + slot * (i + 0.5), zeroY = yP(0);
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const th = { textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, fontFamily: font };
  const td = { textAlign: "right", padding: "8px 10px", color: T.text, fontFamily: font, fontSize: 12.5, borderBottom: `1px solid ${T.border}` };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.bg, overflowY: "auto" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 8 }}>← Back</button>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: 0 }}>Options — Monthly P&L</h2>
        <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>realized profit / loss on closed options, by month</span>
        {years.length > 1 && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
            {["all", ...years].map((y) => <button key={y} onClick={() => setYear(y)} style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${year === y ? T.accent : T.border}`, background: year === y ? T.accent : "transparent", color: year === y ? "#0A0A0A" : T.textDim }}>{y === "all" ? "All" : y}</button>)}
          </div>
        )}
      </div>
      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {!months.length ? <div style={{ ...card, textAlign: "center", color: T.textDim, padding: "48px 20px" }}>No dated closed options yet.</div> : (<>
          <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <MTot T={T} label="Total realized" value={usd(overall.realized, true)} color={overall.realized >= 0 ? T.success : T.danger} />
            <MTot T={T} label="Premium flow" value={usd(overall.flow)} color={T.success} />
            <MTot T={T} label="Best month" value={overall.best > -Infinity ? usd(overall.best, true) : "—"} color={T.success} />
            <MTot T={T} label="Worst month" value={overall.worst < Infinity ? usd(overall.worst, true) : "—"} color={overall.worst < 0 ? T.danger : T.text} />
            <MTot T={T} label="Win rate" value={`${overall.wins}/${overall.known} (${overall.known ? Math.round((overall.wins / overall.known) * 100) : 0}%)`} />
          </div>
          <div style={card}>
            <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 14, marginBottom: 8 }}>Realized P&L by month</div>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
              {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{usd(v, true)}</text></g>))}
              <line x1={PL} y1={zeroY} x2={PR} y2={zeroY} stroke={T.textDim} strokeWidth="1.25" opacity="0.7" />
              {months.map((o, i) => { const up = o.realized >= 0, y = yP(o.realized), h = Math.abs(y - zeroY), col = up ? T.success : T.danger; return (
                <g key={o.key}>
                  <rect x={cx(i) - barW / 2} y={Math.min(y, zeroY)} width={barW} height={Math.max(1, h)} rx="3" fill={col} opacity="0.85" />
                  <text x={cx(i)} y={up ? y - 5 : y + 12} textAnchor="middle" fontSize="9.5" fontFamily={font} fontWeight="700" fill={col}>{usd(o.realized, true)}</text>
                  <text x={cx(i)} y={VBH - 8} textAnchor="middle" fontSize="10" fontFamily={font} fill={T.textDim}>{monthLabel(o.key)}</text>
                </g>); })}
            </svg>
          </div>
          <div style={{ ...card, padding: "16px 10px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr>{["Month", "Trades", "Premium flow", "Realized P&L", "Win rate", "Cumulative"].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
              <tbody>
                {months.slice().reverse().map((o) => (
                  <tr key={o.key}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{monthLabel(o.key)}</td>
                    <td style={td}>{o.trades}{o.unknown ? ` (${o.unknown}?)` : ""}</td>
                    <td style={td}>{usd(o.flow)}</td>
                    <td style={{ ...td, color: o.realized >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(o.realized, true)}</td>
                    <td style={td}>{o.known ? `${o.wins}/${o.known}` : "—"}</td>
                    <td style={{ ...td, color: o.cumulative >= 0 ? T.success : T.danger }}>{usd(o.cumulative, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </div>
  );
}

function Tot({ T, label, value, color, tip }) {
  return (
    <div title={tip} style={tip ? { cursor: "help" } : undefined}>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}{tip && <span style={{ marginLeft: 4, opacity: 0.6 }}>ⓘ</span>}</div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function MTot({ T, label, value, color }) {
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 19, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
