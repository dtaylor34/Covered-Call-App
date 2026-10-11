// ─── src/components/DataTrendChart.jsx ───────────────────────────────────────
// "Data Trend" view: for each of the last N trading days, the price captured at
// minute N (dot) vs that day's prior close — a green "B" (buy) when below, red
// "S" (sell) when above — plus the day's end-of-day close (faint), so you can
// scan for a pattern. 5-min history reaches ~60 days, so ranges cap at ~2 months.

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getMinuteTrend } from "../services/priceHistory";
import IntradayDayChart from "./IntradayDayChart";
import StackedDaysChart from "./StackedDaysChart";

const VBW = 840, VBH = 270, PL = 54, PR = 828, PT = 18, PB = 224;
const RANGES = [{ k: "1W", d: 7 }, { k: "2W", d: 14 }, { k: "1M", d: 31 }, { k: "2M", d: 58 }, { k: "3M", d: 91 }, { k: "6M", d: 183 }, { k: "1Y", d: 365 }, { k: "2Y", d: 730 }];
const px2 = (v) => (v || v === 0 ? Number(v).toFixed(2) : "—");
const clock = (m) => { const t = 570 + (m || 0); const h = Math.floor(t / 60), mm = t % 60; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(mm).padStart(2, "0")}`; };
const shortDate = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${m}/${d}` : iso; };

