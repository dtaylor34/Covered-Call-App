// ─── src/components/WorkingPositionsTab.jsx ──────────────────────────────────
// Working covered calls — the portfolio list. Totals strip, one row per open
// call with a health stoplight (hover legend) and an expandable detail panel
// (Position Summary, GTC fill estimate, and the four exit paths). Add/paste a
// position from the header. Dark-themed to match the app.
//
// Data: usePositions() (Firestore). Math: src/lib/coveredCallMath.js.
// Shares-by-lot lives in Phase 4; SVG time/price charts are a later polish.

import { useState, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { usePositions } from "../hooks/usePositions";
import { useLivePortfolio } from "../hooks/useLivePortfolio";
import { positionCalcs, stoplight, gtcFillEstimate } from "../lib/coveredCallMath";
import { parsePaste, positionId } from "../lib/positionParser";
import SharesByLot from "./SharesByLot";

const DOT = { g: "#2F9E55", y: "#E3A91B", r: "#E0552A" };
const LEGEND = [
  { key: "g", label: "Good", text: "Under 35% chance the call ends above the strike, and the stock is above your breakeven." },
  { key: "y", label: "Watch", text: "35–60% chance of being called, or the stock has dropped below breakeven." },
  { key: "r", label: "Likely called", text: "At/over the strike or 60%+ chance. Shares will probably sell unless you buy back or roll." },
];

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const expShort = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "—";
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
// Schwab-style expiration, e.g. "16 OCT 26"
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const csExp = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return "";
  return `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}`;
};
// Column grid matching the Schwab covered-call order row (see examples/Example CS Liste Item.png):
// Strategy | Side | Qty | Pos Effect | Symbol | Exp | Strike | Strike Type | Price | Order | TIF | Exch | Health | ▾
const CS_COLS = "104px 56px 56px 74px 62px 96px 58px 88px 108px 70px 50px 56px 132px 26px";

