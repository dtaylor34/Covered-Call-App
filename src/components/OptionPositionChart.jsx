// ─── src/components/OptionPositionChart.jsx ──────────────────────────────────
// Per-position chart for a working option (Options Manager). Plots the
// underlying price with the strike, breakeven, entry marker (dot + vertical),
// expiration vertical, and current price. Works for calls & puts, long & short.
// Ranges 1d→6m plus "Range" (entry → expiration). Hover for price + date.

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";

const VBW = 760, VBH = 240, PL = 54, PT = 16, PB = 204;
const DAY = 86400000;
const RANGES = [
  { k: "1d", d: 1, intraday: true }, { k: "3d", d: 3, intraday: true }, { k: "1w", d: 7, intraday: true },
  { k: "2w", d: 14 }, { k: "1m", d: 30.44 }, { k: "2m", d: 60.9 }, { k: "3m", d: 91.3 },
  { k: "6m", d: 182.6 }, { k: "Range", full: true },
];
const money = (v) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseISO = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? new Date(y, m - 1, d).getTime() : null; };
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const fmtDateTime = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function OptionPositionChart({ symbol, strike, breakeven, currentUnderlying, entryUnderlying, expiry, openedAtMs, type = "CALL", onSetEntry }) {
  const { T } = useTheme();
  const [daily, setDaily] = useState([]);
  const [intra, setIntra] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverI, setHoverI] = useState(null);
  const [range, setRange] = useState("3m");

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setHoverI(null);
    Promise.allSettled([getPriceHistory(symbol, "6M"), getPriceHistory(symbol, "1W")]).then(([d, i]) => {
      if (!alive) return;
      if (d.status === "fulfilled") setDaily(d.value.points || []);
      if (i.status === "fulfilled") setIntra(i.value.points || []);
      if (d.status !== "fulfilled" && i.status !== "fulfilled") setError("No chart data.");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [symbol]);

  const call = String(type).toUpperCase() === "CALL";
  const sel = RANGES.find((r) => r.k === range) || RANGES[4];
  const nowMs = Date.now();
  const expMs = parseISO(expiry);
  const source = sel.intraday ? intra : daily;
  const entryOrHist = Number.isFinite(openedAtMs) ? openedAtMs : (daily[0]?.t ?? nowMs - 183 * DAY);
  const windowStart = sel.full ? Math.min(entryOrHist, nowMs - 14 * DAY) : nowMs - sel.d * DAY;
  const pts = source.filter((p) => p.t >= windowStart);
  const tMin = pts.length ? Math.min(pts[0].t, sel.full && Number.isFinite(openedAtMs) ? openedAtMs : pts[0].t) : windowStart;
  const futureMs = expMs && expMs > nowMs ? expMs - nowMs : 0;
  const showFuture = !sel.intraday && futureMs > 0;
  const tMax = showFuture ? expMs : nowMs;

  const overlays = [strike, breakeven, entryUnderlying, currentUnderlying].map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const prices = pts.map((p) => p.c).concat(overlays);
  let lo = Math.min(...prices), hi = Math.max(...prices);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;

  const RX = VBW - 12;
  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (RX - PL);
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const line = pts.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yP(p.c).toFixed(1)).join(" ");
  const area = pts.length ? `${line} L ${xT(pts[pts.length - 1].t).toFixed(1)} ${PB} L ${xT(pts[0].t).toFixed(1)} ${PB} Z` : "";

  const entryAtPrice = useMemo(() => {
    if (!Number.isFinite(openedAtMs)) return null;
    const series = daily.length ? daily : source;
    if (series.length) { let best = series[0], bd = Infinity; for (const p of series) { const d = Math.abs(p.t - openedAtMs); if (d < bd) { bd = d; best = p; } } if (bd <= 5 * DAY) return best.c; }
    return Number(entryUnderlying) > 0 ? Number(entryUnderlying) : null;
  }, [openedAtMs, daily, source, entryUnderlying]);

  const onMove = (e) => {
    if (!pts.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vbx = ((e.clientX - rect.left) / rect.width) * VBW;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(xT(pts[i].t) - vbx); if (d < bd) { bd = d; best = i; } }
    setHoverI(best);
  };

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "14px 16px", marginBottom: 14 };
  const amber = T.warn || T.warning || "#E6A23C";
  const entryColor = T.pro || "#6366f1";
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const hv = hoverI != null ? pts[hoverI] : null;
  const hasOpened = Number.isFinite(openedAtMs) && openedAtMs >= tMin && openedAtMs <= tMax;
  const fmtHover = sel.intraday ? fmtDateTime : fmtDate;
  const pill = (a) => ({ padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const dot = (c) => ({ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: c, marginRight: 5, verticalAlign: "middle" });
  const noData = !loading && !error && pts.length === 0;
  const K = Number(strike);

  return (
    <div style={card} role="region" aria-label={`Price chart for ${symbol}`}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 600 }}>
          {symbol} <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>{type} option</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: font, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: T.textDim }}><span style={dot(T.accent)} />Price {money(currentUnderlying)}</span>
          <span style={{ color: T.textDim }}><span style={dot(T.danger)} />Strike {money(strike)}</span>
          {Number(breakeven) > 0 && <span style={{ color: T.textDim }}><span style={dot(amber)} />Breakeven {money(breakeven)}</span>}
          {hasOpened && Number.isFinite(entryAtPrice) && <span style={{ color: T.textDim }}><span style={dot(entryColor)} />Entry {money(entryAtPrice)}</span>}
        </div>
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        {loading ? <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol}…</div>
        : error ? <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        : noData ? <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No {sel.intraday ? "intraday " : ""}data for this range.</div>
        : (
          <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)}>
            <defs><linearGradient id="opcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.accent} stopOpacity="0.18" /><stop offset="100%" stopColor={T.accent} stopOpacity="0" /></linearGradient></defs>
            {showFuture && (<><rect x={xT(nowMs)} y={PT} width={Math.max(0, xT(expMs) - xT(nowMs))} height={PB - PT} fill={T.accent} opacity="0.05" /><text x={(xT(nowMs) + xT(expMs)) / 2} y={PT + 11} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>to expiration</text></>)}
            {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={RX} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.4" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>${v.toFixed(v < 10 ? 2 : 0)}</text></g>))}

            {/* ITM zone shading: above strike for a call, below for a put */}
            {K > 0 && (call
              ? <rect x={PL} y={PT} width={RX - PL} height={Math.max(0, yP(strike) - PT)} fill={T.accent} opacity="0.06" />
              : <rect x={PL} y={yP(strike)} width={RX - PL} height={Math.max(0, PB - yP(strike))} fill={T.accent} opacity="0.06" />)}
            {K > 0 && (<><line x1={PL} y1={yP(strike)} x2={RX} y2={yP(strike)} stroke={T.danger} strokeWidth="1.5" strokeDasharray="5 4" /><text x={RX - 4} y={yP(strike) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.danger} fontWeight="700">Strike {money(strike)}</text></>)}
            {Number(breakeven) > 0 && (<><line x1={PL} y1={yP(breakeven)} x2={RX} y2={yP(breakeven)} stroke={amber} strokeWidth="1.25" strokeDasharray="5 4" /><text x={RX - 4} y={yP(breakeven) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={amber} fontWeight="700">Breakeven {money(breakeven)}</text></>)}

            <path d={area} fill="url(#opcArea)" />
            <path d={line} fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {hasOpened && (<><line x1={xT(openedAtMs)} y1={PT} x2={xT(openedAtMs)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" /><text x={xT(openedAtMs)} y={VBH - 14} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>entry {fmtDate(openedAtMs)}</text></>)}
            <line x1={xT(nowMs)} y1={PT} x2={xT(nowMs)} y2={PB} stroke={T.accent} strokeWidth="1" opacity="0.6" />
            <text x={xT(nowMs)} y={VBH - 4} textAnchor={showFuture ? "middle" : "end"} fontSize="9" fontFamily={font} fill={T.accent}>today</text>
            {showFuture && (<><line x1={xT(expMs)} y1={PT} x2={xT(expMs)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" /><text x={xT(expMs)} y={VBH - 14} textAnchor="end" fontSize="9" fontFamily={font} fill={T.textDim}>exp {fmtDate(expMs)}</text></>)}

            {hasOpened && Number.isFinite(entryAtPrice) && (<><circle cx={xT(openedAtMs)} cy={yP(entryAtPrice)} r="4.5" fill={entryColor} stroke={T.surface} strokeWidth="2" /><text x={xT(openedAtMs)} y={yP(entryAtPrice) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fill={entryColor} fontWeight="700">entry {money(entryAtPrice)}</text></>)}
            {Number(currentUnderlying) > 0 && <circle cx={xT(nowMs)} cy={yP(currentUnderlying)} r="4" fill={T.accent} stroke={T.surface} strokeWidth="2" />}
            {hv && (<g><line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" /><circle cx={xT(hv.t)} cy={yP(hv.c)} r="3.5" fill={T.accent} stroke={T.surface} strokeWidth="2" /></g>)}
          </svg>
        )}
        {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap", boxShadow: "0 6px 18px #00000055" }}><div style={{ color: T.text, fontWeight: 700 }}>{money(hv.c)}</div><div style={{ color: T.textDim, marginTop: 2 }}>{fmtHover(hv.t)}</div></div>)}
      </div>

      {!Number.isFinite(openedAtMs) && onSetEntry && (
        <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, border: `1px solid ${amber}55`, background: `${amber}14`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: amber, fontFamily: font, fontSize: 12, fontWeight: 700 }}>Set the date you opened this option:</span>
          <input type="date" onChange={(e) => { const [y, m, d] = e.target.value.split("-").map(Number); if (y) onSetEntry(new Date(y, m - 1, d).getTime()); }} style={{ padding: "5px 9px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
        {RANGES.map((r) => <button key={r.k} onClick={() => setRange(r.k)} style={pill(range === r.k)}>{r.k}</button>)}
      </div>
    </div>
  );
}
