// ─── src/components/ClosedTradeChart.jsx ─────────────────────────────────────
// Lifecycle chart for a CLOSED covered call: the stock from (a little before)
// entry through exit, with the strike + breakeven, an "entry" vertical, and the
// trigger/sale marked with a circle inside a white square (colored by outcome:
// bought back / expired / called away). For review — what happened and when.

import { useState, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";

const VBW = 820, VBH = 240, PL = 54, PR = 806, PT = 16, PB = 210;
const DAY = 86400000;
const money = (v) => (Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const REASON = { bought: "bought back", expired: "expired", called: "called away" };

export default function ClosedTradeChart({ symbol, strike, breakeven, entryStock, entryMs, exitMs, exitStock, exitReason }) {
  const { T } = useTheme();
  const [pts, setPts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverI, setHoverI] = useState(null);

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setHoverI(null);
    getPriceHistory(symbol, "6M")
      .then((r) => { if (alive) { setPts(r.points || []); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No chart data."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol]);

  const exit = Number.isFinite(exitMs) ? exitMs : Date.now();
  const entry = Number.isFinite(entryMs) ? entryMs : exit - 30 * DAY;
  const tMin = Math.min(entry, exit) - 7 * DAY;
  const tMax = exit + 3 * DAY;
  const view = pts.filter((p) => p.t >= tMin && p.t <= tMax);
  const n = view.length;

  // Exit stock price: prefer the actual price at the exit date from history.
  const exitAtPrice = (() => {
    if (!n) return Number(exitStock) || null;
    let best = view[0], bd = Infinity;
    for (const p of view) { const d = Math.abs(p.t - exit); if (d < bd) { bd = d; best = p; } }
    return best.c;
  })();

  const overlays = [strike, breakeven, entryStock, exitAtPrice].map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const vals = view.map((p) => p.c).concat(overlays);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (PR - PL);
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const line = view.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yP(p.c).toFixed(1)).join(" ");
  const area = n ? `${line} L ${xT(view[n - 1].t).toFixed(1)} ${PB} L ${xT(view[0].t).toFixed(1)} ${PB} Z` : "";

  const onMove = (e) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vbx = ((e.clientX - rect.left) / rect.width) * VBW;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(xT(view[i].t) - vbx); if (d < bd) { bd = d; best = i; } }
    setHoverI(best);
  };

  const font = T.fontMono;
  const amber = T.warn || T.warning || "#E6A23C";
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const hv = hoverI != null ? view[hoverI] : null;
  const exitColor = exitReason === "called" ? amber : exitReason === "expired" ? T.textDim : T.success;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {loading ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol}…</div>
      ) : error ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
      ) : n === 0 ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No price history around this trade.</div>
      ) : (
        <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)}>
          <defs><linearGradient id="ctArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.accent} stopOpacity="0.18" /><stop offset="100%" stopColor={T.accent} stopOpacity="0" /></linearGradient></defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.35" />
              <text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text>
            </g>
          ))}
          {Number(strike) > 0 && (<>
            <line x1={PL} y1={yP(strike)} x2={PR} y2={yP(strike)} stroke={T.danger} strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={PR - 4} y={yP(strike) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.danger} fontWeight="700">Strike {money(strike)}</text>
          </>)}
          {Number(breakeven) > 0 && (<>
            <line x1={PL} y1={yP(breakeven)} x2={PR} y2={yP(breakeven)} stroke={amber} strokeWidth="1.25" strokeDasharray="5 4" />
            <text x={PR - 4} y={yP(breakeven) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={amber} fontWeight="700">Breakeven {money(breakeven)}</text>
          </>)}

          <path d={area} fill="url(#ctArea)" />
          <path d={line} fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* entry vertical */}
          {Number.isFinite(entryMs) && entryMs >= tMin && entryMs <= tMax && (<>
            <line x1={xT(entryMs)} y1={PT} x2={xT(entryMs)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
            <text x={xT(entryMs)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>entry {fmtDate(entryMs)}</text>
          </>)}

          {/* exit marker: circle inside a white square */}
          {Number.isFinite(exitAtPrice) && (<>
            <rect x={xT(exit) - 9} y={yP(exitAtPrice) - 9} width={18} height={18} rx="2" fill="none" stroke="#FFFFFF" strokeWidth="2" />
            <circle cx={xT(exit)} cy={yP(exitAtPrice)} r="5.5" fill={exitColor} stroke={T.surface} strokeWidth="1.5" />
            <text x={xT(exit)} y={yP(exitAtPrice) - 16} textAnchor="middle" fontSize="9" fontFamily={font} fill="#FFFFFF" fontWeight="700">{REASON[exitReason] || "exit"} {fmtDate(exit)}</text>
          </>)}

          {hv && (<g>
            <line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xT(hv.t)} cy={yP(hv.c)} r="3.5" fill={T.accent} stroke={T.surface} strokeWidth="2" />
          </g>)}
        </svg>
      )}
      {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap", boxShadow: "0 6px 18px #00000055" }}><div style={{ color: T.text, fontWeight: 700 }}>{money(hv.c)}</div><div style={{ color: T.textDim, marginTop: 2 }}>{fmtDate(hv.t)}</div></div>)}
    </div>
  );
}
