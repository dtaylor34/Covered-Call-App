// ─── src/components/StackedDaysChart.jsx ─────────────────────────────────────
// "Stacked overlay": every trading day in the range layered on ONE chart, each
// normalized to its own prior close (so the shapes overlay). Older days are
// faint grey; the most recent day is drawn in color on top. Hovering a line
// highlights it and colors it by that day's signal — green for a BUY day (price
// at minute N was below the prior close) or red for a SELL day (above) — with a
// readout of the date and the minute-N move. Renders inline (toggled on the
// View All page). One bulk fetch (getIntradayRange).

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getIntradayRange } from "../services/priceHistory";

const VBW = 980, VBH = 420, PL = 52, PR = 964, PT = 22, PB = 372;
const SESSION_MIN = 390; // 9:30 → 16:00 ET
const CAP = 220; // max lines drawn (perf) — most recent kept
const clock = (m) => { const t = 570 + (m || 0); const h = Math.floor(t / 60), mm = t % 60; const h12 = ((h + 11) % 12) + 1; const ap = h < 12 ? "AM" : "PM"; return `${h12}:${String(mm).padStart(2, "0")} ${ap}`; };
const niceDate = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "2-digit" }) : iso; };

// Normalized %-from-prior-close at session-minute m (interpolated).
function pctAt(sess, m) {
  const mins = sess.minutes;
  if (!mins || !mins.length || !(sess.priorClose > 0)) return null;
  let c;
  if (m <= mins[0].m) c = mins[0].c;
  else if (m >= mins[mins.length - 1].m) c = mins[mins.length - 1].c;
  else { c = mins[mins.length - 1].c; for (let i = 0; i < mins.length - 1; i++) { const a = mins[i], b = mins[i + 1]; if (m >= a.m && m <= b.m) { const f = b.m > a.m ? (m - a.m) / (b.m - a.m) : 0; c = a.c + f * (b.c - a.c); break; } } }
  return (c / sess.priorClose - 1) * 100;
}

