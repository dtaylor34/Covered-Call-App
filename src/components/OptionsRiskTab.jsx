// ─── src/components/OptionsRiskTab.jsx ───────────────────────────────────────
// Options Manager → Risk: profit/loss-at-expiry payoff diagram. A switch flips
// between PER-POSITION (pick one option) and PORTFOLIO (pick a symbol → all your
// legs on that underlying stacked into one combined payoff). Shows breakeven(s),
// current price, and max profit/loss across the plotted range.

import { useState, useMemo, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionPositions } from "../hooks/useOptionPositions";
import { optType, isLong } from "../lib/optionsMath";

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const px = (v) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One option leg → its P/L at an underlying price S at expiry.
function legFrom(p) {
  const qty = Math.max(1, Math.round(p.contracts || 1));
  const mult = Number(p.multiplier) || 100;
  const K = Number(p.strike) || 0;
  const fill = Number(p.fillPrice) || 0;
  const call = optType(p) === "CALL";
  const long = isLong(p);
  const entryPrem = fill * mult * qty;
  return { K, call, long, mult, qty, entryPrem };
}
function legPL(leg, S) {
  const intrinsic = leg.call ? Math.max(0, S - leg.K) : Math.max(0, leg.K - S);
  const val = intrinsic * leg.mult * leg.qty;
  return leg.long ? val - leg.entryPrem : leg.entryPrem - val;
}
const totalPL = (legs, S) => legs.reduce((a, l) => a + legPL(l, S), 0);

export default function OptionsRiskTab() {
  const { T } = useTheme();
  const { positions } = useOptionPositions();
  const [mode, setMode] = useState("position"); // position | portfolio
  const [selId, setSelId] = useState(null);
  const [selSym, setSelSym] = useState(null);

  const symbols = useMemo(() => [...new Set(positions.map((p) => p.sym).filter(Boolean))].sort(), [positions]);

  useEffect(() => { if (mode === "position" && !positions.find((p) => p.id === selId)) setSelId(positions[0]?.id ?? null); }, [mode, positions, selId]);
  useEffect(() => { if (mode === "portfolio" && !symbols.includes(selSym)) setSelSym(symbols[0] ?? null); }, [mode, symbols, selSym]);

  const { legs, currentU, title, subtitle } = useMemo(() => {
    if (mode === "position") {
      const p = positions.find((x) => x.id === selId) || positions[0];
      if (!p) return { legs: [], currentU: null, title: "", subtitle: "" };
      return { legs: [legFrom(p)], currentU: Number(p.liveUnderlying) || Number(p.fillUnderlying) || null, title: `${p.sym} ${optType(p)} ${px(p.strike)}`, subtitle: `${isLong(p) ? "Long" : "Short"} ×${p.contracts || 1} · exp ${p.expiry}` };
    }
    const sym = selSym || symbols[0];
    const ps = positions.filter((p) => p.sym === sym);
    if (!ps.length) return { legs: [], currentU: null, title: "", subtitle: "" };
    const cu = Number(ps.find((p) => p.liveUnderlying)?.liveUnderlying) || Number(ps[0]?.fillUnderlying) || null;
    return { legs: ps.map(legFrom), currentU: cu, title: `${sym} — portfolio`, subtitle: `${ps.length} leg${ps.length === 1 ? "" : "s"} stacked` };
  }, [mode, selId, selSym, positions, symbols]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const font = T.fontMono;
  const seg = (active) => ({ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", background: active ? T.accent : "transparent", color: active ? "#0A0A0A" : T.textDim, fontFamily: font, fontSize: 12, fontWeight: 700 });
  const sel = { minHeight: 40, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };

  return (
    <div role="region" aria-label="Options risk">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Risk · Payoff at expiry</h2>
        <div style={{ display: "flex", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 3, gap: 3 }}>
          <button onClick={() => setMode("position")} style={seg(mode === "position")}>Position</button>
          <button onClick={() => setMode("portfolio")} style={seg(mode === "portfolio")}>Portfolio</button>
        </div>
      </div>

      {positions.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px", color: T.textDim }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📈</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 6 }}>No option positions yet</div>
          <div style={{ fontSize: 13 }}>Add or import options in the Working tab to see their payoff diagram.</div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            {mode === "position" ? (
              <select value={selId || ""} onChange={(e) => setSelId(e.target.value)} style={sel}>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.sym} {optType(p)} {px(p.strike)} · {isLong(p) ? "long" : "short"} ×{p.contracts || 1} · {p.expiry}</option>)}
              </select>
            ) : (
              <select value={selSym || ""} onChange={(e) => setSelSym(e.target.value)} style={sel}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({positions.filter((p) => p.sym === s).length} leg{positions.filter((p) => p.sym === s).length === 1 ? "" : "s"})</option>)}
              </select>
            )}
            <div style={{ color: T.textDim, fontFamily: font, fontSize: 12 }}><b style={{ color: T.text }}>{title}</b> · {subtitle}</div>
          </div>
          <PayoffChart T={T} legs={legs} currentU={currentU} />
        </div>
      )}
    </div>
  );
}

