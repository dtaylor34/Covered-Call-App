// ─── src/components/StrategyBuilder.jsx ──────────────────────────────────────
// Options Dashboard → Strategy Builder. Prices common multi-leg strategies
// (verticals, straddle, strangle, iron condor, butterfly, single legs) straight
// off the live chain the StrikesBrowser already loaded, using bid/ask mids.
// Shows the legs, net debit/credit, max profit/loss, breakevens, and the
// payoff at expiration. Pure client-side math, no extra API calls.
//
// Props: rows  — [{ strike, call:{bid,ask,lastPrice}, put:{...} }] sorted by strike
//        under — underlying price
//        mult  — contract multiplier (100 for equity/ETF options)

import { useState, useEffect, useMemo } from "react";

// Leg offsets are strike-index steps from the at-the-money row (ATM = 0).
// `n` = how many strike pickers the strategy uses; legs read picker values k[i].
const STRATS = {
  "Long call":    { n: 1, d: [1],           legs: (k) => [["C", k[0], 1]] },
  "Long put":     { n: 1, d: [-1],          legs: (k) => [["P", k[0], 1]] },
  "Bull call":    { n: 2, d: [0, 3],        legs: (k) => [["C", k[0], 1], ["C", k[1], -1]] },
  "Bear put":     { n: 2, d: [-3, 0],       legs: (k) => [["P", k[1], 1], ["P", k[0], -1]] },
  "Straddle":     { n: 1, d: [0],           legs: (k) => [["C", k[0], 1], ["P", k[0], 1]] },
  "Strangle":     { n: 2, d: [-2, 2],       legs: (k) => [["P", k[0], 1], ["C", k[1], 1]] },
  "Iron condor":  { n: 4, d: [-5, -3, 3, 5], legs: (k) => [["P", k[0], 1], ["P", k[1], -1], ["C", k[2], -1], ["C", k[3], 1]] },
  "Butterfly":    { n: 3, d: [-2, 0, 2],    legs: (k) => [["C", k[0], 1], ["C", k[1], -2], ["C", k[2], 1]] },
};
const LABELS = ["A", "B", "C", "D"];

const mid = (o) => (o?.bid > 0 && o?.ask > 0 ? (o.bid + o.ask) / 2 : o?.lastPrice || o?.ask || o?.bid || 0);
const usd = (v) => "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
const pay = (legs, x) => legs.reduce((s, l) => s + l.q * (l.t === "C" ? Math.max(x - l.k, 0) : Math.max(l.k - x, 0)), 0);

const VBW = 840, VBH = 240, PL = 64, PR = 828, PT = 14, PB = 206;

