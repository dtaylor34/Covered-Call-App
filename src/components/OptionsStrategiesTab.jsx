// ─── src/components/OptionsStrategiesTab.jsx ─────────────────────────────────
// Options Manager → Strategies: a fully editable, free-form multi-leg builder.
// Add/edit/remove any legs (buy/sell · call/put · strike · premium · qty), start
// from optional presets (strangle, iron condor, verticals, …), estimate premiums
// with Black-Scholes, and see the combined payoff at expiry — breakevens, max
// profit/loss, profit zone, and the current price. Save each as a named setup and
// switch between them from the dropdown.

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionStrategies } from "../hooks/useOptionStrategies";
import { getPriceHistory } from "../services/priceHistory";
import { callVal, putVal } from "../lib/coveredCallMath";

const usd = (n, signed) => { const a = Math.abs(n || 0); const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s; return (n < -0.005 ? "−" : "") + s; };
const px = (v) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const strikeStep = (p) => (p > 200 ? 5 : p > 50 ? 1 : 0.5);
const rnd = (x, step) => Math.round(x / step) * step;

const emptyDraft = { id: null, name: "New strategy", sym: "", underlying: "", iv: "25", dte: "30", mult: 100, legs: [{ dir: "buy", type: "CALL", strike: "", premium: "", contracts: "1" }] };

function estPrem(type, S, K, dte, ivPct) {
  const iv = (num(ivPct) || 25) / 100, days = num(dte) || 30;
  if (!(S > 0) || !(K > 0) || !(iv > 0)) return 0;
  const v = type === "CALL" ? callVal(S, K, days, iv) : putVal(S, K, days, iv);
  return Math.round((v || 0) * 100) / 100;
}

// Preset leg templates (strikes relative to the underlying). Premiums filled in later.
const PRESETS = {
  "Long strangle": (S, st) => [{ dir: "buy", type: "CALL", strike: rnd(S * 1.05, st) }, { dir: "buy", type: "PUT", strike: rnd(S * 0.95, st) }],
  "Short strangle": (S, st) => [{ dir: "sell", type: "CALL", strike: rnd(S * 1.05, st) }, { dir: "sell", type: "PUT", strike: rnd(S * 0.95, st) }],
  "Long straddle": (S, st) => [{ dir: "buy", type: "CALL", strike: rnd(S, st) }, { dir: "buy", type: "PUT", strike: rnd(S, st) }],
  "Iron condor": (S, st) => [{ dir: "sell", type: "PUT", strike: rnd(S * 0.95, st) }, { dir: "buy", type: "PUT", strike: rnd(S * 0.90, st) }, { dir: "sell", type: "CALL", strike: rnd(S * 1.05, st) }, { dir: "buy", type: "CALL", strike: rnd(S * 1.10, st) }],
  "Call debit spread": (S, st) => [{ dir: "buy", type: "CALL", strike: rnd(S, st) }, { dir: "sell", type: "CALL", strike: rnd(S * 1.05, st) }],
  "Put debit spread": (S, st) => [{ dir: "buy", type: "PUT", strike: rnd(S, st) }, { dir: "sell", type: "PUT", strike: rnd(S * 0.95, st) }],
};

// P/L of one leg at underlying price S.
function legPL(l, S) {
  const K = num(l.strike), prem = num(l.premium), qty = Math.max(1, Math.round(num(l.contracts) || 1)), mult = num(l.mult) || 100;
  const isCall = String(l.type).toUpperCase() === "CALL", long = l.dir !== "sell";
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  const val = intrinsic * mult * qty, entry = prem * mult * qty;
  return long ? val - entry : entry - val;
}

