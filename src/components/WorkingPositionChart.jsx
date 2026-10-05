// ─── src/components/WorkingPositionChart.jsx ─────────────────────────────────
// Per-position chart for a working covered call. Range selectable 1d→6m plus a
// "Range" view that spans the whole trade (bought → expiration) and overlays the
// buy-back-cost theta arch on a secondary axis. Covered-call overlays:
//   • Strike (red dashed) + shaded "called-away" zone
//   • Breakeven (amber dashed)
//   • Buy-back level (green) — stock price where the call decays to your GTC now
//   • Entry stock price (grey dashed) + bought/exp vertical lines (the time span)
//   • Current price (accent dot) + today line
//   • "Range" view: buy-back cost over time (violet, right axis) + GTC target line

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";
import { callVal } from "../lib/coveredCallMath";

const VBW = 760, VBH = 240, PL = 54, PT = 16, PB = 204;
const DAY = 86400000;
const PREM_COLOR = "#A78BFA"; // buy-back-cost (theta) arch

const RANGES = [
  { k: "1d", d: 1, intraday: true }, { k: "2d", d: 2, intraday: true },
  { k: "3d", d: 3, intraday: true }, { k: "4d", d: 4, intraday: true },
  { k: "1w", d: 7, intraday: true }, { k: "2w", d: 14, intraday: false },
  { k: "3w", d: 21, intraday: false }, { k: "1m", d: 30.44, intraday: false },
  { k: "2m", d: 60.9, intraday: false }, { k: "3m", d: 91.3, intraday: false },
  { k: "4m", d: 121.8, intraday: false }, { k: "5m", d: 152.2, intraday: false },
  { k: "6m", d: 182.6, intraday: false }, { k: "Range", full: true, intraday: false },
];