function PayoffChart({ T, legs, currentU }) {
  const font = T.fontMono;
  const VBW = 900, VBH = 380, PL = 64, PR = 884, PT = 20, PB = 330;

  const geom = useMemo(() => {
    if (!legs.length) return null;
    const strikes = legs.map((l) => l.K).filter((k) => k > 0);
    const anchor = currentU || (strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : 100);
    const spanLo = Math.min(anchor, ...strikes), spanHi = Math.max(anchor, ...strikes);
    let lo = Math.max(0, spanLo * 0.7 - (spanHi - spanLo) * 0.1);
    let hi = spanHi * 1.3 + (spanHi - spanLo) * 0.1;
    if (hi <= lo) { lo = Math.max(0, anchor * 0.7); hi = anchor * 1.3 || 1; }
    const N = 160;
    const pts = [];
    for (let i = 0; i <= N; i++) { const S = lo + (hi - lo) * (i / N); pts.push({ S, pl: totalPL(legs, S) }); }
    // breakevens — sign changes
    const bes = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if ((a.pl <= 0 && b.pl > 0) || (a.pl >= 0 && b.pl < 0)) {
        const t = a.pl / (a.pl - b.pl);
        bes.push(a.S + (b.S - a.S) * t);
      }
    }
    const plVals = pts.map((p) => p.pl);
    let plHi = Math.max(0, ...plVals), plLo = Math.min(0, ...plVals);
    const padp = (plHi - plLo) * 0.12 || 1; plHi += padp; plLo -= padp;
    return { lo, hi, pts, bes, plHi, plLo, curPL: currentU ? totalPL(legs, currentU) : null };
  }, [legs, currentU]);

  if (!geom) return <div style={{ color: T.textDim, fontFamily: font, fontSize: 13 }}>No legs to plot.</div>;
  const { lo, hi, pts, bes, plHi, plLo, curPL } = geom;
  const xS = (S) => PL + ((S - lo) / ((hi - lo) || 1)) * (PR - PL);
  const yP = (pl) => PB - ((pl - plLo) / ((plHi - plLo) || 1)) * (PB - PT);
  const zeroY = yP(0);
  const maxProfit = Math.max(...pts.map((p) => p.pl));
  const maxLoss = Math.min(...pts.map((p) => p.pl));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const yTicks = [0, 1, 2, 3, 4].map((i) => plLo + (plHi - plLo) * (i / 4));

  // green/red payoff segments
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const up = (a.pl + b.pl) / 2 >= 0;
    segs.push({ x1: xS(a.S), y1: yP(a.pl), x2: xS(b.S), y2: yP(b.pl), up });
  }

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{usd(v, true)}</text></g>))}
        {xTicks.map((v, i) => (<text key={i} x={xS(v)} y={VBH - 8} textAnchor="middle" fontSize="10" fontFamily={font} fill={T.textDim}>{px(v)}</text>))}

        {/* zero P/L line */}
        <line x1={PL} y1={zeroY} x2={PR} y2={zeroY} stroke={T.textDim} strokeWidth="1.25" opacity="0.8" />

        {/* payoff curve, colored by profit/loss */}
        {segs.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.up ? T.success : T.danger} strokeWidth="2.5" />)}

        {/* breakevens */}
        {bes.map((be, i) => (<g key={i}><line x1={xS(be)} y1={PT} x2={xS(be)} y2={PB} stroke={T.warn || T.warning} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" /><text x={xS(be)} y={PT - 4} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.warn || T.warning}>BE {px(be)}</text></g>))}

        {/* current underlying */}
        {Number.isFinite(currentU) && (<g>
          <line x1={xS(currentU)} y1={PT} x2={xS(currentU)} y2={PB} stroke={T.accent} strokeWidth="1.25" opacity="0.7" />
          <circle cx={xS(currentU)} cy={yP(curPL || 0)} r="4.5" fill={T.accent} stroke={T.surface} strokeWidth="2" />
          <text x={xS(currentU)} y={VBH - 20} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.accent}>now {px(currentU)}</text>
        </g>)}
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 12 }}>
        <Stat T={T} label="P/L at current" value={curPL != null ? usd(curPL, true) : "—"} color={curPL == null ? T.text : curPL >= 0 ? T.success : T.danger} />
        <Stat T={T} label="Max profit (shown)" value={usd(maxProfit, true)} color={T.success} />
        <Stat T={T} label="Max loss (shown)" value={usd(maxLoss, true)} color={T.danger} />
        <Stat T={T} label="Breakeven" value={bes.length ? bes.map(px).join(" · ") : "—"} color={T.warn} />
      </div>
      <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 8, lineHeight: 1.5 }}>
        Profit/loss at <b>expiration</b> vs. the underlying price (green = profit, red = loss). "Max profit/loss (shown)" is across the plotted price range — a short call's loss and a long call's profit keep growing beyond the chart. Uses your entry prices; multipliers ×{legs[0]?.mult || 100}.
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