export default function StrategyBuilder({ rows, under, mult = 100, T }) {
  const [strat, setStrat] = useState("Strangle");
  const [ks, setKs] = useState([]);
  const [qty, setQty] = useState(1);
  const [hoverX, setHoverX] = useState(null);
  const strikes = useMemo(() => rows.map((r) => r.strike), [rows]);
  const byStrike = useMemo(() => Object.fromEntries(rows.map((r) => [r.strike, r])), [rows]);
  const st = STRATS[strat];

  // Re-seed pickers around the money whenever the strategy or chain changes.
  useEffect(() => {
    if (!strikes.length) return;
    let atm = 0, best = Infinity;
    strikes.forEach((s, i) => { const d = Math.abs(s - under); if (d < best) { best = d; atm = i; } });
    setKs(st.d.map((o) => strikes[Math.max(0, Math.min(strikes.length - 1, atm + o))]));
  }, [strat, strikes, under]); // eslint-disable-line

  const legs = useMemo(() => {
    if (ks.length < st.n) return [];
    return st.legs(ks).map(([t, k, q]) => ({ t, k, q, px: mid(t === "C" ? byStrike[k]?.call : byStrike[k]?.put) }));
  }, [ks, st, byStrike]);

  const calc = useMemo(() => {
    if (!legs.length) return null;
    const net = legs.reduce((s, l) => s + l.q * l.px, 0); // per-share; >0 = debit
    const ksAll = legs.map((l) => l.k);
    const span = Math.max(...ksAll) - Math.min(...ksAll) || under * 0.05 || 1;
    const lo = Math.max(0, Math.min(...ksAll, under) - span * 1.2), hi = Math.max(...ksAll, under) + span * 1.2;
    const N = 240, pts = [];
    for (let i = 0; i <= N; i++) { const x = lo + ((hi - lo) * i) / N; pts.push({ x, y: (pay(legs, x) - net) * mult * qty }); }
    const be = [];
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((a.y < 0) !== (b.y < 0)) be.push(a.x + ((b.x - a.x) * -a.y) / (b.y - a.y));
    }
    const callQ = legs.reduce((s, l) => s + (l.t === "C" ? l.q : 0), 0);
    const ys = pts.map((p) => p.y);
    return { net, pts, be, lo, hi, maxP: callQ > 0 ? Infinity : Math.max(...ys), maxL: callQ < 0 ? -Infinity : Math.min(...ys), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [legs, under, mult, qty]);

  if (!rows.length) return null;
  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const chip = (a) => ({ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const inp = { height: 32, padding: "0 8px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 12 };
  const stat = (label, val, color) => (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", minWidth: 130, flex: 1 }}>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: font, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 16, fontFamily: font, fontWeight: 700, marginTop: 2 }}>{val}</div>
    </div>
  );

  // Chart scales
  let chart = null;
  if (calc) {
    const { pts, lo, hi } = calc;
    const yPad = (calc.maxY - calc.minY) * 0.1 || 100;
    const y0 = Math.min(calc.minY, 0) - yPad, y1 = Math.max(calc.maxY, 0) + yPad;
    const xS = (x) => PL + ((x - lo) / (hi - lo)) * (PR - PL);
    const yS = (y) => PB - ((y - y0) / (y1 - y0)) * (PB - PT);
    const path = pts.map((p, i) => (i ? "L" : "M") + xS(p.x).toFixed(1) + " " + yS(p.y).toFixed(1)).join(" ");
    const zero = yS(0);
    const yTicks = [0, 1, 2, 3, 4].map((i) => y0 + ((y1 - y0) * i) / 4);
    const xTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
    const hv = hoverX != null ? { x: hoverX, y: (pay(legs, hoverX) - calc.net) * mult * qty } : null;
    const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const vbx = ((e.clientX - r.left) / r.width) * VBW; setHoverX(Math.max(lo, Math.min(hi, lo + ((vbx - PL) / (PR - PL)) * (hi - lo)))); };
    chart = (
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverX(null)}>
          <defs>
            <clipPath id="sbUp"><rect x={PL} y={PT} width={PR - PL} height={Math.max(0, zero - PT)} /></clipPath>
            <clipPath id="sbDn"><rect x={PL} y={zero} width={PR - PL} height={Math.max(0, PB - zero)} /></clipPath>
          </defs>
          {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yS(v)} x2={PR} y2={yS(v)} stroke={T.border} opacity="0.4" /><text x={PL - 8} y={yS(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{(v < 0 ? "-" : "") + usd(v)}</text></g>))}
          <line x1={PL} y1={zero} x2={PR} y2={zero} stroke={T.textDim} strokeWidth="1" />
          <path d={`${path} L ${PR} ${zero} L ${PL} ${zero} Z`} fill={T.success} opacity="0.12" clipPath="url(#sbUp)" />
          <path d={`${path} L ${PR} ${zero} L ${PL} ${zero} Z`} fill={T.danger} opacity="0.12" clipPath="url(#sbDn)" />
          <path d={path} fill="none" stroke={T.success} strokeWidth="2" clipPath="url(#sbUp)" />
          <path d={path} fill="none" stroke={T.danger} strokeWidth="2" clipPath="url(#sbDn)" />
          {under > lo && under < hi && (<g><line x1={xS(under)} y1={PT} x2={xS(under)} y2={PB} stroke={T.accent} strokeDasharray="4 4" /><text x={xS(under) + 4} y={PT + 10} fontSize="10" fontFamily={font} fill={T.accent}>now {under.toFixed(2)}</text></g>)}
          {xTicks.map((x, i) => (<text key={i} x={xS(x)} y={VBH - 8} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize="10" fontFamily={font} fill={T.textDim}>{x.toFixed(2)}</text>))}
          {hv && (<g><line x1={xS(hv.x)} y1={PT} x2={xS(hv.x)} y2={PB} stroke={T.textDim} strokeDasharray="3 3" /><circle cx={xS(hv.x)} cy={yS(hv.y)} r="4" fill={hv.y >= 0 ? T.success : T.danger} stroke={T.surface} strokeWidth="2" /></g>)}
        </svg>
        {hv && (<div style={{ position: "absolute", top: 0, left: `${(xS(hv.x) / VBW) * 100}%`, transform: `translateX(${xS(hv.x) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap" }}>
          <div style={{ color: hv.y >= 0 ? T.success : T.danger, fontWeight: 700 }}>{hv.y >= 0 ? "+" : "-"}{usd(hv.y)}</div>
          <div style={{ color: T.textDim, marginTop: 2 }}>at {hv.x.toFixed(2)}</div>
        </div>)}
      </div>
    );
  }

  return (
    <div style={card} role="region" aria-label="Strategy builder">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0, fontWeight: 600 }}>Strategy Builder</h3>
        <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>P&L at expiration · mid prices · ×{mult}</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.keys(STRATS).map((s) => <button key={s} onClick={() => setStrat(s)} style={chip(strat === s)}>{s}</button>)}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
        {Array.from({ length: st.n }, (_, i) => (
          <label key={i} style={{ display: "flex", flexDirection: "column", gap: 4, color: T.textDim, fontSize: 10, fontFamily: font, textTransform: "uppercase" }}>
            Strike {LABELS[i]}
            <select value={ks[i] ?? ""} onChange={(e) => setKs((p) => p.map((v, j) => (j === i ? Number(e.target.value) : v)))} style={{ ...inp, width: 96, cursor: "pointer" }}>
              {strikes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        ))}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, color: T.textDim, fontSize: 10, fontFamily: font, textTransform: "uppercase" }}>
          Qty
          <input type="number" min="1" max="100" value={qty} onChange={(e) => setQty(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={{ ...inp, width: 70 }} />
        </label>
      </div>

      {legs.length > 0 && (
        <div style={{ fontFamily: font, fontSize: 12, color: T.textDim, lineHeight: 1.8, marginBottom: 12 }}>
          {legs.map((l, i) => (
            <div key={i}>
              <span style={{ color: l.q > 0 ? T.success : T.danger, fontWeight: 700 }}>{l.q > 0 ? "BUY " : "SELL"}</span>{" "}
              {l.q > 0 ? "+" : "-"}{Math.abs(l.q) * qty} {l.k} {l.t === "C" ? "CALL" : "PUT"} @ {l.px > 0 ? l.px.toFixed(2) : "no quote"}
            </div>
          ))}
        </div>
      )}

      {calc && (<>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {stat(calc.net >= 0 ? "Net debit" : "Net credit", usd(calc.net * mult * qty))}
          {stat("Max profit", calc.maxP === Infinity ? "Unlimited" : usd(Math.max(calc.maxP, 0)), T.success)}
          {stat("Max loss", calc.maxL === -Infinity ? "Unlimited" : usd(Math.min(calc.maxL, 0)), T.danger)}
          {stat("Breakevens", calc.be.length ? calc.be.map((b) => b.toFixed(2)).join(" / ") : "None")}
        </div>
        {chart}
      </>)}
    </div>
  );
}
