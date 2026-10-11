// ─── src/components/TradeHistory.jsx ─────────────────────────────────────────
// Trade History on the Working tab: every CLOSED covered call, rendered in the
// same Schwab-style order rows as the working list, with an expandable panel
// showing the full lifecycle chart (entry dot → strike/breakeven → exit marker),
// the realized outcome, and editable entry/exit details. The goal: see
// everything that happened to a position after it closed.

import { useState, useMemo, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";
import ClosedTradeChart from "./ClosedTradeChart";
import { isCoveredCallUnderlying } from "../lib/schwabPositions";

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const csExp = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}` : ""; };
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);
const CS_COLS = "104px 56px 56px 74px 62px 96px 58px 88px 108px 70px 50px 56px 150px 26px";
const HOW = { bought: "Bought back", expired: "Expired worthless", called: "Called away" };
const HOW_COLOR = (T) => ({ bought: T.success, expired: T.textDim, called: T.warn || T.warning });

// Realized P&L for one closed record (premium kept, buy-back cost, stock gain).
// Premium can be unknown for a buy-back imported without its original sale (the
// open was older than Schwab's ~60-day window) — then opt/net are null until the
// user fills in the premium.
function closedPnL(r) {
  const contracts = r.contracts || 1, shares = contracts * 100;
  const premiumKnown = r.fillCall != null && r.fillCall !== "";
  const premium = premiumKnown ? r.fillCall * shares : null;
  const buyback = (r.buyback || 0) * shares;
  const opt = !premiumKnown ? null : (r.how === "bought" ? premium - buyback : premium); // expired/called keep full premium
  const stock = r.how === "called" ? (r.stockGain || 0) : 0;
  const net = opt == null ? null : opt + stock;
  const daysHeld = (Number.isFinite(r.openedAtMs) && Number.isFinite(r.closedOnMs)) ? Math.max(0, Math.round((r.closedOnMs - r.openedAtMs) / 86400000)) : null;
  return { contracts, shares, premium, buyback, opt, stock, net, daysHeld, premiumKnown };
}

export default function TradeHistory({ closed = [], accounts = [], onUpdate, onDelete, onSync, syncing, syncMsg, schwabConnected }) {
  const { T } = useTheme();
  const [open, setOpen] = useState({});
  const [showMonthly, setShowMonthly] = useState(false);
  const font = T.fontMono;

  const acctShort = (r) => {
    if (!r?.acct && !r?.acctId) return null;
    const a = (accounts || []).find((x) => x.accountId === r?.acctId) || (accounts || []).find((x) => String(x.accountId || "").slice(-4) === r?.acct);
    return a?.label || (r.acct ? `··${r.acct}` : null);
  };

  // Only covered calls on stocks/ETFs — exclude any futures/treasury options or
  // non-covered-call records that may be in the data.
  const rows = useMemo(() => (closed || []).filter((c) => isCoveredCallUnderlying(c.sym)).sort((a, b) => (b.closedOnMs || 0) - (a.closedOnMs || 0)), [closed]);
  const totals = useMemo(() => rows.reduce((a, r) => {
    const p = closedPnL(r);
    return {
      premium: a.premium + (p.premium || 0),
      realized: a.realized + (p.net || 0),
      wins: a.wins + (p.net > 0 ? 1 : 0),
      known: a.known + (p.premiumKnown ? 1 : 0),
      n: a.n + 1,
    };
  }, { premium: 0, realized: 0, wins: 0, known: 0, n: 0 }), [rows]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const cellBase = { fontFamily: font, fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 };
  const dim = { ...cellBase, color: T.textDim };
  const leg = { display: "grid", gridTemplateColumns: CS_COLS, alignItems: "center" };

  // Keep the section (and its import control) reachable even before anything is
  // imported, so the button is always discoverable.
  if (!rows.length && !onSync) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Trade History</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {rows.length > 0 && (
            <button onClick={() => setShowMonthly(true)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: T.accent, color: "#0A0A0A", fontFamily: font, fontSize: 12, fontWeight: 700 }}>
              📅 Monthly P&L
            </button>
          )}
          {onSync && (
            <button onClick={onSync} disabled={syncing} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: font, fontSize: 12, fontWeight: 700, opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "Syncing…" : "⬇ Import closed trades from Schwab"}
            </button>
          )}
          {onSync && !schwabConnected && <span style={{ color: T.warn || T.warning, fontFamily: font, fontSize: 11 }}>Schwab not connected — reconnect in the APIs tab first.</span>}
          {syncMsg && <span style={{ color: syncMsg.ok ? T.textDim : T.danger, fontFamily: font, fontSize: 12 }}>{syncMsg.text}</span>}
        </div>
      </div>

      {!rows.length ? (
        <div style={{ ...card, textAlign: "center", padding: "36px 20px" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📜</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 6 }}>No closed trades yet</div>
          <div style={{ color: T.textDim, fontSize: 13, maxWidth: 460, margin: "0 auto" }}>
            Close a working call above, or {schwabConnected ? "use “Import closed trades from Schwab” to pull fully-closed covered calls from your account’s last ~60 days." : "connect Schwab in the APIs tab to import your closed covered calls."}
          </div>
        </div>
      ) : (
      <>
      {/* realized totals */}
      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        <Tot T={T} label="Closed trades" value={String(totals.n)} tip="Number of covered calls you've closed." />
        <Tot T={T} label="Total premiums" value={usd(totals.premium)} color={T.success} tip="Premium collected across every closed covered call (fill × 100 × contracts)." />
        <Tot T={T} label="Realized P&L" value={usd(totals.realized, true)} color={totals.realized >= 0 ? T.success : T.danger} tip={`Net realized profit/loss: premium kept minus buy-back cost, plus stock gain on any called-away trades.${totals.known < totals.n ? ` Excludes ${totals.n - totals.known} buy-back(s) whose opening premium isn't known yet — add it in the row.` : ""}`} />
        <Tot T={T} label="Win rate" value={`${totals.wins}/${totals.known} (${totals.known ? Math.round((totals.wins / totals.known) * 100) : 0}%)`} tip="Closed trades with a positive realized P&L (of those with a known premium)." />
      </div>

      {/* rows — Schwab-style, like the working list */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div style={{ minWidth: 1040 }}>
          <div style={{ display: "grid", gridTemplateColumns: CS_COLS, padding: "9px 16px", borderBottom: `1px solid ${T.border}` }}>
            {["Strategy", "Side", "Qty", "Pos Effect", "Symbol", "Exp", "Strike", "Strike Type", "Price", "Order", "TIF", "Exch", "Outcome", ""].map((h, i) => (
              <div key={i} style={{ color: T.textDim, fontSize: 9, fontFamily: font, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
            ))}
          </div>
          {rows.map((r) => {
            const id = r.id;
            const isOpen = !!open[id];
            const n = r.contracts || 1;
            const pnl = closedPnL(r);
            const outColor = HOW_COLOR(T)[r.how] || T.textDim;
            const perShareBuyback = r.how === "bought" ? ` @ ${usd(r.buyback)}` : r.how === "called" ? ` @ ${usd(r.strike)}` : "";
            return (
              <div key={id} style={{ borderBottom: `1px solid ${T.border}`, background: isOpen ? T.card : "transparent" }}>
                <div onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))} style={{ cursor: "pointer", padding: "10px 16px" }}>
                  {/* Leg 1 — the SELL that opened the call */}
                  <div style={leg}>
                    <div style={{ ...cellBase, display: "flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: outColor, flexShrink: 0 }} />COVERED
                    </div>
                    <div style={{ ...cellBase, color: T.danger, fontWeight: 700 }}>SELL</div>
                    <div style={cellBase}>−{n}</div>
                    <div style={dim}>TO OPEN</div>
                    <div style={{ ...cellBase, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      {r.sym}
                      {acctShort(r) && <span title={`Schwab account ${acctShort(r)}`} style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4, cursor: "help" }}>{acctShort(r)}</span>}
                    </div>
                    <div style={cellBase}>{csExp(r.expiry)}</div>
                    <div style={cellBase}>{r.strike}</div>
                    <div style={cellBase}>CALL</div>
                    <div style={cellBase}>{pnl.premiumKnown ? usd(r.fillCall) : "—"} <span style={{ color: T.textDim }}>FILL</span></div>
                    <div style={dim}>CLOSED</div>
                    <div style={dim}>—</div>
                    <div style={dim}>—</div>
                    <div style={{ ...cellBase, color: outColor, fontWeight: 700, whiteSpace: "normal", lineHeight: 1.3 }}
                      title={`${HOW[r.how] || r.how}${perShareBuyback} on ${r.closedOn}.${pnl.net == null ? " Opening premium unknown — add it in the row to compute P&L." : ` Realized ${usd(pnl.net, true)}${pnl.daysHeld != null ? ` over ${pnl.daysHeld} day${pnl.daysHeld === 1 ? "" : "s"}` : ""}.`}`}>
                      {HOW[r.how] || r.how}{perShareBuyback}
                      <div style={{ color: pnl.net == null ? T.textDim : pnl.net >= 0 ? T.success : T.danger, fontSize: 10, fontWeight: 700 }}>{pnl.net == null ? "add premium" : `${usd(pnl.net, true)}${pnl.daysHeld != null ? ` · ${pnl.daysHeld}d` : ""}`}</div>
                    </div>
                    <div style={{ ...cellBase, textAlign: "right", color: T.textDim, transform: isOpen ? "rotate(180deg)" : "none" }}>▾</div>
                  </div>
                  {/* Leg 2 — the buy-back that closed the call */}
                  {r.how === "bought" && (
                    <div style={{ ...leg, marginTop: 2 }}>
                      <div />
                      <div style={{ ...cellBase, color: T.success, fontWeight: 700 }}>BUY</div>
                      <div style={cellBase}>+{n}</div>
                      <div style={dim}>TO CLOSE</div>
                      <div style={{ ...cellBase, fontWeight: 700 }}>{r.sym}</div>
                      <div style={cellBase}>{csExp(r.expiry)}</div>
                      <div style={cellBase}>{r.strike}</div>
                      <div style={cellBase}>CALL</div>
                      <div style={cellBase}>{usd(r.buyback)} <span style={{ color: T.textDim }}>FILL</span></div>
                      <div style={dim}>FILLED</div>
                      <div style={dim}>—</div>
                      <div style={dim}>—</div>
                      <div style={dim}>bought back · {r.closedOn}</div>
                      <div />
                    </div>
                  )}
                  {/* Leg 3 — the shares backing it */}
                  <div style={{ ...leg, marginTop: 2 }}>
                    <div />
                    <div style={{ ...cellBase, color: T.success, fontWeight: 700 }}>BUY</div>
                    <div style={cellBase}>+{n * 100}</div>
                    <div style={dim}>SHARES</div>
                    <div style={{ ...cellBase, fontWeight: 700 }}>{r.sym}</div>
                    <div /><div />
                    <div style={cellBase}>STOCK</div>
                    <div style={cellBase}>{Number(r.fillStock) > 0 ? usd(r.fillStock) : "—"}</div>
                    <div /><div /><div />
                    <div style={dim}>{r.closedOn}</div>
                    <div />
                  </div>
                </div>
                {isOpen && <ClosedDetail T={T} r={r} pnl={pnl} onUpdate={onUpdate} onDelete={onDelete} />}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ color: T.textMuted || T.textDim, fontSize: 11, fontFamily: font, marginTop: -6 }}>
        Click a row to see the full lifecycle chart and edit the entry/exit details.
      </div>
      </>
      )}

      {showMonthly && <MonthlyPnL closed={rows} onBack={() => setShowMonthly(false)} />}
    </div>
  );
}

// ── Monthly P&L track record (full-page) ──────────────────────────────────────
const MONTH3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return `${MONTH3[(m || 1) - 1]} '${String(y).slice(-2)}`; };

