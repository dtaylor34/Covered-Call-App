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
import { positionCalcs, stoplight, gtcFillEstimate } from "../lib/coveredCallMath";
import { parsePaste } from "../lib/positionParser";
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

export default function WorkingPositionsTab() {
  const { T } = useTheme();
  const { positions, lots, closed, loading, savePosition, updateLive, closePosition, saveLot, deleteLot } = usePositions();
  const [open, setOpen] = useState({});
  const [hover, setHover] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const rows = useMemo(() => positions.map((p) => {
    const c = positionCalcs(p);
    const iv = (p.iv || 25) / 100;
    const light = stoplight({ liveStock: p.liveStock, strike: p.strike, daysToExpiry: p.daysToExpiry, iv, breakeven: c.breakeven });
    const fill = gtcFillEstimate({ S: p.liveStock, strike: p.strike, daysLeft: Math.max(1, Math.round(p.daysToExpiry || 1)), iv, gtc: p.gtc ?? 0.1, fillCall: p.fillCall, contracts: p.contracts || 1 });
    return { p, c, light, fill };
  }), [positions]);

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
        <h2 style={{ ...h3, fontSize: 20 }}>Working Covered Calls</h2>
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
      ) : rows.map(({ p, c, light, fill }) => {
        const isOpen = !!open[p.id];
        return (
          <div key={p.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
            {/* Row header */}
            <div onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
              {/* Stoplight */}
              <div style={{ position: "relative" }}
                onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover((h) => h === p.id ? null : h)}>
                <span aria-label={light.label} style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: DOT[light.key], boxShadow: hover === p.id ? `0 0 0 5px ${DOT[light.key]}33` : "none" }} />
                {hover === p.id && (
                  <div role="tooltip" style={{ position: "absolute", zIndex: 20, top: 22, left: 0, width: 260, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                    {LEGEND.map((l) => (
                      <div key={l.key} style={{ display: "flex", gap: 8, padding: "4px 0", opacity: l.key === light.key ? 1 : 0.6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: DOT[l.key], marginTop: 3, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: T.textDim, lineHeight: 1.4 }}><b style={{ color: T.text }}>{l.label}.</b> {l.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Symbol + contract */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontWeight: 700, fontFamily: T.fontMono, fontSize: 15 }}>{p.sym}</div>
                <div style={{ color: T.textDim, fontSize: 12 }}>{expShort(p.expiry)} ${p.strike} call ×{p.contracts || 1} · {light.label} ({Math.round(light.delta * 100)}%)</div>
              </div>
              {/* Quick stats */}
              <div style={{ textAlign: "right" }}>
                <div style={{ color: c.close >= 0 ? T.success : T.danger, fontFamily: T.fontMono, fontWeight: 700 }}>{usd(c.close, true)}</div>
                <div style={{ color: T.textDim, fontSize: 11 }}>if closed · {(c.health * 100).toFixed(1)}% health</div>
              </div>
              <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s", color: T.textDim }}>▾</span>
            </div>

            {isOpen && <Detail T={T} p={p} c={c} fill={fill} onUpdateLive={updateLive} onClose={closePosition} />}
          </div>
        );
      })}

      {/* Shares by lot */}
      <SharesByLot positions={positions} lots={lots} onSaveLot={saveLot} onDeleteLot={deleteLot} />

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
  const empty = { sym: "", contracts: "1", fillStock: "", fillCall: "", strike: "", expiry: "", gtc: "0.10", lotId: "new" };
  const [f, setF] = useState(empty);
  // Free lots for the entered symbol (not already covered by a position).
  const coveredLotIds = new Set(positions.map((p) => p.lotId).filter(Boolean));
  const freeLots = lots.filter((l) => l.sym === String(f.sym || "").trim().toUpperCase() && !coveredLotIds.has(l.id));
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = { width: "100%", minHeight: 40, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13 };

  const doParse = () => {
    const { out, found } = parsePaste(paste);
    setF((s) => ({ ...s, ...Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== "")) }));
    setMsg(found.length ? `Read: ${found.join(", ")}.` : "Couldn't read that — fill the fields below.");
  };
  const submit = async () => {
    const res = await onSave(f);
    if (res.ok) { setF(empty); setPaste(""); setMsg(""); onDone(); }
    else setMsg("Still need: " + (res.missing || []).join(", ") + ".");
  };

  const field = (k, label, ph) => (
    <label style={{ fontSize: 11, color: T.textDim, display: "block" }}>{label}
      <input value={f[k]} onChange={set(k)} placeholder={ph} style={{ ...inp, marginTop: 4 }} /></label>
  );

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: 18, marginBottom: 16 }}>
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder="Paste a thinkorswim fill or order row here…"
        style={{ ...inp, minHeight: 64, padding: 10, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, margin: "8px 0 14px" }}>
        <button onClick={doParse} style={{ ...btn(T), width: "auto", padding: "8px 14px" }}>Read paste</button>
        {msg && <span style={{ color: T.textDim, fontSize: 12, alignSelf: "center" }}>{msg}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
        {field("sym", "Symbol", "PFE")}
        {field("contracts", "Contracts", "1")}
        {field("fillStock", "Share price paid", "27.80")}
        {field("fillCall", "Call sold at", "0.55")}
        {field("strike", "Strike", "28")}
        {field("expiry", "Expiry (YYYY-MM-DD)", "2026-10-16")}
        {field("gtc", "GTC buy back", "0.10")}
      </div>
      {freeLots.length > 0 && (
        <label style={{ fontSize: 11, color: T.textDim, display: "block", marginTop: 12 }}>Covers which shares?
          <select value={f.lotId} onChange={set("lotId")} style={{ ...inp, marginTop: 4 }}>
            <option value="new">New purchase (creates a lot)</option>
            {freeLots.map((l) => (
              <option key={l.id} value={l.id}>{l.shares} sh @ ${Number(l.cost).toFixed(2)} — bought {l.bought}</option>
            ))}
          </select>
        </label>
      )}
      <button onClick={submit} style={{ marginTop: 14, padding: "10px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontWeight: 700, cursor: "pointer" }}>
        Save position
      </button>
    </div>
  );
}
