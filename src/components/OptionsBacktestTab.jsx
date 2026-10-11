// ─── src/components/OptionsBacktestTab.jsx ───────────────────────────────────
// Options Manager → Backtest: run a SAVED custom strategy against price history.
// Pick a strategy, pick an entry date, and it marks every leg day-by-day with
// Black-Scholes (price move + time decay) to show the strategy's P&L over the
// holding window — the underlying (left axis) and the strategy P&L (right axis),
// with the best historical exit marked, so you can see when to get in and out.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionStrategies } from "../hooks/useOptionStrategies";
import { getPriceHistory } from "../services/priceHistory";
import { callVal, putVal } from "../lib/coveredCallMath";

const usd = (n, signed) => { const a = Math.abs(n || 0); const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s; return (n < -0.005 ? "−" : "") + s; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const px = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : "—");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);
const DAY = 86400000, VIOLET = "#A78BFA";
const RANGES = ["3M", "6M", "1Y", "2Y"];

// Mark the whole strategy to market at underlying S with `remDays` left.
function markPL(legs, S, remDays, ivPct, mult) {
  const iv = (num(ivPct) || 25) / 100;
  return legs.reduce((a, l) => {
    const K = num(l.strike), prem = num(l.premium), qty = Math.max(1, Math.round(num(l.contracts) || 1));
    const isCall = String(l.type).toUpperCase() === "CALL", long = l.dir !== "sell";
    const mark = remDays > 0 ? (isCall ? callVal(S, K, remDays, iv) : putVal(S, K, remDays, iv)) : (isCall ? Math.max(0, S - K) : Math.max(0, K - S));
    const pl = long ? mark - prem : prem - mark;
    return a + pl * mult * qty;
  }, 0);
}
const netCost = (legs, mult) => legs.reduce((a, l) => a + (l.dir === "sell" ? 1 : -1) * num(l.premium) * mult * Math.max(1, Math.round(num(l.contracts) || 1)), 0);