export default function OptionsStrategiesTab() {
  const { T } = useTheme();
  const { strategies, saveStrategy, deleteStrategy } = useOptionStrategies();
  const [draft, setDraft] = useState(emptyDraft);
  const [priceLoading, setPriceLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = (s) => setDraft(s ? { ...s, underlying: String(s.underlying ?? ""), iv: String(s.iv ?? "25"), dte: String(s.dte ?? "30"), legs: (s.legs || []).map((l) => ({ ...l, strike: String(l.strike ?? ""), premium: String(l.premium ?? ""), contracts: String(l.contracts ?? "1") })) } : { ...emptyDraft });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setLeg = (i, patch) => setDraft((d) => ({ ...d, legs: d.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLeg = () => setDraft((d) => ({ ...d, legs: [...d.legs, { dir: "buy", type: "CALL", strike: "", premium: "", contracts: "1" }] }));
  const removeLeg = (i) => setDraft((d) => ({ ...d, legs: d.legs.filter((_, j) => j !== i) }));

  const S = num(draft.underlying), mult = num(draft.mult) || 100;
  const legsM = useMemo(() => draft.legs.map((l) => ({ ...l, mult })), [draft.legs, mult]);

  const fetchPrice = async () => {
    const sym = String(draft.sym || "").trim().toUpperCase();
    if (!sym) { setMsg("Enter a symbol first."); return; }
    setPriceLoading(true); setMsg("");
    try { const r = await getPriceHistory(sym, "1M"); set({ underlying: String(Math.round((r.price || r.points?.[r.points.length - 1]?.c || 0) * 100) / 100) }); }
    catch { setMsg("Couldn't fetch price."); }
    finally { setPriceLoading(false); }
  };
  const applyPreset = (name) => {
    if (!(S > 0)) { setMsg("Set the underlying price first (so strikes/premiums can be estimated)."); return; }
    const st = strikeStep(S);
    const legs = PRESETS[name](S, st).map((l) => ({ ...l, contracts: "1", strike: String(l.strike), premium: String(estPrem(l.type, S, num(l.strike), draft.dte, draft.iv)) }));
    set({ legs, name: draft.id ? draft.name : name }); setMsg("");
  };
  const estimateAll = () => {
    if (!(S > 0)) { setMsg("Set the underlying price first."); return; }
    setDraft((d) => ({ ...d, legs: d.legs.map((l) => ({ ...l, premium: String(estPrem(String(l.type).toUpperCase(), S, num(l.strike), d.dte, d.iv)) })) }));
  };
  const save = async () => { const r = await saveStrategy({ ...draft, underlying: S, iv: num(draft.iv), dte: num(draft.dte), mult }); if (r.ok) { setDraft((d) => ({ ...d, id: r.id })); setMsg("Saved."); } };
  const del = async () => { if (draft.id) { await deleteStrategy(draft.id); load(null); setMsg("Deleted."); } };

  // Net credit(+)/debit(−) and payoff stats
  const netCredit = useMemo(() => legsM.reduce((a, l) => a + (l.dir === "sell" ? 1 : -1) * num(l.premium) * mult * Math.max(1, Math.round(num(l.contracts) || 1)), 0), [legsM, mult]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const font = T.fontMono;
  const inp = { minHeight: 38, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };
  const smallSel = { minHeight: 34, padding: "0 6px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 12 };
  const pill = (a) => ({ padding: "5px 11px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });

  return (
    <div role="region" aria-label="Option strategies">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Strategies · Custom builder</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={draft.id || ""} onChange={(e) => load(strategies.find((s) => s.id === e.target.value) || null)} style={inp}>
            <option value="">＋ New strategy</option>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sym ? ` · ${s.sym}` : ""}</option>)}
          </select>
          <button onClick={() => load(null)} style={pill(false)}>＋ New</button>
        </div>
      </div>

      <div style={card}>
        {/* setup */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: T.textDim }}>Name<br /><input value={draft.name} onChange={(e) => set({ name: e.target.value })} style={{ ...inp, width: 180 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Symbol<br /><input value={draft.sym} onChange={(e) => set({ sym: e.target.value.toUpperCase() })} placeholder="TLT" style={{ ...inp, width: 90 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Underlying price<br />
            <span style={{ display: "flex", gap: 6 }}>
              <input value={draft.underlying} onChange={(e) => set({ underlying: e.target.value })} style={{ ...inp, width: 90 }} />
              <button onClick={fetchPrice} disabled={priceLoading} style={pill(false)}>{priceLoading ? "…" : "↻"}</button>
            </span></label>
          <label style={{ fontSize: 11, color: T.textDim }}>IV %<br /><input value={draft.iv} onChange={(e) => set({ iv: e.target.value })} style={{ ...inp, width: 64 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>DTE<br /><input value={draft.dte} onChange={(e) => set({ dte: e.target.value })} style={{ ...inp, width: 64 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Multiplier<br /><input value={draft.mult} onChange={(e) => set({ mult: e.target.value })} style={{ ...inp, width: 80 }} /></label>
        </div>

        {/* presets */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <span style={{ color: T.textDim, fontFamily: font, fontSize: 11 }}>Start from:</span>
          {Object.keys(PRESETS).map((name) => <button key={name} onClick={() => applyPreset(name)} style={pill(false)}>{name}</button>)}
        </div>

        {/* legs editor */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 90px 1fr 1fr 80px 40px", gap: 8, padding: "0 2px 6px", color: T.textDim, fontSize: 9, fontFamily: font, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>
              <div>Side</div><div>Type</div><div>Strike</div><div>Premium</div><div>Qty</div><div></div>
            </div>
            {draft.legs.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 90px 1fr 1fr 80px 40px", gap: 8, marginBottom: 6, alignItems: "center" }}>
                <select value={l.dir} onChange={(e) => setLeg(i, { dir: e.target.value })} style={{ ...smallSel, color: l.dir === "buy" ? T.success : T.danger, fontWeight: 700 }}><option value="buy">Buy</option><option value="sell">Sell</option></select>
                <select value={l.type} onChange={(e) => setLeg(i, { type: e.target.value })} style={smallSel}><option value="CALL">Call</option><option value="PUT">Put</option></select>
                <input value={l.strike} onChange={(e) => setLeg(i, { strike: e.target.value })} placeholder="strike" style={{ ...smallSel, minHeight: 36 }} />
                <input value={l.premium} onChange={(e) => setLeg(i, { premium: e.target.value })} placeholder="premium" style={{ ...smallSel, minHeight: 36 }} />
                <input value={l.contracts} onChange={(e) => setLeg(i, { contracts: e.target.value })} style={{ ...smallSel, minHeight: 36, width: 70 }} />
                <button onClick={() => removeLeg(i)} title="Remove leg" style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.danger, borderRadius: 6, cursor: "pointer", height: 34, fontFamily: font }}>✕</button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={addLeg} style={pill(false)}>＋ Add leg</button>
          <button onClick={estimateAll} style={pill(false)}>Estimate premiums (B-S)</button>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={save} style={{ ...pill(true) }}>💾 Save</button>
            {draft.id && <button onClick={del} style={{ ...pill(false), color: T.danger, borderColor: T.danger }}>Delete</button>}
          </span>
        </div>
        {msg && <div style={{ color: msg === "Saved." ? T.success : T.textDim, fontFamily: font, fontSize: 12, marginTop: 8 }}>{msg}</div>}
        <div style={{ color: T.textMuted || T.textDim, fontSize: 11, fontFamily: font, marginTop: 8 }}>
          Net {netCredit >= 0 ? "credit received" : "debit paid"}: <b style={{ color: netCredit >= 0 ? T.success : T.text }}>{usd(Math.abs(netCredit))}</b>. Premiums are your inputs (or B-S estimates from IV/DTE) — edit freely.
        </div>
      </div>

      {/* payoff */}
      {legsM.length > 0 && legsM.some((l) => num(l.strike) > 0) && (
        <div style={card}>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 8 }}>Payoff at expiry {draft.sym ? `· ${draft.sym}` : ""}</div>
          <PayoffChart T={T} legs={legsM} currentU={S} />
        </div>
      )}
    </div>
  );
}

function PayoffChart({ T, legs, currentU }) {
  const font = T.fontMono;
  const VBW = 900, VBH = 360, PL = 64, PR = 884, PT = 20, PB = 310;

  const geom = useMemo(() => {
    const strikes = legs.map((l) => num(l.strike)).filter((k) => k > 0);
    if (!strikes.length) return null;
    const anchor = currentU > 0 ? currentU : strikes.reduce((a, b) => a + b, 0) / strikes.length;
    let lo = Math.max(0, Math.min(anchor, ...strikes) * 0.75 - 1);
    let hi = Math.max(anchor, ...strikes) * 1.25 + 1;
    if (hi <= lo) { lo = Math.max(0, anchor * 0.7); hi = anchor * 1.3 || 1; }
    const N = 180, pts = [];
    for (let i = 0; i <= N; i++) { const S = lo + (hi - lo) * (i / N); pts.push({ S, pl: legs.reduce((a, l) => a + legPL(l, S), 0) }); }
    const bes = [];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if ((a.pl <= 0 && b.pl > 0) || (a.pl >= 0 && b.pl < 0)) { const t = a.pl / (a.pl - b.pl); bes.push(a.S + (b.S - a.S) * t); } }
    let plHi = Math.max(0, ...pts.map((p) => p.pl)), plLo = Math.min(0, ...pts.map((p) => p.pl));
    const pad = (plHi - plLo) * 0.12 || 1; plHi += pad; plLo -= pad;
    return { lo, hi, pts, bes, plHi, plLo, curPL: currentU > 0 ? legs.reduce((a, l) => a + legPL(l, currentU), 0) : null };
  }, [legs, currentU]);

  if (!geom) return <div style={{ color: T.textDim, fontFamily: font, fontSize: 13 }}>Add at least one leg with a strike.</div>;
  const { lo, hi, pts, bes, plHi, plLo, curPL } = geom;
  const xS = (S) => PL + ((S - lo) / ((hi - lo) || 1)) * (PR - PL);
  const yP = (pl) => PB - ((pl - plLo) / ((plHi - plLo) || 1)) * (PB - PT);
  const zeroY = yP(0);
  const maxProfit = Math.max(...pts.map((p) => p.pl)), maxLoss = Math.min(...pts.map((p) => p.pl));
  const yTicks = [0, 1, 2, 3, 4].map((i) => plLo + (plHi - plLo) * (i / 4));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; segs.push({ x1: xS(a.S), y1: yP(a.pl), x2: xS(b.S), y2: yP(b.pl), up: (a.pl + b.pl) / 2 >= 0 }); }

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{usd(v, true)}</text></g>))}
        {xTicks.map((v, i) => <text key={i} x={xS(v)} y={VBH - 8} textAnchor="middle" fontSize="10" fontFamily={font} fill={T.textDim}>{px(v)}</text>)}
        <line x1={PL} y1={zeroY} x2={PR} y2={zeroY} stroke={T.textDim} strokeWidth="1.25" opacity="0.8" />
        {segs.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.up ? T.success : T.danger} strokeWidth="2.5" />)}
        {bes.map((be, i) => (<g key={i}><line x1={xS(be)} y1={PT} x2={xS(be)} y2={PB} stroke={T.warn || T.warning} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" /><text x={xS(be)} y={PT - 4} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.warn || T.warning}>BE {px(be)}</text></g>))}
        {currentU > 0 && (<g><line x1={xS(currentU)} y1={PT} x2={xS(currentU)} y2={PB} stroke={T.accent} strokeWidth="1.25" opacity="0.7" /><circle cx={xS(currentU)} cy={yP(curPL || 0)} r="4.5" fill={T.accent} stroke={T.surface} strokeWidth="2" /><text x={xS(currentU)} y={VBH - 20} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.accent}>now {px(currentU)}</text></g>)}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 12 }}>
        <Stat T={T} label="P/L at current" value={curPL != null ? usd(curPL, true) : "—"} color={curPL == null ? T.text : curPL >= 0 ? T.success : T.danger} />
        <Stat T={T} label="Max profit (shown)" value={usd(maxProfit, true)} color={T.success} />
        <Stat T={T} label="Max loss (shown)" value={usd(maxLoss, true)} color={T.danger} />
        <Stat T={T} label="Breakeven(s)" value={bes.length ? bes.map(px).join(" · ") : "—"} color={T.warn} />
      </div>
      <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 8, lineHeight: 1.5 }}>
        Combined P/L at expiration vs. the underlying price (green = profit, red = loss). "Max profit/loss (shown)" is across the plotted range — unlimited-risk legs (naked short, long single option) keep moving beyond the chart edges.
      </div>
    </div>
  );
}

function Stat({ T, label, value, color }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
