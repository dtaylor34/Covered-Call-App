// ─── src/components/MinuteCompareChart.jsx ───────────────────────────────────
// Focused intraday tool: previous session's close (dot + baseline) vs the latest
// session minute-by-minute (vertical sticks). Enter a minute number to compare
// the price at that minute of the session against the prior close:
//   • price at minute N  >  prev close  → SELL MARKET alert
//   • price at minute N  <  prev close  → BUY MARKET alert

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getIntradayCompare } from "../services/priceHistory";
import DataTrendChart from "./DataTrendChart";

const VBW = 820, VBH = 260, PL = 56, PR = 806, PT = 18, PB = 230;
const px2 = (v) => (v || v === 0 ? Number(v).toFixed(2) : "—");
// minute index (from 9:30 open) → clock label "9:45"
const clock = (m) => { const t = 570 + m; const h = Math.floor(t / 60), mm = t % 60; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(mm).padStart(2, "0")}`; };

export default function MinuteCompareChart({ symbol }) {
  const { T } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [minuteInput, setMinuteInput] = useState("15");
  const [mode, setMode] = useState("intraday"); // intraday | trend

  useEffect(() => {
    if (mode !== "intraday") return;
    let alive = true; setLoading(true); setError(""); setData(null);
    getIntradayCompare(symbol)
      .then((r) => { if (alive) { setData(r); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No intraday data."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, mode]);

  const mins = data?.minutes || [];
  const prevClose = Number(data?.prevClose);
  const hasBase = Number.isFinite(prevClose) && prevClose > 0;
  const maxM = mins.length ? mins[mins.length - 1].m : 390;

  // bar at the requested minute (exact m, else nearest at/under)
  const N = Math.max(0, Math.round(Number(minuteInput) || 0));
  const pick = useMemo(() => {
    if (!mins.length) return null;
    let exact = mins.find((x) => x.m === N);
    if (exact) return exact;
    let best = null; for (const x of mins) { if (x.m <= N && (!best || x.m > best.m)) best = x; }
    return best || mins[0];
  }, [mins, N]);

  const vals = mins.map((x) => x.c).concat(hasBase ? [prevClose] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const xM = (m) => PL + (maxM ? (m / maxM) * (PR - PL) : 0);
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const inp = { width: 90, minHeight: 38, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 14 };
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);

  // Signal
  const over = pick && hasBase && pick.c > prevClose;
  const under = pick && hasBase && pick.c < prevClose;
  const diff = pick && hasBase ? pick.c - prevClose : 0;

  return (
    <div style={card} role="region" aria-label="Minute compare">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Minute Compare</h3>
          <div style={{ display: "flex", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: 2, gap: 2 }}>
            {[{ m: "intraday", l: "Intraday" }, { m: "trend", l: "Data Trend" }].map(({ m, l }) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", background: mode === m ? T.accent : "transparent", color: mode === m ? "#0A0A0A" : T.textDim, fontFamily: font, fontSize: 11, fontWeight: 700 }}>{l}</button>
            ))}
          </div>
          {mode === "intraday" && data?.session && <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>{data.session}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>Minute</label>
          <input type="number" min={0} value={minuteInput} onChange={(e) => setMinuteInput(e.target.value)} style={inp} />
        </div>
      </div>

      {mode === "trend" && <DataTrendChart symbol={symbol} minute={N} />}

      {/* Intraday view */}
      {mode === "intraday" && (<>
      {/* Alert */}
      {pick && hasBase && (
        <div style={{ marginBottom: 12, padding: "11px 14px", borderRadius: 8, border: `1px solid ${(over ? T.danger : under ? T.success : T.border)}55`, background: over ? `${T.danger}14` : under ? `${T.success}14` : T.card }}>
          <div style={{ color: over ? T.danger : under ? T.success : T.textDim, fontFamily: font, fontSize: 14, fontWeight: 800, letterSpacing: 0.5 }}>
            {over ? "🔴 SELL MARKET" : under ? "🟢 BUY MARKET" : "— AT PREV CLOSE"}
          </div>
          <div style={{ color: T.text, fontFamily: font, fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
            At minute <b>{pick.m}</b> ({clock(pick.m)}) {symbol} = <b>${px2(pick.c)}</b> vs prev close <b>${px2(prevClose)}</b>
            {" "}(<b style={{ color: over ? T.danger : under ? T.success : T.textDim }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}</b>) — price is {over ? "above" : under ? "below" : "at"} the last close.
          </div>
        </div>
      )}

      <div style={{ position: "relative", width: "100%" }}>
        {loading ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol} intraday…</div>
        ) : error ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        ) : mins.length === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No intraday minutes for {symbol}.</div>
        ) : (
          <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {/* y gridlines + labels */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.35" />
                <text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text>
              </g>
            ))}

            {/* prev-close baseline + dot */}
            {hasBase && (
              <>
                <line x1={PL} y1={yP(prevClose)} x2={PR} y2={yP(prevClose)} stroke={T.textDim} strokeWidth="1.25" strokeDasharray="5 4" />
                <circle cx={PL} cy={yP(prevClose)} r="4.5" fill={T.textDim} stroke={T.surface} strokeWidth="2" />
                <text x={PL + 8} y={yP(prevClose) - 6} fontSize="10" fontFamily={font} fill={T.textDim} fontWeight="700">prev close ${px2(prevClose)}</text>
              </>
            )}

            {/* minute sticks: baseline → minute close, colored above/below */}
            {mins.map((x, i) => {
              const up = hasBase ? x.c >= prevClose : true;
              return <line key={i} x1={xM(x.m)} y1={hasBase ? yP(prevClose) : yP(lo)} x2={xM(x.m)} y2={yP(x.c)} stroke={up ? T.success : T.danger} strokeWidth="1" opacity="0.55" />;
            })}

            {/* selected minute marker */}
            {pick && (
              <>
                <line x1={xM(pick.m)} y1={PT} x2={xM(pick.m)} y2={PB} stroke={T.accent} strokeWidth="1.5" />
                <circle cx={xM(pick.m)} cy={yP(pick.c)} r="5" fill={T.accent} stroke={T.surface} strokeWidth="2" />
                <text x={xM(pick.m)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.accent}>min {pick.m} · {clock(pick.m)}</text>
              </>
            )}
          </svg>
        )}
      </div>
      <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
        Minute 0 = 9:30 ET open. Green sticks = above prev close, red = below. Data is delayed outside Schwab real-time; on weekends/holidays this shows the last full session.
      </div>
      </>)}
    </div>
  );
}
