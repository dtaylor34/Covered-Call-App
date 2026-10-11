// ─── src/components/IntradayDayChart.jsx ─────────────────────────────────────
// One trading day's intraday line (regular-hours 5-min bars), opened from the
// Data Trend chart. Shows the prior close (dashed), the minute-N capture point
// with its Buy/Sell marker, and the day's path. Drag across the plot to focus
// (zoom) on an area; a hover crosshair reads out the price + time at the cursor.

import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getIntradayDay } from "../services/priceHistory";

const VBW = 840, VBH = 300, PL = 52, PR = 824, PT = 18, PB = 250;
const px2 = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : "—");
// minutes-since-9:30 → wall clock (ET).
const clock = (m) => { const t = 570 + (m || 0); const h = Math.floor(t / 60), mm = t % 60; const h12 = ((h + 11) % 12) + 1; const ap = h < 12 ? "AM" : "PM"; return `${h12}:${String(mm).padStart(2, "0")} ${ap}`; };
const niceDate = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "2-digit" }) : iso; };

export default function IntradayDayChart({ symbol, date, priorClose, targetMin, captured, signal, onClose, res: resProp, onResChange }) {
  const { T } = useTheme();
  const [resState, setResState] = useState("5m"); // bar size: 1m | 5m | 30m | 1h
  const res = resProp ?? resState;                // controlled when a res prop is supplied (View All)
  const setRes = onResChange || setResState;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(null);     // [i0, i1] absolute indices, or null = full day
  const [hover, setHover] = useState(null);   // visible-slice index under cursor
  const [drag, setDrag] = useState(null);     // { f0, f1 } fractions during a drag-select
  const svgRef = useRef(null);

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setData(null); setZoom(null); setHover(null);
    getIntradayDay(symbol, date, res)
      .then((r) => { if (alive) { setData(r); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No intraday data."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, date, res]);

  const all = data?.minutes || [];
  const i0 = zoom ? zoom[0] : 0;
  const i1 = zoom ? zoom[1] : Math.max(0, all.length - 1);
  const vis = all.slice(i0, i1 + 1);
  const visN = vis.length;

  const { lo, hi } = useMemo(() => {
    const vals = vis.map((b) => b.c).filter(Number.isFinite);
    // Include prior-close + capture in the FULL view so the reference lines sit on-chart.
    if (!zoom) { if (Number.isFinite(priorClose)) vals.push(priorClose); if (Number.isFinite(captured)) vals.push(captured); }
    let l = Math.min(...vals), h = Math.max(...vals);
    if (!Number.isFinite(l) || !Number.isFinite(h)) { l = 0; h = 1; }
    const pad = (h - l) * 0.1 || 0.5; return { lo: l - pad, hi: h + pad };
  }, [vis, zoom, priorClose, captured]);

  const xOf = (k) => PL + (visN <= 1 ? (PR - PL) / 2 : (k / (visN - 1)) * (PR - PL));
  const yOf = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const fToX = (f) => PL + f * (PR - PL);
  const col = signal === "B" ? T.success : signal === "S" ? T.danger : T.textDim;

  // clientX → fraction across the plot (0..1), clamped.
  const fracFromEvent = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    const xUser = ((e.clientX - rect.left) / rect.width) * VBW;
    return Math.max(0, Math.min(1, (xUser - PL) / (PR - PL)));
  };
  const visIdxFromFrac = (f) => Math.max(0, Math.min(visN - 1, Math.round(f * (visN - 1))));

  const onMove = (e) => {
    if (!visN) return;
    const f = fracFromEvent(e);
    setHover(visIdxFromFrac(f));
    if (drag) setDrag((d) => ({ ...d, f1: f }));
  };
  const onDown = (e) => { if (!visN) return; const f = fracFromEvent(e); setDrag({ f0: f, f1: f }); };
  const onUp = () => {
    if (drag && visN) {
      const a = visIdxFromFrac(Math.min(drag.f0, drag.f1));
      const b = visIdxFromFrac(Math.max(drag.f0, drag.f1));
      if (b - a >= 3) setZoom([i0 + a, i0 + b]); // need a few bars to be a meaningful focus
    }
    setDrag(null);
  };
  const onLeave = () => { setHover(null); setDrag(null); };

  const hv = hover != null && hover < visN ? vis[hover] : null;
  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${col}55`, borderRadius: T.r || 10, padding: "14px 16px", marginBottom: 16 };
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  // minute-N marker placed at the EXACT selected minute (e.g. 9:38 for minute 8),
  // interpolated between the two surrounding bars — so it isn't snapped to the
  // nearest 5-min bar (which would show minute 10). Hidden if the selected minute
  // falls outside the currently zoomed window.
  let marker = null;
  if (Number.isFinite(targetMin) && visN >= 2 && targetMin >= vis[0].m && targetMin <= vis[visN - 1].m) {
    let k = 0; while (k < visN - 2 && vis[k + 1].m <= targetMin) k++;
    const a = vis[k], b = vis[k + 1];
    const frac = b.m > a.m ? (targetMin - a.m) / (b.m - a.m) : 0;
    const price = a.c + frac * (b.c - a.c);
    marker = { x: xOf(k) + frac * (xOf(k + 1) - xOf(k)), y: yOf(price), price };
  }
  const INTERVALS = ["1m", "5m", "30m", "1h"];
  const ipill = (a) => ({ padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });

  return (
    <div style={card} role="region" aria-label="Intraday day detail">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, margin: 0 }}>{symbol} intraday</h3>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>{niceDate(date)}</span>
          <span style={{ color: "#0A0A0A", background: col, fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>{signal === "B" ? "BUY" : signal === "S" ? "SELL" : "—"}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {resProp == null && <div style={{ display: "flex", gap: 4, marginRight: 4 }}>{INTERVALS.map((iv) => <button key={iv} onClick={() => setRes(iv)} style={ipill(res === iv)}>{iv}</button>)}</div>}
          {zoom && <button onClick={() => setZoom(null)} style={{ padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim }}>⤢ Reset zoom</button>}
          {onClose && <button onClick={onClose} style={{ padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim }}>✕ Close</button>}
        </div>
      </div>

      {/* live hover readout / helper line */}
      <div style={{ fontFamily: font, fontSize: 11, marginBottom: 6, minHeight: 16, color: T.textDim }}>
        {hv ? (
          <span>
            <b style={{ color: T.text }}>{clock(hv.m)}</b> · <b style={{ color: col }}>${px2(hv.c)}</b>
            {Number.isFinite(priorClose) && <> · {hv.c >= priorClose ? "+" : ""}{px2(hv.c - priorClose)} vs prior close</>}
          </span>
        ) : (
          <span>Drag across the chart to focus on an area · hover for price &amp; time</span>
        )}
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        {loading ? (
          <div style={{ height: 230, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol} {date}…</div>
        ) : error ? (
          <div style={{ height: 230, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        ) : !visN ? (
          <div style={{ height: 230, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No intraday bars.</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", cursor: drag ? "ew-resize" : "crosshair", userSelect: "none" }}
            onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onLeave} onDoubleClick={() => setZoom(null)}>
            {/* y gridlines */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yOf(v)} x2={PR} y2={yOf(v)} stroke={T.border} strokeWidth="1" opacity="0.35" />
                <text x={PL - 8} y={yOf(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text>
              </g>
            ))}

            {/* prior close reference */}
            {Number.isFinite(priorClose) && priorClose >= lo && priorClose <= hi && (
              <g>
                <line x1={PL} y1={yOf(priorClose)} x2={PR} y2={yOf(priorClose)} stroke={T.textDim} strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
                <text x={PR} y={yOf(priorClose) - 4} textAnchor="end" fontSize="9" fontFamily={font} fill={T.textDim}>prior close {px2(priorClose)}</text>
              </g>
            )}

            {/* intraday line */}
            <polyline points={vis.map((b, k) => `${xOf(k)},${yOf(b.c)}`).join(" ")} fill="none" stroke={col} strokeWidth="1.75" opacity="0.9" />

            {/* minute-N capture marker — at the exact selected minute (interpolated) */}
            {marker && (
              <g>
                <line x1={marker.x} y1={PT} x2={marker.x} y2={PB} stroke={col} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                <circle cx={marker.x} cy={marker.y} r="7" fill={col} stroke={T.surface} strokeWidth="1.5" />
                <text x={marker.x} y={marker.y + 3} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#0A0A0A" fontFamily={font}>{signal === "B" ? "B" : signal === "S" ? "S" : "·"}</text>
                <text x={marker.x} y={PT - 4} textAnchor="middle" fontSize="8.5" fontFamily={font} fill={col}>{clock(targetMin)}</text>
              </g>
            )}

            {/* drag-select rectangle */}
            {drag && Math.abs(drag.f1 - drag.f0) > 0.002 && (
              <rect x={fToX(Math.min(drag.f0, drag.f1))} y={PT} width={Math.abs(fToX(drag.f1) - fToX(drag.f0))} height={PB - PT} fill={`${T.accent}22`} stroke={`${T.accent}88`} strokeWidth="1" />
            )}

            {/* hover crosshair */}
            {hv && !drag && (
              <g>
                <line x1={xOf(hover)} y1={PT} x2={xOf(hover)} y2={PB} stroke={T.text} strokeWidth="1" opacity="0.25" />
                <circle cx={xOf(hover)} cy={yOf(hv.c)} r="4" fill={T.text} stroke={T.surface} strokeWidth="1.5" />
              </g>
            )}

            {/* x axis: open / mid / close ticks of the visible window */}
            {[0, Math.floor((visN - 1) / 2), visN - 1].filter((v, i, a) => a.indexOf(v) === i).map((k) => (
              <text key={k} x={xOf(k)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>{clock(vis[k].m)}</text>
            ))}
          </svg>
        )}

        {/* hover price tag following the point */}
        {hv && !drag && (
          <div style={{
            position: "absolute", left: `${(xOf(hover) / VBW) * 100}%`, top: `${(yOf(hv.c) / VBH) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))", pointerEvents: "none",
            background: T.card, border: `1px solid ${col}66`, borderRadius: 7, padding: "4px 8px",
            fontFamily: font, fontSize: 10.5, color: T.text, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 10,
          }}>
            <b style={{ color: col }}>${px2(hv.c)}</b> · {clock(hv.m)}
          </div>
        )}
      </div>
    </div>
  );
}