export default function DataTrendChart({ symbol, minute, onMinuteChange }) {
  const { T } = useTheme();
  const [days, setDays] = useState(31);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(null); // index under the cursor
  const [pin, setPin] = useState(null);     // index clicked/selected (sticky)
  const [viewAll, setViewAll] = useState(false); // full-page grid of every day's intraday
  const [allRes, setAllRes] = useState("5m");    // global bar size for the View All grid
  const [stacked, setStacked] = useState(false); // all days layered on one chart
  const [minuteDraft, setMinuteDraft] = useState(String(minute));
  const [daysDraft, setDaysDraft] = useState(String(31));

  useEffect(() => { setMinuteDraft(String(minute)); }, [minute]);
  const commitMinute = (v) => { const n = Math.max(0, Math.round(Number(v))); if (Number.isFinite(n) && onMinuteChange) onMinuteChange(n); };
  const commitDays = (v) => { const d = Math.max(5, Math.min(730, Math.round(Number(v) || 5))); setDays(d); setDaysDraft(String(d)); };

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setData(null); setHover(null); setPin(null);
    getMinuteTrend(symbol, minute, days)
      .then((r) => { if (alive) { setData(r); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No history."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, minute, days]);

  // Esc closes the stacked overlay first (if open), then the View All page.
  useEffect(() => {
    if (!viewAll) return;
    const onKey = (e) => { if (e.key !== "Escape") return; if (stacked) setStacked(false); else setViewAll(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewAll, stacked]);

  const rows = (data?.trend || []).filter((r) => r.priorClose != null);
  const n = rows.length;
  const vals = rows.flatMap((r) => [r.captured, r.eod, r.priorClose]).filter((v) => Number.isFinite(v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const xD = (i) => PL + (n <= 1 ? (PR - PL) / 2 : (i / (n - 1)) * (PR - PL));
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };

  const stats = useMemo(() => {
    let buy = 0, sell = 0, fav = 0, sig = 0;
    rows.forEach((r) => {
      if (r.signal === "B") { buy++; sig++; if (r.eod > r.captured) fav++; }
      else if (r.signal === "S") { sell++; sig++; if (r.eod < r.captured) fav++; }
    });
    return { buy, sell, sig, favPct: sig ? Math.round((fav / sig) * 100) : null };
  }, [rows]);

  const active = pin != null && pin < n ? pin : (hover != null && hover < n ? hover : null); // ring
  const popIdx = (hover != null && hover < n && hover !== pin) ? hover : null;               // transient hover popup
  const sel = popIdx != null ? rows[popIdx] : null;
  const pinRow = pin != null && pin < n ? rows[pin] : null;                                   // opened day detail

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const pill = (a) => ({ padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const numInput = { width: 46, padding: "3px 6px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 12 };
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const setRangeDays = (d) => { setDays(d); setDaysDraft(String(d)); };

  // Shared control cluster (minute + range + actions). Rendered as a plain call
  // (not <Controls/>) so the inputs keep focus across the parent's re-renders.
  const renderControls = (withActions = true) => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>Min</span>
      <input type="number" min={0} value={minuteDraft}
        onChange={(e) => setMinuteDraft(e.target.value)}
        onBlur={(e) => commitMinute(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        title="Minute of the session to capture (0 = 9:30 open). Press Enter." style={numInput} />
      {RANGES.map((r) => <button key={r.k} onClick={() => setRangeDays(r.d)} style={pill(days === r.d)}>{r.k}</button>)}
      <input type="number" min={5} max={730} value={daysDraft}
        onChange={(e) => setDaysDraft(e.target.value)}
        onBlur={(e) => commitDays(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        title="Days back (5–730). Beyond ~60 days bars are hourly, so the minute is approximate." style={numInput} />
      <span style={{ color: T.textDim, fontSize: 10, fontFamily: font }}>d{data?.interval ? ` · ${data.interval}` : ""}</span>
      {withActions && (
        <button onClick={() => setViewAll(true)} disabled={!n} style={{ ...pill(false), marginLeft: 4, opacity: n ? 1 : 0.5 }}>⊞ View All</button>
      )}
    </div>
  );

  return (
    <div style={card} role="region" aria-label="Data trend">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Data Trend</h3>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>{symbol} · minute {minute} ({clock(minute)}) vs prior close</span>
        </div>
        {renderControls(true)}
      </div>

      {/* Pattern stats + legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontFamily: font, fontSize: 11 }}>
        <span style={{ color: T.success }}>● B = buy (below prior close)</span>
        <span style={{ color: T.danger }}>● S = sell (above prior close)</span>
        <span style={{ color: T.textDim }}>faint dot = end-of-day close</span>
        {stats.sig > 0 && <span style={{ color: T.text }}>{n}d · <b style={{ color: T.success }}>{stats.buy}B</b> / <b style={{ color: T.danger }}>{stats.sell}S</b> · signal→EOD favorable <b>{stats.favPct}%</b></span>}
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        {loading ? (
          <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol} history…</div>
        ) : error ? (
          <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        ) : n === 0 ? (
          <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No intraday history for {symbol}.</div>
        ) : (
          <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.35" />
                <text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const buy = r.signal === "B", sell = r.signal === "S";
              const col = buy ? T.success : sell ? T.danger : T.textDim;
              const x = xD(i);
              return (
                <g key={i}>
                  {/* vertical line: prior close → captured */}
                  <line x1={x} y1={yP(r.priorClose)} x2={x} y2={yP(r.captured)} stroke={col} strokeWidth="1.25" opacity="0.5" />
                  {/* faint EOD close dot */}
                  <circle cx={x} cy={yP(r.eod)} r="2.2" fill={T.textMuted || T.textDim} opacity="0.7" />
                  {/* highlight ring when this day is hovered/selected */}
                  {active === i && <circle cx={x} cy={yP(r.captured)} r="10" fill="none" stroke={col} strokeWidth="2" opacity="0.9" />}
                  {/* captured dot + B/S circle */}
                  <circle cx={x} cy={yP(r.captured)} r="6.5" fill={col} stroke={T.surface} strokeWidth="1.5" />
                  <text x={x} y={yP(r.captured) + 3.2} textAnchor="middle" fontSize="8.5" fontFamily={font} fontWeight="800" fill="#0A0A0A">{buy ? "B" : sell ? "S" : "·"}</text>
                  {i % labelEvery === 0 && <text x={x} y={VBH - 6} textAnchor="middle" fontSize="8.5" fontFamily={font} fill={T.textDim}>{shortDate(r.date)}</text>}
                  {/* invisible hit target — hover to preview, click to pin the snapshot */}
                  <circle cx={x} cy={yP(r.captured)} r="13" fill="transparent" style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                    onClick={() => setPin((p) => (p === i ? null : i))} />
                </g>
              );
            })}
          </svg>
        )}

        {/* ── Per-day snapshot popup ───────────────────────────────────────── */}
        {sel && (() => {
          const col = sel.signal === "B" ? T.success : sel.signal === "S" ? T.danger : T.textDim;
          const leftPct = Math.min(82, Math.max(18, (xD(popIdx) / VBW) * 100));
          const topPct = (yP(sel.captured) / VBH) * 100;
          const below = topPct < 40;
          const move = Number.isFinite(sel.eod) && Number.isFinite(sel.captured) ? sel.eod - sel.captured : null;
          const movePct = move != null && sel.captured ? (move / sel.captured) * 100 : null;
          const favorable = sel.signal === "B" ? sel.eod > sel.captured : sel.signal === "S" ? sel.eod < sel.captured : null;
          const label = sel.signal === "B" ? "BUY" : sel.signal === "S" ? "SELL" : "—";
          // Mini day snapshot: prior close (dashed) → minute-N dot (B/S) → EOD close.
          const W = 190, H = 54, px = [26, 95, 164];
          const mv = [sel.priorClose, sel.captured, sel.eod].filter(Number.isFinite);
          let mlo = Math.min(...mv), mhi = Math.max(...mv);
          if (!Number.isFinite(mlo) || mlo === mhi) { mlo -= 0.5; mhi += 0.5; }
          const mpad = (mhi - mlo) * 0.25 || 0.5; mlo -= mpad; mhi += mpad;
          const my = (v) => Number.isFinite(v) ? (H - 8) - ((v - mlo) / ((mhi - mlo) || 1)) * (H - 16) : H / 2;
          return (
            <div style={{
              position: "absolute", left: `${leftPct}%`, top: `${topPct}%`,
              transform: `translate(-50%, ${below ? "16px" : "calc(-100% - 16px)"})`,
              width: 230, background: T.card, border: `1px solid ${col}66`, borderRadius: 10,
              boxShadow: "0 8px 28px rgba(0,0,0,0.35)", padding: "10px 12px", zIndex: 20,
              pointerEvents: "none", fontFamily: font,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: T.text, fontSize: 12, fontWeight: 700 }}>{shortDate(sel.date)} · minute {minute} ({clock(minute)})</span>
                <span style={{ color: "#0A0A0A", background: col, fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>{label}</span>
              </div>
              {/* mini snapshot */}
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", marginBottom: 6 }}>
                <line x1={6} y1={my(sel.priorClose)} x2={W - 6} y2={my(sel.priorClose)} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
                <polyline points={`${px[0]},${my(sel.priorClose)} ${px[1]},${my(sel.captured)} ${px[2]},${my(sel.eod)}`} fill="none" stroke={col} strokeWidth="1.5" opacity="0.6" />
                <circle cx={px[0]} cy={my(sel.priorClose)} r="2.5" fill={T.textDim} />
                <circle cx={px[2]} cy={my(sel.eod)} r="3" fill={T.textMuted || T.textDim} />
                <circle cx={px[1]} cy={my(sel.captured)} r="7.5" fill={col} stroke={T.card} strokeWidth="1.5" />
                <text x={px[1]} y={my(sel.captured) + 3} textAnchor="middle" fontSize="9" fontWeight="800" fill="#0A0A0A" fontFamily={font}>{sel.signal === "B" ? "B" : sel.signal === "S" ? "S" : "·"}</text>
                <text x={px[0]} y={H - 1} textAnchor="middle" fontSize="7" fill={T.textDim} fontFamily={font}>prior</text>
                <text x={px[1]} y={H - 1} textAnchor="middle" fontSize="7" fill={T.textDim} fontFamily={font}>{minute}m</text>
                <text x={px[2]} y={H - 1} textAnchor="middle" fontSize="7" fill={T.textDim} fontFamily={font}>close</text>
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", fontSize: 10.5, color: T.textDim }}>
                <span>Prior close</span><span style={{ color: T.text, textAlign: "right" }}>{px2(sel.priorClose)}</span>
                <span>{minute}m dot</span><span style={{ color: col, textAlign: "right", fontWeight: 700 }}>{px2(sel.captured)}</span>
                <span>Day close</span><span style={{ color: T.text, textAlign: "right" }}>{px2(sel.eod)}</span>
              </div>
              {move != null && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}`, fontSize: 10.5, color: favorable ? T.success : T.danger, fontWeight: 700 }}>
                  {favorable ? "✓ favorable" : "✗ unfavorable"} · closed {move >= 0 ? "+" : ""}{px2(move)}{movePct != null ? ` (${move >= 0 ? "+" : ""}${movePct.toFixed(2)}%)` : ""} vs {minute}m dot
                </div>
              )}
              <div style={{ marginTop: 5, fontSize: 9.5, color: T.textDim }}>Click to open the full intraday chart →</div>
            </div>
          );
        })()}
      </div>

      {/* Full intraday detail for the clicked day — zoomable, with a hover readout */}
      {pinRow && (
        <IntradayDayChart
          symbol={symbol}
          date={pinRow.date}
          priorClose={pinRow.priorClose}
          targetMin={minute}
          captured={pinRow.captured}
          signal={pinRow.signal}
          onClose={() => setPin(null)}
        />
      )}
      <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
        Each column is one trading day: the dot is the price at minute {minute} ({clock(minute)}, interpolated at the exact minute), the faint dot is that day's close. <b>Hover or tap a circle</b> to see that day's snapshot, or use <b>⊞ View All</b> / <b>▦ Stacked View</b>. "Favorable" = a B day that closed higher, or an S day that closed lower. 5-min bars reach ~60 days; longer ranges use hourly bars, so the minute is approximate.
      </div>

      {/* ── View All: full-page flat grid of every day's intraday chart ──────── */}
      {viewAll && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.bg, overflowY: "auto" }}>
          {/* sticky top bar with Back arrow + global resolution toggle */}
          <div style={{ position: "sticky", top: 0, zIndex: 2, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button onClick={() => setViewAll(false)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 8 }}>← Back</button>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 17, margin: 0 }}>{symbol} · all days intraday</h2>
                <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>{n} day{n > 1 ? "s" : ""} · minute {minute} ({clock(minute)})</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {renderControls(false)}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>bars</span>
                <div style={{ display: "flex", gap: 4 }}>{["1m", "5m", "30m", "1h"].map((iv) => <button key={iv} onClick={() => setAllRes(iv)} style={pill(allRes === iv)}>{iv}</button>)}</div>
              </div>
              <button onClick={() => setStacked((s) => !s)} style={pill(stacked)}>▦ Stacked overlay</button>
            </div>
          </div>

          {/* Stacked overlay — toggled on/off, shown above the flat charts */}
          {stacked && (
            <div style={{ padding: "16px 20px 0" }}>
              <StackedDaysChart symbol={symbol} minute={minute} days={days} />
            </div>
          )}

          {/* flat grid — newest first so the most recent sessions are up top */}
          <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))", gap: 14 }}>
            {rows.slice().reverse().map((r) => (
              <IntradayDayChart
                key={`${r.date}-${allRes}`}
                symbol={symbol}
                date={r.date}
                priorClose={r.priorClose}
                targetMin={minute}
                captured={r.captured}
                signal={r.signal}
                res={allRes}
                onResChange={setAllRes}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