const money = (v) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseISO = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? new Date(y, m - 1, d).getTime() : null; };
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const fmtDateTime = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function solveStockForCall(target, K, days, iv) {
  if (!(target > 0) || !(K > 0) || !(iv > 0) || !(days > 0)) return null;
  let lo = 0, hi = Math.max(K * 3, 10);
  if (callVal(hi, K, days, iv) < target) return null;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (callVal(mid, K, days, iv) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export default function WorkingPositionChart({ symbol, strike, breakeven, currentPrice, entryStock, expiry, openedAtMs, gtc, keeps, entryCall, currentCall, iv, daysToExpiry, onSetEntry }) {
  const { T } = useTheme();
  const [daily, setDaily] = useState([]);
  const [intra, setIntra] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverI, setHoverI] = useState(null);
  const [range, setRange] = useState("3m");

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setHoverI(null);
    Promise.allSettled([getPriceHistory(symbol, "6M"), getPriceHistory(symbol, "1W")])
      .then(([d, i]) => {
        if (!alive) return;
        if (d.status === "fulfilled") setDaily(d.value.points || []);
        if (i.status === "fulfilled") setIntra(i.value.points || []);
        if (d.status !== "fulfilled" && i.status !== "fulfilled") setError("No chart data.");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [symbol]);

  const sel = RANGES.find((r) => r.k === range) || RANGES[7];
  const nowMs = Date.now();
  const expMs = parseISO(expiry);
  const source = sel.intraday ? intra : daily;

  // Range view spans entry→expiry, but always keep ≥2 weeks of stock history so a
  // just-opened trade (only a day or two since entry) still draws a visible line.
  const entryOrHist = Number.isFinite(openedAtMs) ? openedAtMs : (daily[0]?.t ?? nowMs - 183 * DAY);
  const windowStart = sel.full ? Math.min(entryOrHist, nowMs - 14 * DAY) : nowMs - sel.d * DAY;
  const pts = source.filter((p) => p.t >= windowStart);
  const tMin = pts.length ? Math.min(pts[0].t, sel.full && Number.isFinite(openedAtMs) ? openedAtMs : pts[0].t) : windowStart;

  const futureMs = expMs && expMs > nowMs ? expMs - nowMs : 0;
  const showFuture = (sel.full || !sel.intraday) && futureMs > 0;
  const tMax = showFuture ? expMs : nowMs;

  const K = Number(strike), vol = Number(iv);
  const gtcLevel = solveStockForCall(Number(gtc), K, Number(daysToExpiry), vol);

  // Buy-back-cost theta arch (Range view only): historical premium from the real
  // stock path (entry→now) + projection with the stock flat (now→exp).
  const premCurve = useMemo(() => {
    if (!sel.full || !expMs || !(K > 0) || !(vol > 0)) return [];
    const out = [];
    for (const p of pts) { const dl = Math.max(0, (expMs - p.t) / DAY); out.push({ t: p.t, v: callVal(p.c, K, dl, vol) }); }
    const steps = 30;
    for (let i = 1; i <= steps; i++) { const t = nowMs + (expMs - nowMs) * (i / steps); const dl = Math.max(0, (expMs - t) / DAY); out.push({ t, v: callVal(Number(currentPrice), K, dl, vol) }); }
    return out.filter((p) => Number.isFinite(p.v));
  }, [sel.full, pts, expMs, K, vol, currentPrice, nowMs]);

  const showPrem = sel.full && premCurve.length > 1;
  const RX = showPrem ? 700 : VBW - 12; // right plot edge (leave room for premium axis)
  const premMax = showPrem ? Math.max(...premCurve.map((p) => p.v), Number(entryCall) || 0, Number(gtc) || 0) * 1.12 || 1 : 1;

  const overlays = [strike, breakeven, entryStock, currentPrice, gtcLevel].map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const prices = pts.map((p) => p.c).concat(overlays);
  let lo = Math.min(...prices), hi = Math.max(...prices);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;

  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (RX - PL);
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const yP2 = (v) => { const r = PB - (v / (premMax || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };

  const line = pts.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yP(p.c).toFixed(1)).join(" ");
  const area = pts.length ? `${line} L ${xT(pts[pts.length - 1].t).toFixed(1)} ${PB} L ${xT(pts[0].t).toFixed(1)} ${PB} Z` : "";
  const premLine = showPrem ? premCurve.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yP2(p.v).toFixed(1)).join(" ") : "";

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
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const premTicks = showPrem ? [0, 1, 2, 3].map((i) => (premMax * i) / 3) : [];
  const hv = hoverI != null ? pts[hoverI] : null;
  const amber = T.warn || T.warning || "#E6A23C";
  const hasOpened = Number.isFinite(openedAtMs) && openedAtMs >= tMin && openedAtMs <= tMax;
  const fmtHover = sel.intraday ? fmtDateTime : fmtDate;
  const pill = (active) => ({ padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accent : "transparent", color: active ? "#0A0A0A" : T.textDim });
  const legendDot = (color) => ({ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: color, marginRight: 5, verticalAlign: "middle" });
  const noData = !loading && !error && pts.length === 0;

  return (
    <div style={card} role="region" aria-label={`Price chart for ${symbol}`}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 600 }}>
          {symbol} <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>covered-call chart</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: font, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: T.textDim }}><span style={legendDot(T.accent)} />Price {money(currentPrice)}</span>
          <span style={{ color: T.textDim }}><span style={legendDot(T.danger)} />Strike {money(strike)}</span>
          <span style={{ color: T.textDim }}><span style={legendDot(amber)} />Breakeven {money(breakeven)}</span>
          {gtcLevel != null && <span style={{ color: T.textDim }}><span style={legendDot(T.success)} />Buy-back ≤ {money(gtcLevel)}</span>}
          {showPrem && <span style={{ color: T.textDim }}><span style={legendDot(PREM_COLOR)} />Buy-back cost (right)</span>}
        </div>
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        {loading ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol}…</div>
        ) : error ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        ) : noData ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No {sel.intraday ? "intraday" : ""} data for this range.</div>
        ) : (
          <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)}>
            <defs>
              <linearGradient id="wpcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.accent} stopOpacity="0.20" />
                <stop offset="100%" stopColor={T.accent} stopOpacity="0" />
              </linearGradient>
            </defs>

            {showFuture && (
              <>
                <rect x={xT(nowMs)} y={PT} width={Math.max(0, xT(expMs) - xT(nowMs))} height={PB - PT} fill={T.accent} opacity="0.05" />
                <text x={(xT(nowMs) + xT(expMs)) / 2} y={PT + 11} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>possible exit window</text>
              </>
            )}

            {/* left (price) axis */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yP(v)} x2={RX} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.4" />
                <text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>${v.toFixed(v < 10 ? 2 : 0)}</text>
              </g>
            ))}
            {/* right (premium) axis */}
            {premTicks.map((v, i) => (
              <text key={i} x={RX + 6} y={yP2(v) + 3} textAnchor="start" fontSize="9" fontFamily={font} fill={PREM_COLOR}>${v.toFixed(v < 10 ? 2 : 0)}</text>
            ))}

            {K > 0 && (
              <>
                <rect x={PL} y={PT} width={RX - PL} height={Math.max(0, yP(strike) - PT)} fill={T.danger} opacity="0.07" />
                <line x1={PL} y1={yP(strike)} x2={RX} y2={yP(strike)} stroke={T.danger} strokeWidth="1.5" strokeDasharray="5 4" />
                <text x={RX - 4} y={yP(strike) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.danger} fontWeight="700">Strike {money(strike)}</text>
              </>
            )}
            {gtcLevel != null && gtcLevel > lo && gtcLevel < hi && (
              <>
                <line x1={PL} y1={yP(gtcLevel)} x2={RX} y2={yP(gtcLevel)} stroke={T.success} strokeWidth="1.5" strokeDasharray="6 3" />
                <text x={PL + 4} y={yP(gtcLevel) - 4} textAnchor="start" fontSize="10" fontFamily={font} fill={T.success} fontWeight="700">Buy-back {money(gtc)} @ stock ≤ {money(gtcLevel)}</text>
              </>
            )}
            {Number(breakeven) > 0 && (
              <>
                <line x1={PL} y1={yP(breakeven)} x2={RX} y2={yP(breakeven)} stroke={amber} strokeWidth="1.25" strokeDasharray="5 4" />
                <text x={RX - 4} y={yP(breakeven) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={amber} fontWeight="700">Breakeven {money(breakeven)}</text>
              </>
            )}
            {Number(entryStock) > 0 && (
              <line x1={PL} y1={yP(entryStock)} x2={RX} y2={yP(entryStock)} stroke={T.textDim} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
            )}

            <path d={area} fill="url(#wpcArea)" />
            <path d={line} fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {/* buy-back cost theta arch (secondary axis) */}
            {showPrem && (
              <>
                <path d={premLine} fill="none" stroke={PREM_COLOR} strokeWidth="1.75" strokeDasharray="1 0" opacity="0.9" />
                {Number(gtc) > 0 && gtc < premMax && (
                  <>
                    <line x1={PL} y1={yP2(gtc)} x2={RX} y2={yP2(gtc)} stroke={PREM_COLOR} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
                    <text x={RX - 4} y={yP2(gtc) - 3} textAnchor="end" fontSize="9" fontFamily={font} fill={PREM_COLOR}>GTC {money(gtc)}</text>
                  </>
                )}
              </>
            )}

            {/* purchase date — light grey vertical */}
            {hasOpened && (
              <>
                <line x1={xT(openedAtMs)} y1={PT} x2={xT(openedAtMs)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
                <text x={xT(openedAtMs)} y={VBH - 14} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>entry {fmtDate(openedAtMs)}</text>
              </>
            )}
            {/* today */}
            <line x1={xT(nowMs)} y1={PT} x2={xT(nowMs)} y2={PB} stroke={T.accent} strokeWidth="1" opacity="0.6" />
            <text x={xT(nowMs)} y={VBH - 4} textAnchor={showFuture ? "middle" : "end"} fontSize="9" fontFamily={font} fill={T.accent}>today</text>
            {/* expiration — light grey vertical */}
            {showFuture && (
              <>
                <line x1={xT(expMs)} y1={PT} x2={xT(expMs)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
                <text x={xT(expMs)} y={VBH - 14} textAnchor="end" fontSize="9" fontFamily={font} fill={T.textDim}>exp {fmtDate(expMs)}</text>
              </>
            )}

            {Number(currentPrice) > 0 && <circle cx={xT(nowMs)} cy={yP(currentPrice)} r="4" fill={T.accent} stroke={T.surface} strokeWidth="2" />}

            {hv && (
              <g>
                <line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={xT(hv.t)} cy={yP(hv.c)} r="3.5" fill={T.accent} stroke={T.surface} strokeWidth="2" />
              </g>
            )}
          </svg>
        )}

        {hv && (
          <div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap", boxShadow: "0 6px 18px #00000055" }}>
            <div style={{ color: T.text, fontWeight: 700 }}>{money(hv.c)}</div>
            <div style={{ color: T.textDim, marginTop: 2 }}>{fmtHover(hv.t)}</div>
          </div>
        )}
      </div>

      {/* entry-date setter — right on the chart when it's missing */}
      {!Number.isFinite(openedAtMs) && onSetEntry && (
        <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, border: `1px solid ${amber}55`, background: `${amber}14`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: amber, fontFamily: font, fontSize: 12, fontWeight: 700 }}>Set the date you sold this call:</span>
          <input type="date" onChange={(e) => { const [y, m, d] = e.target.value.split("-").map(Number); if (y) onSetEntry(new Date(y, m - 1, d).getTime()); }}
            style={{ padding: "5px 9px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 }} />
          <span style={{ color: T.textDim, fontFamily: font, fontSize: 11 }}>→ adds the grey “entry” line; use Range to see entry → expiration.</span>
        </div>
      )}

      {/* range selector */}
      <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
        {RANGES.map((r) => (
          <button key={r.k} onClick={() => setRange(r.k)} style={pill(range === r.k)}>{r.k}</button>
        ))}
      </div>

      {/* option-side readout */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontFamily: font, fontSize: 11, color: T.textDim }}>
        {Number(entryCall) > 0 && <span>Entry call <b style={{ color: T.text }}>{money(entryCall)}</b></span>}
        {Number(currentCall) >= 0 && <span>Current call <b style={{ color: T.text }}>{money(currentCall)}</b></span>}
        {Number(gtc) > 0 && <span>GTC exit <b style={{ color: T.success }}>{money(gtc)}</b></span>}
        {Number(keeps) > 0 && <span>→ keeps <b style={{ color: T.success }}>{money(keeps)}</b></span>}
        {gtcLevel != null && <span>buy-back fills if stock ≤ <b style={{ color: T.success }}>{money(gtcLevel)}</b> <span style={{ color: T.textMuted || T.textDim }}>(at today's DTE)</span></span>}
        {showPrem && <span style={{ color: PREM_COLOR }}>violet = cost to buy back over time (theta); stock held flat after today</span>}
        {Number.isFinite(openedAtMs) && !sel.full && (nowMs - openedAtMs) < 14 * DAY && <span style={{ color: amber }}>Entry was recent — tap <b>Range</b> to see it from entry → expiration (it sits next to “today” on longer ranges).</span>}
      </div>
    </div>
  );
}