export default function WorkingPositionsTab() {
  const { T } = useTheme();
  const { positions, lots, closed, loading, savePosition, updateLive, closePosition, saveLot, deleteLot } = usePositions();
  const { live, status } = useLivePortfolio(positions);
  const [open, setOpen] = useState({});
  const [hover, setHover] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  // Overlay live Yahoo/Schwab marks onto the stored positions for all math.
  const livePositions = useMemo(() => positions.map((p) => ({ ...p, ...(live[p.id] || {}) })), [positions, live]);

  const rows = useMemo(() => livePositions.map((p) => {
    const c = positionCalcs(p);
    const iv = (p.iv || 25) / 100;
    const light = stoplight({ liveStock: p.liveStock, strike: p.strike, daysToExpiry: p.daysToExpiry, iv, breakeven: c.breakeven });
    const fill = gtcFillEstimate({ S: p.liveStock, strike: p.strike, daysLeft: Math.max(1, Math.round(p.daysToExpiry || 1)), iv, gtc: p.gtc ?? 0.1, fillCall: p.fillCall, contracts: p.contracts || 1 });
    return { p, c, light, fill, liveSource: live[p.id]?.source };
  }), [livePositions, live]);

  const totals = useMemo(() => rows.reduce((a, { c }) => ({
    shareCost: a.shareCost + c.shareCost, premium: a.premium + c.premium, buyback: a.buyback + c.buyback,
    kept: a.kept + c.kept, close: a.close + c.close, maxProfit: a.maxProfit + c.maxProfit,
  }), { shareCost: 0, premium: 0, buyback: 0, kept: 0, close: 0, maxProfit: 0 }), [rows]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const h3 = { color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 };

  return (
    <div role="region" aria-label="Working covered calls">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ ...h3, fontSize: 20 }}>Working Covered Calls</h2>
          {positions.length > 0 && (
            <span title={status.at ? `Updated ${new Date(status.at).toLocaleTimeString()}` : "Fetching…"} style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, fontFamily: T.fontMono,
              color: status.source === "schwab" ? T.success : T.textDim,
              background: `${status.source === "schwab" ? T.success : T.textDim}1e`,
            }}>
              {status.loading ? "◌ updating" : status.source === "schwab" ? "● Schwab live" : "● Yahoo · 15-min delayed"}
            </span>
          )}
        </div>
        <button onClick={() => setShowAdd((v) => !v)} style={{
          padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer",
          background: showAdd ? "transparent" : T.accent, color: showAdd ? T.accent : "#0A0A0A",
          fontFamily: T.fontMono, fontSize: 13, fontWeight: 700,
        }}>{showAdd ? "Close" : "+ Add / Paste"}</button>
      </div>

      {showAdd && <AddForm T={T} lots={lots} positions={positions} onSave={savePosition} onDone={() => setShowAdd(false)} />}

      {/* Totals strip */}
      {rows.length > 0 && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          <Tot T={T} label="Money in trade" value={usd(totals.shareCost - totals.premium)} />
          <Tot T={T} label="Premium" value={usd(totals.premium)} color={T.success} />
          <Tot T={T} label="Kept so far" value={usd(totals.kept, true)} color={totals.kept >= 0 ? T.success : T.danger} />
          <Tot T={T} label="If closed now" value={usd(totals.close, true)} color={totals.close >= 0 ? T.success : T.danger} />
          <Tot T={T} label="Best case" value={usd(totals.maxProfit, true)} color={T.accent} />
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <div style={{ ...card, color: T.textDim }}>Loading positions…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, marginBottom: 6 }}>No working calls yet</div>
          <div style={{ color: T.textDim, fontSize: 13, maxWidth: 420, margin: "0 auto" }}>
            Use “+ Add / Paste” to enter a covered call — or paste a thinkorswim fill and it fills the form for you.
          </div>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <div style={{ minWidth: 1040 }}>
            {/* Column header — Schwab covered-call order-row columns */}
            <div style={{ display: "grid", gridTemplateColumns: CS_COLS, padding: "9px 16px", borderBottom: `1px solid ${T.border}` }}>
              {["Strategy", "Side", "Qty", "Pos Effect", "Symbol", "Exp", "Strike", "Strike Type", "Price", "Order", "TIF", "Exch", "", ""].map((h, i) => (
                <div key={i} style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
              ))}
            </div>
            {rows.map(({ p, c, light, fill }) => {
              const isOpen = !!open[p.id];
              const n = p.contracts || 1;
              const cellBase = { fontFamily: T.fontMono, fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 };
              const dim = { ...cellBase, color: T.textDim };
              const leg = { display: "grid", gridTemplateColumns: CS_COLS, alignItems: "center" };
              return (
                <div key={p.id} style={{ borderBottom: `1px solid ${T.border}`, background: isOpen ? T.card : "transparent" }}>
                  <div onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} style={{ cursor: "pointer", padding: "10px 16px" }}>
                    {/* Leg 1 — SELL the call */}
                    <div style={leg}>
                      <div style={{ ...cellBase, display: "flex", alignItems: "center", gap: 7, fontWeight: 700, position: "relative" }}
                        onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}>
                        <span style={{ width: 11, height: 11, borderRadius: "50%", background: DOT[light.key], flexShrink: 0, boxShadow: hover === p.id ? `0 0 0 4px ${DOT[light.key]}33` : "none" }} />
                        COVERED
                        {hover === p.id && (
                          <div role="tooltip" style={{ position: "absolute", zIndex: 30, top: 20, left: 0, width: 250, whiteSpace: "normal", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                            {LEGEND.map((l) => (
                              <div key={l.key} style={{ display: "flex", gap: 8, padding: "4px 0", opacity: l.key === light.key ? 1 : 0.6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: DOT[l.key], marginTop: 3, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: T.textDim, lineHeight: 1.4 }}><b style={{ color: T.text }}>{l.label}.</b> {l.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ ...cellBase, color: T.danger, fontWeight: 700 }}>SELL</div>
                      <div style={cellBase}>−{n}</div>
                      <div style={dim}>AUTO</div>
                      <div style={{ ...cellBase, fontWeight: 700 }}>{p.sym}</div>
                      <div style={cellBase}>{csExp(p.expiry)}</div>
                      <div style={cellBase}>{p.strike}</div>
                      <div style={cellBase}>CALL</div>
                      <div style={cellBase}>{c.breakeven.toFixed(2)} <span style={{ color: T.textDim }}>LMT</span></div>
                      <div style={dim}>LIMIT</div>
                      <div style={dim}>DAY</div>
                      <div style={dim}>BEST</div>
                      <div style={{ ...cellBase, color: DOT[light.key], fontSize: 11 }}>{light.label} · {Math.round(light.delta * 100)}%</div>
                      <div style={{ ...cellBase, textAlign: "right", color: T.textDim, transform: isOpen ? "rotate(180deg)" : "none" }}>▾</div>
                    </div>
                    {/* Leg 2 — BUY the shares */}
                    <div style={{ ...leg, marginTop: 2 }}>
                      <div />
                      <div style={{ ...cellBase, color: T.success, fontWeight: 700 }}>BUY</div>
                      <div style={cellBase}>+{n * 100}</div>
                      <div style={dim}>AUTO</div>
                      <div style={{ ...cellBase, fontWeight: 700 }}>{p.sym}</div>
                      <div />
                      <div />
                      <div style={cellBase}>STOCK</div>
                      <div style={dim}>DEBIT</div>
                      <div />
                      <div />
                      <div />
                      <div style={{ ...cellBase, fontSize: 11, color: c.close >= 0 ? T.success : T.danger }}>if closed {usd(c.close, true)} · {(c.health * 100).toFixed(1)}%</div>
                      <div />
                    </div>
                  </div>
                  {isOpen && <Detail T={T} p={p} c={c} fill={fill} onUpdateLive={updateLive} onClose={closePosition} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shares by lot — fed by the same live marks */}
      <SharesByLot positions={livePositions} lots={lots} onSaveLot={saveLot} onDeleteLot={deleteLot} />

      {closed.length > 0 && (
        <div style={{ color: T.textDim, fontSize: 12, marginTop: 8 }}>
          {closed.length} closed call{closed.length === 1 ? "" : "s"} in history (see the Trades tab).
        </div>
      )}
    </div>
  );
}

// ── Totals cell ───────────────────────────────────────────────────────────────
function Tot({ T, label, value, color }) {
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ── Expanded detail ───────────────────────────────────────────────────────────
function Detail({ T, p, c, fill, onUpdateLive, onClose }) {
  const [bb, setBb] = useState(String(p.gtc ?? 0.1));
  const box = { textAlign: "center", padding: "10px 8px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` };
  const lbl = { color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" };
  const val = { fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 };
  const editStyle = { width: 90, minHeight: 38, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13 };
  const fillMsg = fill.fillDays == null
    ? `The call stays above ${usd(p.gtc ?? 0.1)} through expiration at this price.`
    : fill.fillDays >= (p.daysToExpiry || 1) - 0.01
      ? `Already at/under ${usd(p.gtc ?? 0.1)} — the GTC fills right away.`
      : fill.fillDays < 1 ? "Fills around expiration day." : `Fills with ~${Math.round(fill.fillDays)} days left.`;

  return (
    <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${T.border}` }}>
      {/* Position summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, margin: "14px 0" }}>
        <div style={box}><div style={lbl}>Money in</div><div style={{ ...val, color: T.text }}>{usd(c.basis)}</div></div>
        <div style={box}><div style={lbl}>If closed now</div><div style={{ ...val, color: c.close >= 0 ? T.success : T.danger }}>{usd(c.close, true)}</div></div>
        <div style={box}><div style={lbl}>Max profit</div><div style={{ ...val, color: T.accent }}>{usd(c.maxProfit, true)}</div></div>
        <div style={box}><div style={lbl}>Breakeven</div><div style={{ ...val, color: T.warn }}>{usd(c.breakeven)}</div></div>
        <div style={box}><div style={lbl}>Health</div><div style={{ ...val, color: T.text }}>{(c.health * 100).toFixed(1)}%</div></div>
      </div>

      {/* GTC fill estimate */}
      <div style={{ padding: "12px 14px", background: T.accentDim, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>GTC buy back {usd(p.gtc ?? 0.1)} → locks in {usd(fill.gtcKeep)}</div>
        <div style={{ color: T.textDim, fontSize: 12, marginTop: 3 }}>{fillMsg}</div>
      </div>

      {/* Live marks — editable */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: T.textDim }}>Live stock<br />
          <input defaultValue={p.liveStock} onBlur={(e) => onUpdateLive(p.id, { liveStock: Number(e.target.value) || p.liveStock })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Live call<br />
          <input defaultValue={p.liveCall} onBlur={(e) => onUpdateLive(p.id, { liveCall: Number(e.target.value) || 0 })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>GTC<br />
          <input defaultValue={p.gtc ?? 0.1} onBlur={(e) => onUpdateLive(p.id, { gtc: Number(e.target.value) || 0 })} style={editStyle} /></label>
      </div>

      {/* Four exit paths */}
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Exit paths</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Buy back</div>
          <input value={bb} onChange={(e) => setBb(e.target.value)} style={{ ...editStyle, width: "100%" }} />
          <button onClick={() => onClose(p.id, "bought", { buyback: Number(bb) || 0 })} style={btn(T)}>Record buy back</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Expired</div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>Keeps all {usd(c.premium)} premium.</div>
          <button onClick={() => onClose(p.id, "expired")} style={btn(T)}>Mark expired</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Called away</div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>Sells shares at ${p.strike}. Lot-aware.</div>
          <button onClick={() => onClose(p.id, "called")} style={btn(T)}>Mark called</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Roll</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>Buy back, then add a new later/higher call from the header.</div>
        </div>
      </div>
    </div>
  );
}

const btn = (T) => ({ marginTop: 8, width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontMono, fontSize: 12, cursor: "pointer" });

// ── Add / paste form ──────────────────────────────────────────────────────────
function AddForm({ T, lots = [], positions = [], onSave, onDone }) {
  const empty = { sym: "", contracts: "1", fillStock: "", fillCall: "", strike: "", expiry: "", gtc: "0.10", iv: "", liveStock: "", liveCall: "", lotId: "new" };
  const [f, setF] = useState(empty);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const symU = String(f.sym || "").trim().toUpperCase();
  const coveredLotIds = new Set(positions.map((p) => p.lotId).filter(Boolean));
  const freeLots = lots.filter((l) => l.sym === symU && !coveredLotIds.has(l.id));
  const match = symU && f.strike && f.expiry ? positions.find((p) => p.id === positionId(symU, Number(f.strike), f.expiry)) : null;

  const inp = { width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 14 };
  const lbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: T.textDim, fontWeight: 500 };

  const doParse = () => {
    const { out, found } = parsePaste(paste);
    setF((s) => ({ ...s, ...Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== "")) }));
    setMsg(found.length ? `Read ${found.join(", ")}. Check the fields, then save.` : "Couldn't read that — fill the fields on the right.");
  };
  const submit = async () => {
    const res = await onSave(f);
    if (res.ok) { setF(empty); setPaste(""); setMsg(""); onDone(); }
    else setMsg("Still need: " + (res.missing || []).join(", ") + ".");
  };

  const field = (k, label, ph, type = "text", span = 1) => (
    <label style={{ ...lbl, gridColumn: `span ${span}` }}>{label}
      <input type={type} value={f[k]} onChange={set(k)} placeholder={ph} style={inp} /></label>
  );
  const Code = ({ children }) => <code style={{ color: T.text, fontFamily: T.fontMono }}>{children}</code>;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 12, padding: 22, marginBottom: 16 }}>
      <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: "0 0 14px" }}>Add or update a covered call</h3>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Left — paste, with the exact formats shown */}
        <div style={{ flex: "1 1 260px", minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Paste from thinkorswim, or a quick note</label>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder="Paste fill notifications or order rows here"
            style={{ ...inp, minHeight: 120, padding: 12, resize: "vertical", lineHeight: 1.5 }} />
          <button onClick={doParse} style={{ ...btn(T), width: "auto", alignSelf: "flex-start", padding: "10px 18px" }}>Read paste</button>
          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7 }}>
            Reads thinkorswim lines like <Code>SOLD -1 PFE 100 16 OCT 26 28 CALL @.55</Code> and <Code>BOT +100 PFE @27.80</Code>, a quick note <Code>PFE, 1, 27.80, .55, 28, 10/16/26, .10</Code>, or plain English like <Code>100 shares of PFE, sold 1 call at $0.55, hits $28 by Oct 16, breakeven $27.25</Code>.
          </div>
        </div>
        {/* Right — fields */}
        <div style={{ flex: "1.4 1 320px", minWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            {field("sym", "Symbol", "PFE")}
            {field("contracts", "Contracts", "1")}
            {field("fillStock", "Share price paid", "27.80")}
            {field("fillCall", "Call sold at", "0.55")}
            {field("strike", "Strike", "28")}
            {field("expiry", "Expiration", "", "date")}
            {field("gtc", "GTC buy back", "0.10")}
            {field("iv", "IV % (optional)", "25")}
            {field("liveStock", "Current stock price (optional)", "", "text", 2)}
            {field("liveCall", "Current call price (optional)", "", "text", 2)}
          </div>
          {symU && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: T.textDim, fontWeight: 500 }}>Shares for this call</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ id: "new", label: "New purchase" }, ...freeLots.map((l) => ({ id: l.id, label: `${l.shares} sh @ $${Number(l.cost).toFixed(2)}` }))].map((o) => {
                  const on = f.lotId === o.id;
                  return (
                    <button key={o.id} onClick={() => setF((s) => ({ ...s, lotId: o.id }))}
                      style={{ minHeight: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontFamily: T.fontMono, fontSize: 13,
                        border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accentDim : T.card, color: on ? T.accent : T.textDim }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: T.textDim }}>
                {f.lotId === "new" ? "Creates a new lot at the share price above." : "Covers a lot you already hold — no new shares bought."}
              </span>
            </div>
          )}
          {msg && <div style={{ fontSize: 13, lineHeight: 1.5, padding: "10px 12px", borderRadius: 8, background: T.card, color: T.text }}>{msg}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onDone} style={{ ...btn(T), width: "auto", padding: "10px 18px" }}>Cancel</button>
            <button onClick={submit} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontWeight: 700, cursor: "pointer" }}>
              {match ? "Update position" : "Add position"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
