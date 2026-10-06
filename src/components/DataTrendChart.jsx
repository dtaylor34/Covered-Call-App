// ─── src/components/DataTrendChart.jsx ───────────────────────────────────────
// "Data Trend" view: for each of the last N trading days, the price captured at
// minute N (dot) vs that day's prior close — a green "B" (buy) when below, red
// "S" (sell) when above — plus the day's end-of-day close (faint), so you can
// scan for a pattern. 5-min history reaches ~60 days, so ranges cap at ~2 months.

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getMinuteTrend } from "../services/priceHistory";

const VBW = 840, VBH = 270, PL = 54, PR = 828, PT = 18, PB = 224;
const RANGES = [{ k: "1W", d: 7 }, { k: "2W", d: 14 }, { k: "1M", d: 31 }, { k: "2M", d: 58 }];
const px2 = (v) => (v || v === 0 ? Number(v).toFixed(2) : "—");
const clock = (m) => { const t = 570 + (m || 0); const h = Math.floor(t / 60), mm = t % 60; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(mm).padStart(2, "0")}`; };
const shortDate = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${m}/${d}` : iso; };

export default function DataTrendChart({ symbol, minute }) {
  const { T } = useTheme();
  const [days, setDays] = useState(31);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setData(null);
    getMinuteTrend(symbol, minute, days)
      .then((r) => { if (alive) { setData(r); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No history."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, minute, days]);

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

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const pill = (a) => ({ padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const labelEvery = Math.max(1, Math.ceil(n / 12));

  return (
    <div style={card} role="region" aria-label="Data trend">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Data Trend</h3>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>{symbol} · minute {minute} ({clock(minute)}) vs prior close</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>{RANGES.map((r) => <button key={r.k} onClick={() => setDays(r.d)} style={pill(days === r.d)}>{r.k}</button>)}</div>
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
                  {/* captured dot + B/S circle */}
                  <circle cx={x} cy={yP(r.captured)} r="6.5" fill={col} stroke={T.surface} strokeWidth="1.5" />
                  <text x={x} y={yP(r.captured) + 3.2} textAnchor="middle" fontSize="8.5" fontFamily={font} fontWeight="800" fill="#0A0A0A">{buy ? "B" : sell ? "S" : "·"}</text>
                  {i % labelEvery === 0 && <text x={x} y={VBH - 6} textAnchor="middle" fontSize="8.5" fontFamily={font} fill={T.textDim}>{shortDate(r.date)}</text>}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
        Each column is one trading day: the dot is the price at minute {minute} (nearest 5-min bar), the faint dot is that day's close. "Favorable" = a B day that closed higher, or an S day that closed lower. Minute history reaches ~60 days — for months/years we'd capture minute {minute} daily going forward.
      </div>
    </div>
  );
}