export default function OptionsBacktestTab() {
  const { T } = useTheme();
  const { strategies } = useOptionStrategies();
  const [selId, setSelId] = useState(null);
  const [range, setRange] = useState("1Y");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entryMs, setEntryMs] = useState(null);
  const [hoverI, setHoverI] = useState(null);
  const svgRef = useRef(null);

  const strat = useMemo(() => strategies.find((s) => s.id === selId) || strategies[0] || null, [strategies, selId]);
  const legs = strat?.legs || [];
  const mult = num(strat?.mult) || 100;
  const dte = Math.max(1, Math.round(num(strat?.dte) || 30));
  const iv = num(strat?.iv) || 25;
  const sym = strat?.sym || "";

  useEffect(() => {
    if (!sym) { setPoints([]); return; }
    let alive = true; setLoading(true); setError(""); setPoints([]);
    getPriceHistory(sym, range).then((r) => { if (!alive) return; const pts = r.points || []; setPoints(pts); setLoading(false); if (pts.length > 2) setEntryMs(pts[Math.floor(pts.length * 0.25)].t); })
      .catch((e) => { if (alive) { setError(e?.message || "No data."); setLoading(false); } });
    return () => { alive = false; };
  }, [sym, range]);

  const nearest = (ms) => { if (!points.length || !Number.isFinite(ms)) return null; let best = points[0], bd = Infinity; for (const p of points) { const d = Math.abs(p.t - ms); if (d < bd) { bd = d; best = p; } } return best; };
  const entry = useMemo(() => nearest(entryMs), [entryMs, points]);

  const series = useMemo(() => {
    if (!entry || !legs.length) return [];
    return points.filter((p) => p.t >= entry.t && (p.t - entry.t) / DAY <= dte + 2).map((p) => ({ t: p.t, c: p.c, pl: markPL(legs, p.c, Math.max(0, dte - (p.t - entry.t) / DAY), iv, mult) }));
  }, [entry, points, legs, dte, iv, mult]);
  const best = useMemo(() => (series.length ? series.reduce((b, s) => (s.pl > b.pl ? s : b), series[0]) : null), [series]);
  const last = series.length ? series[series.length - 1] : null;
  const cost = netCost(legs, mult);

  // geometry
  const VBW = 920, VBH = 340, PL = 60, PR = 884, PT = 20, PB = 296;
  const tMin = points.length ? points[0].t : 0, tMax = points.length ? points[points.length - 1].t : 1;
  const cvals = points.map((p) => p.c); let clo = Math.min(...cvals), chi = Math.max(...cvals);
  if (!Number.isFinite(clo)) { clo = 0; chi = 1; } const cpad = (chi - clo) * 0.08 || 1; clo -= cpad; chi += cpad;
  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (PR - PL);
  const yC = (v) => PB - ((v - clo) / ((chi - clo) || 1)) * (PB - PT);
  const line = points.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yC(p.c).toFixed(1)).join(" ");
  const pvals = series.map((s) => s.pl); let plo = Math.min(0, ...pvals), phi = Math.max(0, ...pvals);
  if (!Number.isFinite(phi) || phi === plo) { phi = 1; plo = -1; } const ppad = (phi - plo) * 0.12 || 1; phi += ppad; plo -= ppad;
  const yPL = (v) => PB - ((v - plo) / ((phi - plo) || 1)) * (PB - PT);
  const plLine = series.length > 1 ? series.map((s, i) => (i ? "L" : "M") + xT(s.t).toFixed(1) + " " + yPL(s.pl).toFixed(1)).join(" ") : "";
  const cTicks = [0, 1, 2, 3, 4].map((i) => clo + ((chi - clo) * i) / 4);
  const pTicks = [plo, (plo + phi) / 2, phi];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + (tMax - tMin) * f);

  const tFromEvent = (e) => { const rect = svgRef.current?.getBoundingClientRect(); if (!rect?.width) return null; const x = ((e.clientX - rect.left) / rect.width) * VBW; return tMin + (tMax - tMin) * Math.max(0, Math.min(1, (x - PL) / (PR - PL))); };
  const onMove = (e) => { const t = tFromEvent(e); if (t == null) return; const p = nearest(t); if (p) setHoverI(points.indexOf(p)); };
  const onClick = (e) => { const t = tFromEvent(e); if (t == null) return; const p = nearest(t); if (p) setEntryMs(p.t); };
  const hv = hoverI != null ? points[hoverI] : null;
  const hvPL = hv && entry && hv.t >= entry.t ? markPL(legs, hv.c, Math.max(0, dte - (hv.t - entry.t) / DAY), iv, mult) : null;

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const font = T.fontMono;
  const pill = (a) => ({ padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const inp = { minHeight: 40, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };

  return (
    <div role="region" aria-label="Strategy backtest">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Backtest · Strategy over history</h2>
        {strat && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{RANGES.map((r) => <button key={r} onClick={() => setRange(r)} style={pill(range === r)}>{r}</button>)}</div>}
      </div>

      {!strategies.length ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px", color: T.textDim }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🧩</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 6 }}>No saved strategies yet</div>
          <div style={{ fontSize: 13 }}>Build and save one in the <b>Strategies</b> tab, then back-test it here.</div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: T.textDim }}>Strategy<br />
              <select value={strat?.id || ""} onChange={(e) => setSelId(e.target.value)} style={{ ...inp, minWidth: 200 }}>{strategies.map((s) => <option key={s.id} value={s.id}>{s.name}{s.sym ? ` · ${s.sym}` : ""}</option>)}</select></label>
            <label style={{ fontSize: 11, color: T.textDim }}>Entry date<br /><input type="date" value={msToDate(entry?.t)} onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) setEntryMs(ms); }} style={{ ...inp, width: 150 }} /></label>
            <div style={{ color: T.textDim, fontFamily: font, fontSize: 12 }}>{legs.length} leg{legs.length === 1 ? "" : "s"} · {dte} DTE · IV {iv}% · net {cost >= 0 ? "credit" : "debit"} {usd(Math.abs(cost))}</div>
          </div>

          {!sym ? <div style={{ color: T.warn || T.warning, fontFamily: font, fontSize: 12 }}>This strategy has no symbol — add one in the Strategies tab to back-test it.</div> : (
          <div style={{ position: "relative", width: "100%" }}>
            {loading ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {sym}…</div>
            : error ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
            : !points.length ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No data.</div>
            : (
              <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)} onClick={onClick}>
                {cTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yC(v)} x2={PR} y2={yC(v)} stroke={T.border} strokeWidth="1" opacity="0.28" /><text x={PL - 8} y={yC(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text></g>))}
                {xTicks.map((t, i) => <text key={i} x={xT(t)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>{fmtDate(t)}</text>)}
                <path d={line} fill="none" stroke={T.accent} strokeWidth="1.5" opacity="0.85" />
                {/* strategy P&L (right axis, violet) */}
                {plLine && (<>
                  {pTicks.map((v, i) => <text key={i} x={PR + 4} y={yPL(v) + 3} textAnchor="start" fontSize="9" fontFamily={font} fill={VIOLET}>{usd(v, true)}</text>)}
                  <line x1={entry ? xT(entry.t) : PL} y1={yPL(0)} x2={PR} y2={yPL(0)} stroke={VIOLET} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
                  <path d={plLine} fill="none" stroke={VIOLET} strokeWidth="2.25" />
                  {best && best.pl > 0 && (<><circle cx={xT(best.t)} cy={yPL(best.pl)} r="5" fill={VIOLET} stroke={T.surface} strokeWidth="2" /><text x={xT(best.t)} y={yPL(best.pl) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={VIOLET}>best exit</text></>)}
                </>)}
                {entry && (<><line x1={xT(entry.t)} y1={PT} x2={xT(entry.t)} y2={PB} stroke={T.text} strokeWidth="1.25" opacity="0.6" /><text x={xT(entry.t)} y={PT + 10} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.text}>entry</text></>)}
                {hv && (<line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />)}
              </svg>
            )}
            {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 8px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap" }}><b style={{ color: T.text }}>{px(hv.c)}</b> · {fmtDate(hv.t)}{hvPL != null && <div style={{ color: hvPL >= 0 ? T.success : T.danger, marginTop: 2 }}>strategy {usd(hvPL, true)}</div>}</div>)}
          </div>)}
          <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6 }}>Click the chart to set the entry date. Violet = strategy P&L marked each day with Black-Scholes (price move + time decay) through {dte} DTE.</div>
        </div>
      )}

      {strat && entry && last && sym && (
        <div style={{ ...card }}>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 10 }}>{strat.name} — entered {fmtDate(entry.t)} at {px(entry.c)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Stat T={T} label="Net at entry" value={`${cost >= 0 ? "credit " : "debit "}${usd(Math.abs(cost))}`} color={cost >= 0 ? T.success : T.text} />
            <Stat T={T} label="Best exit" value={best && best.pl > 0 ? fmtDate(best.t) : "—"} />
            <Stat T={T} label="Best P&L" value={best && best.pl > 0 ? usd(best.pl, true) : "—"} color={T.success} />
            <Stat T={T} label="P&L at end" value={usd(last.pl, true)} color={last.pl >= 0 ? T.success : T.danger} />
            <Stat T={T} label="Days to best" value={best ? `${Math.round((best.t - entry.t) / DAY)}d` : "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ T, label, value, color }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