function MonthlyPnL({ closed, onBack }) {
  const { T } = useTheme();
  const font = T.fontMono;
  const [year, setYear] = useState("all");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const allMonths = useMemo(() => {
    const m = new Map();
    for (const r of closed) {
      const key = (r.closedOn && /^\d{4}-\d{2}/.test(r.closedOn)) ? r.closedOn.slice(0, 7)
        : (Number.isFinite(r.closedOnMs) ? new Date(r.closedOnMs).toISOString().slice(0, 7) : null);
      if (!key) continue;
      const p = closedPnL(r);
      if (!m.has(key)) m.set(key, { key, realized: 0, premium: 0, trades: 0, wins: 0, known: 0, unknown: 0 });
      const o = m.get(key);
      o.trades++;
      o.premium += p.premium || 0;
      if (p.net == null) o.unknown++;
      else { o.realized += p.net; o.known++; if (p.net > 0) o.wins++; }
    }
    return [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [closed]);

  const years = useMemo(() => [...new Set(allMonths.map((o) => o.key.slice(0, 4)))].sort().reverse(), [allMonths]);
  const months = useMemo(() => {
    const list = (year === "all" ? allMonths : allMonths.filter((o) => o.key.startsWith(year))).map((o) => ({ ...o }));
    let cum = 0; for (const o of list) { cum += o.realized; o.cumulative = cum; }
    return list;
  }, [allMonths, year]);

  const overall = useMemo(() => months.reduce((a, o) => ({
    realized: a.realized + o.realized, premium: a.premium + o.premium, trades: a.trades + o.trades,
    wins: a.wins + o.wins, known: a.known + o.known, best: Math.max(a.best, o.realized), worst: Math.min(a.worst, o.realized),
  }), { realized: 0, premium: 0, trades: 0, wins: 0, known: 0, best: -Infinity, worst: Infinity }), [months]);

  // Bar chart geometry
  const VBW = 980, VBH = 360, PL = 56, PR = 964, PT = 24, PB = 310;
  const vals = months.map((o) => o.realized);
  let hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  if (hi === lo) { hi = 1; lo = -1; }
  const pad = (hi - lo) * 0.1 || 1; hi += pad; lo -= pad;
  const yP = (v) => PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT);
  const n = months.length;
  const slot = n ? (PR - PL) / n : (PR - PL);
  const barW = Math.min(46, slot * 0.6);
  const cx = (i) => PL + slot * (i + 0.5);
  const zeroY = yP(0);
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const th = { textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, fontFamily: font };
  const td = { textAlign: "right", padding: "8px 10px", color: T.text, fontFamily: font, fontSize: 12.5, borderBottom: `1px solid ${T.border}` };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.bg, overflowY: "auto" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 8 }}>← Back</button>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: 0 }}>Monthly P&L</h2>
        <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>realized profit / loss in premiums, by month</span>
        {years.length > 1 && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
            {["all", ...years].map((y) => <button key={y} onClick={() => setYear(y)} style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${year === y ? T.accent : T.border}`, background: year === y ? T.accent : "transparent", color: year === y ? "#0A0A0A" : T.textDim }}>{y === "all" ? "All" : y}</button>)}
          </div>
        )}
      </div>

      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {!months.length ? (
          <div style={{ ...card, textAlign: "center", color: T.textDim, padding: "48px 20px" }}>No dated closed trades yet.</div>
        ) : (<>
          {/* summary cards */}
          <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <MTot T={T} label="Total realized" value={usd(overall.realized, true)} color={overall.realized >= 0 ? T.success : T.danger} />
            <MTot T={T} label="Total premiums" value={usd(overall.premium)} color={T.success} />
            <MTot T={T} label="Best month" value={overall.best > -Infinity ? usd(overall.best, true) : "—"} color={T.success} />
            <MTot T={T} label="Worst month" value={overall.worst < Infinity ? usd(overall.worst, true) : "—"} color={overall.worst < 0 ? T.danger : T.text} />
            <MTot T={T} label="Win rate" value={`${overall.wins}/${overall.known} (${overall.known ? Math.round((overall.wins / overall.known) * 100) : 0}%)`} />
          </div>

          {/* bar chart */}
          <div style={card}>
            <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 14, marginBottom: 8 }}>Realized P&L by month</div>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
              {yTicks.map((v, i) => (
                <g key={i}>
                  <line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" />
                  <text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{usd(v, true)}</text>
                </g>
              ))}
              <line x1={PL} y1={zeroY} x2={PR} y2={zeroY} stroke={T.textDim} strokeWidth="1.25" opacity="0.7" />
              {months.map((o, i) => {
                const up = o.realized >= 0;
                const y = yP(o.realized);
                const h = Math.abs(y - zeroY);
                const col = up ? T.success : T.danger;
                return (
                  <g key={o.key}>
                    <rect x={cx(i) - barW / 2} y={Math.min(y, zeroY)} width={barW} height={Math.max(1, h)} rx="3" fill={col} opacity="0.85" />
                    <text x={cx(i)} y={up ? y - 5 : y + 12} textAnchor="middle" fontSize="9.5" fontFamily={font} fontWeight="700" fill={col}>{usd(o.realized, true)}</text>
                    <text x={cx(i)} y={VBH - 8} textAnchor="middle" fontSize="10" fontFamily={font} fill={T.textDim}>{monthLabel(o.key)}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* table */}
          <div style={{ ...card, padding: "16px 10px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr>
                {["Month", "Trades", "Premiums", "Realized P&L", "Win rate", "Cumulative"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {months.slice().reverse().map((o) => (
                  <tr key={o.key}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{monthLabel(o.key)}</td>
                    <td style={td}>{o.trades}{o.unknown ? ` (${o.unknown}?)` : ""}</td>
                    <td style={td}>{usd(o.premium)}</td>
                    <td style={{ ...td, color: o.realized >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(o.realized, true)}</td>
                    <td style={td}>{o.known ? `${o.wins}/${o.known}` : "—"}</td>
                    <td style={{ ...td, color: o.cumulative >= 0 ? T.success : T.danger }}>{usd(o.cumulative, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overall.known < overall.trades && (
              <div style={{ color: T.textMuted || T.textDim, fontSize: 11, fontFamily: font, marginTop: 8, padding: "0 10px" }}>
                "(N?)" = buy-backs imported without their opening premium — add the premium in the Trade History row to include them.
              </div>
            )}
          </div>
        </>)}
      </div>
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

function ClosedDetail({ T, r, pnl, onUpdate, onDelete }) {
  const font = T.fontMono;
  const [confirmDel, setConfirmDel] = useState(false);
  const box = { textAlign: "center", padding: "10px 8px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` };
  const lbl = { color: T.textDim, fontSize: 9, fontFamily: font, letterSpacing: 1, textTransform: "uppercase" };
  const val = { fontSize: 16, fontWeight: 700, fontFamily: font, marginTop: 4 };
  const editStyle = { width: 120, minHeight: 36, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };
  const breakeven = Number(r.fillStock) > 0 ? r.fillStock - (r.fillCall || 0) : null;

  return (
    <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${T.border}` }}>
      {/* realized summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, margin: "14px 0" }}>
        <div style={box}><div style={lbl}>Premium</div><div style={{ ...val, color: T.success }}>{pnl.premiumKnown ? usd(pnl.premium) : "—"}</div></div>
        <div style={box}><div style={lbl}>Buy-back</div><div style={{ ...val, color: T.text }}>{usd(pnl.buyback)}</div></div>
        <div style={box}><div style={lbl}>Option P&L</div><div style={{ ...val, color: pnl.opt == null ? T.textDim : pnl.opt >= 0 ? T.success : T.danger }}>{pnl.opt == null ? "—" : usd(pnl.opt, true)}</div></div>
        {r.how === "called" && <div style={box}><div style={lbl}>Stock P&L</div><div style={{ ...val, color: pnl.stock >= 0 ? T.success : T.danger }}>{usd(pnl.stock, true)}</div></div>}
        <div style={box}><div style={lbl}>Net realized</div><div style={{ ...val, color: pnl.net == null ? T.textDim : pnl.net >= 0 ? T.success : T.danger }}>{pnl.net == null ? "—" : usd(pnl.net, true)}</div></div>
        <div style={box}><div style={lbl}>Days held</div><div style={{ ...val, color: T.text }}>{pnl.daysHeld != null ? pnl.daysHeld : "—"}</div></div>
      </div>
      {!pnl.premiumKnown && (
        <div style={{ color: T.warn || T.warning, fontSize: 11, fontFamily: font, marginBottom: 10 }}>
          This buy-back was imported without its original sale (opened before Schwab's ~60-day window). Enter the premium you collected (“Call sold at / sh”) below to compute P&L.
        </div>
      )}

      {/* lifecycle chart */}
      <ClosedTradeChart
        symbol={r.sym}
        strike={r.strike}
        breakeven={breakeven}
        entryStock={r.fillStock}
        entryMs={r.openedAtMs}
        exitMs={r.closedOnMs}
        exitStock={r.exitStock}
        exitReason={r.how}
      />

      {/* editable entry/exit details — keep the history accurate */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, alignItems: "flex-end" }}>
        <label style={{ fontSize: 11, color: T.textDim }}>Entry date (call sold)<br />
          <input type="date" defaultValue={msToDate(r.openedAtMs)}
            onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) onUpdate?.(r.id, { openedAtMs: ms }); }} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Exit date<br />
          <input type="date" defaultValue={msToDate(r.closedOnMs)}
            onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) onUpdate?.(r.id, { closedOnMs: ms, closedOn: e.target.value }); }} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Outcome<br />
          <select defaultValue={r.how} onChange={(e) => onUpdate?.(r.id, { how: e.target.value })} style={{ ...editStyle, width: 150 }}>
            <option value="bought">Bought back</option>
            <option value="expired">Expired worthless</option>
            <option value="called">Called away</option>
          </select></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Call sold at / sh<br />
          <input defaultValue={r.fillCall ?? ""} placeholder="—" onBlur={(e) => onUpdate?.(r.id, { fillCall: e.target.value === "" ? null : (Number(e.target.value) || 0) })} style={editStyle} /></label>
        {r.how === "bought" && <label style={{ fontSize: 11, color: T.textDim }}>Buy-back price / sh<br />
          <input defaultValue={r.buyback} onBlur={(e) => onUpdate?.(r.id, { buyback: Number(e.target.value) || 0, exitCall: Number(e.target.value) || 0 })} style={editStyle} /></label>}
        <label style={{ fontSize: 11, color: T.textDim }}>Share price paid<br />
          <input defaultValue={r.fillStock || ""} placeholder="—" onBlur={(e) => onUpdate?.(r.id, { fillStock: Number(e.target.value) || null })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Stock at exit<br />
          <input defaultValue={r.exitStock || ""} placeholder="—" onBlur={(e) => onUpdate?.(r.id, { exitStock: Number(e.target.value) || null })} style={editStyle} /></label>
        <div style={{ marginLeft: "auto" }}>
          {confirmDel ? (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: T.danger, fontSize: 11, fontFamily: font }}>Remove from history?</span>
              <button onClick={() => onDelete?.(r.id)} style={{ ...dangerBtn(T) }}>Delete</button>
              <button onClick={() => setConfirmDel(false)} style={{ ...ghostBtn(T) }}>Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDel(true)} style={ghostBtn(T)}>Delete</button>
          )}
        </div>
      </div>
      {!Number.isFinite(r.openedAtMs) && (
        <div style={{ color: T.warn || T.warning, fontSize: 11, fontFamily: font, marginTop: 8 }}>
          ⬆ Set the entry date to place the entry dot and draw the full trade on the chart.
        </div>
      )}
    </div>
  );
}

const ghostBtn = (T) => ({ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: T.fontMono, fontSize: 12, cursor: "pointer" });
const dangerBtn = (T) => ({ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.danger}`, background: "transparent", color: T.danger, fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, cursor: "pointer" });

function Tot({ T, label, value, color, tip }) {
  return (
    <div title={tip} style={tip ? { cursor: "help" } : undefined}>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}{tip && <span style={{ marginLeft: 4, opacity: 0.6 }}>ⓘ</span>}
      </div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