export default function StackedDaysChart({ symbol, minute, days }) {
  const { T } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(null); // index into `shown`
  const svgRef = useRef(null);

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setData(null); setHover(null);
    getIntradayRange(symbol, minute, days)
      .then((r) => { if (alive) { setData(r); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No history."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, minute, days]);

  // Only sessions with a prior close + bars can be normalized. Most-recent last.
  const sessions = useMemo(() => (data?.sessions || []).filter((s) => s.priorClose > 0 && s.minutes?.length), [data]);
  const shown = useMemo(() => sessions.slice(-CAP), [sessions]);
  const dropped = sessions.length - shown.length;

  // Pre-build each line's normalized polyline points + y-domain.
  const { lines, lo, hi } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    const ls = shown.map((s) => {
      const pts = s.minutes.map((b) => ({ m: b.m, y: (b.c / s.priorClose - 1) * 100 }));
      for (const p of pts) { if (p.y < mn) mn = p.y; if (p.y > mx) mx = p.y; }
      return { date: s.date, signal: s.signal };
    });
    if (!Number.isFinite(mn)) { mn = -1; mx = 1; }
    const pad = (mx - mn) * 0.08 || 0.3;
    return { lines: ls, lo: mn - pad, hi: mx + pad };
  }, [shown]);

  const xM = (m) => PL + (m / SESSION_MIN) * (PR - PL);
  const yP = (pct) => { const r = PB - ((pct - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const linePath = (s) => s.minutes.map((b, i) => (i ? "L" : "M") + xM(b.m).toFixed(1) + " " + yP((b.c / s.priorClose - 1) * 100).toFixed(1)).join(" ");
  const lastIdx = shown.length - 1;
  const hoverColor = (sig) => (sig === "S" ? T.danger : sig === "B" ? T.success : T.text);

  const onMove = (e) => {
    if (!shown.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vbx = ((e.clientX - rect.left) / rect.width) * VBW;
    const vby = ((e.clientY - rect.top) / rect.height) * VBH;
    const m = Math.max(0, Math.min(SESSION_MIN, ((vbx - PL) / (PR - PL)) * SESSION_MIN));
    let best = null, bd = Infinity;
    for (let i = 0; i < shown.length; i++) {
      const y = pctAt(shown[i], m);
      if (y == null) continue;
      const d = Math.abs(yP(y) - vby);
      if (d < bd) { bd = d; best = i; }
    }
    setHover(bd <= 16 ? best : null);
  };

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "14px 16px", marginBottom: 16 };
  const hv = hover != null ? shown[hover] : null;
  const hvSig = hv ? hv.signal : null;
  const hvMovePct = hv ? pctAt(hv, minute) : null;
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const xTicks = [0, SESSION_MIN / 2, SESSION_MIN];
  const swatch = (color, op = 1) => ({ display: "inline-block", width: 14, height: 2, background: color, opacity: op, verticalAlign: "middle", marginRight: 5 });

  return (
    <div style={card} role="region" aria-label="Stacked intraday overlay">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, margin: 0 }}>Stacked overlay</h3>
        <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>{shown.length} day{shown.length > 1 ? "s" : ""} · minute {minute} ({clock(minute)}) · each day vs its prior close</span>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontFamily: font, fontSize: 11, color: T.textDim }}>
        <span><span style={swatch(T.accent)} />most recent day</span>
        <span><span style={swatch(T.textDim, 0.4)} />earlier days</span>
        <span><span style={swatch(T.success)} />hovered · BUY (below prior close at min {minute})</span>
        <span><span style={swatch(T.danger)} />hovered · SELL (above)</span>
        {dropped > 0 && <span style={{ color: T.textMuted || T.textDim }}>showing the most recent {CAP} of {sessions.length} days</span>}
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        {loading ? (
          <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol} history…</div>
        ) : error ? (
          <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        ) : !shown.length ? (
          <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No intraday history for {symbol}.</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {/* y gridlines (% from prior close) */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" />
                <text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</text>
              </g>
            ))}
            {/* prior-close baseline (0%) */}
            <line x1={PL} y1={yP(0)} x2={PR} y2={yP(0)} stroke={T.textDim} strokeWidth="1.25" strokeDasharray="5 4" opacity="0.8" />
            <text x={PR} y={yP(0) - 4} textAnchor="end" fontSize="9" fontFamily={font} fill={T.textDim}>prior close</text>
            {/* minute-N marker line */}
            <line x1={xM(minute)} y1={PT} x2={xM(minute)} y2={PB} stroke={T.accent} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
            <text x={xM(minute)} y={PT - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.accent}>min {minute}</text>
            {/* x ticks */}
            {xTicks.map((m, i) => <text key={i} x={xM(m)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>{clock(m)}</text>)}

            {/* older days — faint grey */}
            {shown.map((s, i) => (i === lastIdx || i === hover ? null : (
              <path key={s.date} d={linePath(s)} fill="none" stroke={T.textDim} strokeWidth="1" opacity="0.16" />
            )))}
            {/* most recent day — accent, on top of the grey */}
            {lastIdx >= 0 && lastIdx !== hover && (
              <path d={linePath(shown[lastIdx])} fill="none" stroke={T.accent} strokeWidth="2" opacity="0.95" />
            )}
            {/* hovered day — colored by its signal (green BUY / red SELL), drawn last */}
            {hv && (
              <>
                <path d={linePath(hv)} fill="none" stroke={hoverColor(hvSig)} strokeWidth="2.5" opacity="1" />
                {Number.isFinite(hvMovePct) && <circle cx={xM(minute)} cy={yP(hvMovePct)} r="4.5" fill={hoverColor(hvSig)} stroke={T.surface} strokeWidth="1.5" />}
              </>
            )}
          </svg>
        )}

        {hv && (
          <div style={{ position: "absolute", left: `${(xM(minute) / VBW) * 100}%`, top: 10, transform: "translateX(10px)", pointerEvents: "none", background: T.card, border: `1px solid ${hoverColor(hvSig)}66`, borderRadius: 8, padding: "7px 10px", fontFamily: font, fontSize: 11.5, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.35)", zIndex: 5 }}>
            <div style={{ color: T.text, fontWeight: 700 }}>{niceDate(hv.date)}</div>
            <div style={{ color: hoverColor(hvSig), fontWeight: 700, marginTop: 2 }}>
              {hvSig === "S" ? "SELL" : hvSig === "B" ? "BUY" : "—"}{Number.isFinite(hvMovePct) ? ` · ${hvMovePct >= 0 ? "+" : ""}${hvMovePct.toFixed(2)}% at ${clock(minute)}` : ""}
            </div>
          </div>
        )}
      </div>

      <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
        Each line is one trading day's intraday path, normalized to that day's prior close (0% baseline). Above the line = trading higher than yesterday's close (SELL zone at the open), below = lower (BUY zone). The most recent day is in color; hover any line to highlight it and see its date and minute-{minute} move. {data?.interval === "60m" ? "Beyond ~60 days bars are hourly, so intraday shape is coarser." : ""}
      </div>
    </div>
  );
}
