// ─── src/components/StrategyPositionChart.jsx ────────────────────────────────
// One chart to read all aspects of a working multi-leg option position:
//   • Payoff at expiration (solid, green above 0 / red below) + the current
//     mark-to-model P&L curve (dashed) across underlying price.
//   • "Now" line, each leg strike, breakeven dots, and profit-take / stop levels.
//   • A time-decay strip: strategy P&L if price holds, from today → expiration.
// Pure client-side math via optionStrategies (Black-Scholes). Hover for P&L.

import { useState } from "react";
import { payoffExp, valueNow } from "../lib/optionStrategies";

const VBW = 840, VBH = 230, PL = 70, PR = 828, PT = 14, PB = 196;
const DVBW = 840, DVBH = 112, DPT = 10, DPB = 88;
const usd = (v) => (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");

export default function StrategyPositionChart({ calc, targets, T }) {
  const [hoverX, setHoverX] = useState(null);
  const { per, S, dte, breakevens = [] } = calc;
  if (!per?.length || !(S > 0)) return null;
  const font = T.fontMono;

  const strikes = per.map((x) => x.c.K).filter((k) => k > 0);
  const span = (Math.max(...strikes) - Math.min(...strikes)) || S * 0.1 || 1;
  const lo = Math.max(0, Math.min(...strikes, S) - span * 1.5);
  const hi = Math.max(...strikes, S) + span * 1.5;

  const N = 160;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const expY = xs.map((x) => payoffExp(per, x));
  const nowY = xs.map((x) => valueNow(per, x, dte));

  const tLevels = (targets?.targets || []).map((t) => t.plDollar).filter((v) => Number.isFinite(v));
  const allY = [...expY, ...nowY, ...tLevels, 0];
  let y0 = Math.min(...allY), y1 = Math.max(...allY);
  const yPad = (y1 - y0) * 0.12 || 100; y0 -= yPad; y1 += yPad;

  const xS = (x) => PL + ((x - lo) / (hi - lo)) * (PR - PL);
  const yS = (y) => PB - ((y - y0) / (y1 - y0)) * (PB - PT);
  const zero = yS(0);
  const path = (arr) => arr.map((y, i) => (i ? "L" : "M") + xS(xs[i]).toFixed(1) + " " + yS(y).toFixed(1)).join(" ");

  const hv = hoverX != null ? { x: hoverX, exp: payoffExp(per, hoverX), now: valueNow(per, hoverX, dte) } : null;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vbx = ((e.clientX - r.left) / r.width) * VBW;
    setHoverX(Math.max(lo, Math.min(hi, lo + ((vbx - PL) / (PR - PL)) * (hi - lo))));
  };
  const xTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);

  // Time-decay strip: P&L if the underlying holds at S, from today (dte) → expiry (0).
  const dN = 60, days = Array.from({ length: dN + 1 }, (_, i) => dte - (dte * i) / dN);
  const decY = days.map((d) => valueNow(per, S, d));
  let d0 = Math.min(...decY, 0), d1 = Math.max(...decY, 0);
  const dPad = (d1 - d0) * 0.15 || 50; d0 -= dPad; d1 += dPad;
  const dxS = (d) => PL + (1 - d / (dte || 1)) * (PR - PL); // left = today, right = expiry
  const dyS = (y) => DPB - ((y - d0) / (d1 - d0)) * (DPB - DPT);
  const decPath = decY.map((y, i) => (i ? "L" : "M") + dxS(days[i]).toFixed(1) + " " + dyS(y).toFixed(1)).join(" ");
  const manageX = (targets?.manageDte ?? 21) < dte ? dxS(targets.manageDte) : null;

  const lineLabel = (y, text, color) => (y > PT + 6 && y < PB - 2) && (
    <g>
      <line x1={PL} y1={y} x2={PR} y2={y} stroke={color} strokeDasharray="2 3" opacity="0.7" />
      <text x={PR} y={y - 3} textAnchor="end" fontSize="9" fontFamily={font} fill={color}>{text}</text>
    </g>
  );

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", margin: "12px 0" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 14 }}>Payoff & current P&L</span>
        <Legend T={T} color={T.text} dash>at expiration</Legend>
        <Legend T={T} color={T.accent}>now (mark-to-model)</Legend>
        <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>IV from live marks · {dte}d left</span>
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverX(null)}>
          <defs>
            <clipPath id="spcUp"><rect x={PL} y={PT} width={PR - PL} height={Math.max(0, zero - PT)} /></clipPath>
            <clipPath id="spcDn"><rect x={PL} y={zero} width={PR - PL} height={Math.max(0, PB - zero)} /></clipPath>
          </defs>
          {[0, 1, 2, 3, 4].map((i) => { const y = y0 + ((y1 - y0) * i) / 4; const py = yS(y); return (
            <g key={i}><line x1={PL} y1={py} x2={PR} y2={py} stroke={T.border} opacity="0.35" /><text x={PL - 8} y={py + 3} textAnchor="end" fontSize="9" fontFamily={font} fill={T.textDim}>{usd(y)}</text></g>
          ); })}
          <line x1={PL} y1={zero} x2={PR} y2={zero} stroke={T.textDim} strokeWidth="1" />

          {/* profit-take / stop levels */}
          {(targets?.targets || []).map((t, i) => Number.isFinite(t.plDollar) && (
            <g key={i}>{lineLabel(yS(t.plDollar), t.label, t.stop ? T.danger : T.success)}</g>
          ))}

          {/* expiration payoff (solid, clipped up/down) + shaded fills */}
          <path d={`${path(expY)} L ${PR} ${zero} L ${PL} ${zero} Z`} fill={T.success} opacity="0.1" clipPath="url(#spcUp)" />
          <path d={`${path(expY)} L ${PR} ${zero} L ${PL} ${zero} Z`} fill={T.danger} opacity="0.1" clipPath="url(#spcDn)" />
          <path d={path(expY)} fill="none" stroke={T.success} strokeWidth="2" clipPath="url(#spcUp)" />
          <path d={path(expY)} fill="none" stroke={T.danger} strokeWidth="2" clipPath="url(#spcDn)" />
          {/* current P&L (dashed) */}
          <path d={path(nowY)} fill="none" stroke={T.accent} strokeWidth="1.6" strokeDasharray="5 3" opacity="0.95" />

          {/* strikes */}
          {strikes.map((k, i) => (<line key={i} x1={xS(k)} y1={PT} x2={xS(k)} y2={PB} stroke={T.border} strokeDasharray="1 4" opacity="0.6" />))}
          {/* breakevens */}
          {breakevens.map((b, i) => (<circle key={i} cx={xS(b)} cy={zero} r="3.5" fill={T.warn} stroke={T.surface} strokeWidth="1.5" />))}
          {/* now */}
          <line x1={xS(S)} y1={PT} x2={xS(S)} y2={PB} stroke={T.accent} strokeDasharray="4 4" />
          <text x={xS(S) + 4} y={PT + 10} fontSize="9" fontFamily={font} fill={T.accent}>now {S.toFixed(2)}</text>

          {xTicks.map((x, i) => (<text key={i} x={xS(x)} y={VBH - 6} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize="9" fontFamily={font} fill={T.textDim}>{x.toFixed(0)}</text>))}
          {hv && (<g><line x1={xS(hv.x)} y1={PT} x2={xS(hv.x)} y2={PB} stroke={T.textDim} strokeDasharray="3 3" /><circle cx={xS(hv.x)} cy={yS(hv.now)} r="3.5" fill={T.accent} stroke={T.surface} strokeWidth="1.5" /><circle cx={xS(hv.x)} cy={yS(hv.exp)} r="3.5" fill={hv.exp >= 0 ? T.success : T.danger} stroke={T.surface} strokeWidth="1.5" /></g>)}
        </svg>
        {hv && (
          <div style={{ position: "absolute", top: 0, left: `${(xS(hv.x) / VBW) * 100}%`, transform: `translateX(${xS(hv.x) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap" }}>
            <div style={{ color: T.textDim }}>at {hv.x.toFixed(2)}</div>
            <div style={{ color: hv.now >= 0 ? T.success : T.danger }}>now {usd(hv.now)}</div>
            <div style={{ color: hv.exp >= 0 ? T.success : T.danger }}>exp {usd(hv.exp)}</div>
          </div>
        )}
      </div>

      {/* Time-decay strip */}
      <div style={{ color: T.textDim, fontSize: 11, fontFamily: font, margin: "8px 0 2px" }}>Time decay — P&L if price holds at {S.toFixed(2)} (today → expiry)</div>
      <svg viewBox={`0 0 ${DVBW} ${DVBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={PL} y1={dyS(0)} x2={PR} y2={dyS(0)} stroke={T.textDim} strokeWidth="1" />
        <path d={decPath} fill="none" stroke={T.warn} strokeWidth="2" />
        <circle cx={dxS(dte)} cy={dyS(decY[0])} r="3.5" fill={T.accent} stroke={T.surface} strokeWidth="1.5" />
        <text x={PL} y={DVBH - 2} fontSize="9" fontFamily={font} fill={T.textDim}>today · {dte}d</text>
        <text x={PR} y={DVBH - 2} textAnchor="end" fontSize="9" fontFamily={font} fill={T.textDim}>expiry</text>
        {manageX != null && (<g><line x1={manageX} y1={DPT} x2={manageX} y2={DPB} stroke={T.warn} strokeDasharray="3 3" opacity="0.8" /><text x={manageX + 3} y={DPT + 8} fontSize="8" fontFamily={font} fill={T.warn}>manage {targets.manageDte}d</text></g>)}
      </svg>
    </div>
  );
}

function Legend({ T, color, dash, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: T.textDim, fontSize: 11, fontFamily: T.fontMono }}>
      <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash ? "5 3" : "0"} /></svg>
      {children}
    </span>
  );
}
