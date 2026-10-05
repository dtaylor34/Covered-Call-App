// ─── src/components/PriceTrendChart.jsx ──────────────────────────────────────
// Price trend chart for the selected stock. Range selector (1D…All), hover
// crosshair + tooltip, and covered-call-oriented views:
//   • Price       — the close line
//   • Strike view — price + your selected strike (shaded "called-away" zone) +
//                   breakeven line, so you see how often price sat above strike
//   • % Change    — normalized return across the range
// Data via getPriceHistory (Schwab real-time when connected, else Yahoo).

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";

const RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"];
const VIEWS = [
  { key: "price", label: "Price" },
  { key: "strike", label: "Strike view" },
  { key: "pct", label: "% Change" },
];

// viewBox geometry (scales to container width)
const VB_W = 860, VB_H = 300;
const PL = 56, PR = VB_W - 14, PT = 16, PB = VB_H - 26;

const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function PriceTrendChart({ symbol, strike, breakeven, currentPrice }) {
  const { T } = useTheme();
  const [range, setRange] = useState("6M");
  const [view, setView] = useState("price");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoverI, setHoverI] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setHoverI(null);
    getPriceHistory(symbol, range)
      .then((res) => { if (alive) { setData(res); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "Could not load chart."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, range]);

  const pts = data?.points || [];
  const n = pts.length;
  const base = n ? pts[0].c : 0;
  const last = n ? pts[n - 1].c : (currentPrice || 0);

  // Values to plot depend on the view.
  const values = useMemo(
    () => (view === "pct" ? pts.map((p) => (base ? ((p.c - base) / base) * 100 : 0)) : pts.map((p) => p.c)),
    [pts, view, base]
  );

  // Overlays (strike / breakeven) only in strike view, and only when valid.
  const strikeV = view === "strike" && Number(strike) > 0 ? Number(strike) : null;
  const beV = view === "strike" && Number(breakeven) > 0 ? Number(breakeven) : null;

  // y-domain spans the data plus any overlay lines so they're always visible.
  const { lo, hi } = useMemo(() => {
    const extra = [strikeV, beV].filter((v) => Number.isFinite(v));
    const all = values.concat(view === "pct" ? [0] : []).concat(extra);
    let mn = Math.min(...all), mx = Math.max(...all);
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) { mn = 0; mx = 1; }
    const pad = (mx - mn) * 0.08 || 1;
    return { lo: mn - pad, hi: mx + pad };
  }, [values, strikeV, beV, view]);

  const px = (i) => PL + (n <= 1 ? 0 : (i / (n - 1)) * (PR - PL));
  const py = (v) => PB - ((v - lo) / (hi - lo)) * (PB - PT);

  const linePath = n ? values.map((v, i) => (i ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1)).join(" ") : "";
  const areaPath = n ? `${linePath} L ${px(n - 1).toFixed(1)} ${PB} L ${px(0).toFixed(1)} ${PB} Z` : "";

  const change = n ? last - base : 0;
  const changePct = base ? (change / base) * 100 : 0;
  const up = change >= 0;
  const lineColor = view === "pct" ? (up ? T.success : T.danger) : T.accent;

  // Axis ticks
  const yTicks = useMemo(() => {
    const out = []; const steps = 4;
    for (let i = 0; i <= steps; i++) out.push(lo + ((hi - lo) * i) / steps);
    return out;
  }, [lo, hi]);
  const xTicks = useMemo(() => {
    if (!n) return [];
    const steps = Math.min(5, n - 1) || 1;
    const out = [];
    for (let i = 0; i <= steps; i++) out.push(Math.round(((n - 1) * i) / steps));
    return [...new Set(out)];
  }, [n]);

  const fmtT = (t) => {
    const d = new Date(t);
    if (range === "1D" || range === "1W") return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  };
  const fmtY = (v) => (view === "pct" ? signPct(v) : `$${v.toFixed(v < 10 ? 2 : 0)}`);

  const onMove = (e) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vbx = ((e.clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((vbx - PL) / (PR - PL)) * (n - 1));
    setHoverI(Math.max(0, Math.min(n - 1, i)));
  };

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const font = T.fontMono, displayFont = T.fontDisplay;
  const pill = (active) => ({ padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accent : "transparent", color: active ? "#0A0A0A" : T.textDim });

  const hv = hoverI != null && pts[hoverI] ? pts[hoverI] : null;
  const hvVal = hoverI != null && values[hoverI] != null ? values[hoverI] : null;
  const hvX = hoverI != null ? px(hoverI) : 0;

  return (
    <div style={card} role="region" aria-label={`Price trend for ${symbol}`}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: displayFont, fontSize: 18, margin: 0 }}>{symbol}</h3>
          <span style={{ color: T.text, fontFamily: font, fontSize: 18, fontWeight: 700 }}>{n ? money(last) : "—"}</span>
          {n > 0 && (
            <span style={{ color: up ? T.success : T.danger, fontFamily: font, fontSize: 13, fontWeight: 700 }}>
              {up ? "▲" : "▼"} {money(Math.abs(change))} ({signPct(changePct)}) · {range}
            </span>
          )}
        </div>
        {data?.source && <span style={{ color: T.textDim, fontSize: 10, fontFamily: font, textTransform: "uppercase", letterSpacing: 1 }}>{data.source === "schwab" ? "● Schwab real-time" : "Yahoo · 15-min delayed"}</span>}
      </div>

      {/* View switch */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} style={pill(view === v.key)}>{v.label}</button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: "relative", width: "100%" }}>
        {loading ? (
          <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol}…</div>
        ) : error ? (
          <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
        ) : n === 0 ? (
          <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No price history for {symbol}.</div>
        ) : (
          <>
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: "100%", height: "auto", display: "block" }}
              onMouseMove={onMove} onMouseLeave={() => setHoverI(null)}>
              <defs>
                <linearGradient id="ptArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* y gridlines + labels */}
              {yTicks.map((v, i) => (
                <g key={i}>
                  <line x1={PL} y1={py(v)} x2={PR} y2={py(v)} stroke={T.border} strokeWidth="1" opacity="0.4" />
                  <text x={PL - 8} y={py(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{fmtY(v)}</text>
                </g>
              ))}

              {/* % baseline */}
              {view === "pct" && <line x1={PL} y1={py(0)} x2={PR} y2={py(0)} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />}

              {/* strike view: shaded called-away zone + strike + breakeven lines */}
              {strikeV != null && (
                <>
                  <rect x={PL} y={PT} width={PR - PL} height={Math.max(0, py(strikeV) - PT)} fill={T.danger} opacity="0.08" />
                  <line x1={PL} y1={py(strikeV)} x2={PR} y2={py(strikeV)} stroke={T.danger} strokeWidth="1.5" strokeDasharray="5 4" />
                  <text x={PR - 4} y={py(strikeV) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.danger} fontWeight="700">Strike {money(strikeV)}</text>
                </>
              )}
              {beV != null && (
                <>
                  <line x1={PL} y1={py(beV)} x2={PR} y2={py(beV)} stroke={T.warning || "#E6A23C"} strokeWidth="1.5" strokeDasharray="5 4" />
                  <text x={PR - 4} y={py(beV) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={T.warning || "#E6A23C"} fontWeight="700">Breakeven {money(beV)}</text>
                </>
              )}

              {/* area + line */}
              <path d={areaPath} fill="url(#ptArea)" />
              <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

              {/* x labels */}
              {xTicks.map((i) => (
                <text key={i} x={px(i)} y={VB_H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="10" fontFamily={font} fill={T.textDim}>{fmtT(pts[i].t)}</text>
              ))}

              {/* hover crosshair + dot */}
              {hv && (
                <g>
                  <line x1={hvX} y1={PT} x2={hvX} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx={hvX} cy={py(hvVal)} r="4" fill={lineColor} stroke={T.surface} strokeWidth="2" />
                </g>
              )}
            </svg>

            {/* hover tooltip (HTML overlay for crisp text) */}
            {hv && (
              <div style={{
                position: "absolute", top: 0, left: `${(hvX / VB_W) * 100}%`,
                transform: `translateX(${hvX > VB_W * 0.7 ? "-105%" : "8px"})`,
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 10px",
                pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap", boxShadow: "0 6px 18px #00000055",
              }}>
                <div style={{ color: T.text, fontWeight: 700 }}>{view === "pct" ? signPct(hvVal) : money(hv.c)}</div>
                <div style={{ color: T.textDim, marginTop: 2 }}>{fmtT(hv.t)}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Range selector */}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {RANGES.map((r) => (
          <button key={r} onClick={() => setRange(r)} style={pill(range === r)}>{r}</button>
        ))}
      </div>
    </div>
  );
}
