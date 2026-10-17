// ─── src/components/CoveredCallsProjectionsTab.jsx ───────────────────────────
// Covered Calls → Projections: back-test a covered call against price history.
// Pick one of your working calls (or go custom), set the entry date, and every
// day the short call is marked with Black-Scholes (time decay + price move) to
// show the covered-call P&L over the holding window, the best time to BUY BACK
// (most premium captured), and the assignment outcome at expiry. Plus a Claude
// prompt (Pro-chat copy or run via API) for when to buy back / let it ride.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { usePositions } from "../hooks/usePositions";
import { getPriceHistory } from "../services/priceHistory";
import { optionsExitAdvice } from "../services/ai";
import { callVal, strikeStep } from "../lib/coveredCallMath";

const usd = (n, signed) => { const a = Math.abs(n || 0); const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s; return (n < -0.005 ? "−" : "") + s; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const px = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : "—");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);
const DAY = 86400000, VIOLET = "#A78BFA", RANGES = ["3M", "6M", "1Y", "2Y"];
const dteFrom = (expiry, openedMs) => { const e = dateToMs(expiry); return e && openedMs ? Math.max(1, Math.round((e - openedMs) / DAY)) : 30; };

export default function CoveredCallsProjectionsTab() {
  const { T } = useTheme();
  const { positions } = usePositions();
  const [selId, setSelId] = useState("custom");
  const [sym, setSym] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [strike, setStrike] = useState("");
  const [premium, setPremium] = useState("");
  const [iv, setIv] = useState("25");
  const [dte, setDte] = useState("35");
  const [contracts, setContracts] = useState("1");
  const [range, setRange] = useState("1Y");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entryMs, setEntryMs] = useState(null);
  const [hoverI, setHoverI] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [ai, setAi] = useState({ loading: false, advice: null, error: null });
  const svgRef = useRef(null);

  const loadPosition = (id) => {
    setSelId(id);
    if (id === "custom") return;
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    setSym(p.sym || ""); setCostBasis(String(p.fillStock ?? "")); setStrike(String(p.strike ?? ""));
    setPremium(String(p.fillCall ?? "")); setIv(String(p.iv ?? 25)); setContracts(String(p.contracts ?? 1));
    setDte(String(dteFrom(p.expiry, p.openedAtMs))); if (Number.isFinite(p.openedAtMs)) setEntryMs(p.openedAtMs);
  };

  const S0 = num(costBasis), K = num(strike), prem = num(premium), ivv = num(iv), DTE = Math.max(1, Math.round(num(dte) || 35)), n = Math.max(1, Math.round(num(contracts) || 1));
  const shares = n * 100;
  const breakeven = S0 > 0 ? S0 - prem : null;

  useEffect(() => {
    if (!sym) { setPoints([]); return; }
    let alive = true; setLoading(true); setError(""); setPoints([]);
    getPriceHistory(sym, range).then((r) => { if (!alive) return; const pts = r.points || []; setPoints(pts); setLoading(false); if (pts.length > 2 && entryMs == null) setEntryMs(pts[Math.floor(pts.length * 0.25)].t); })
      .catch((e) => { if (alive) { setError(e?.message || "No data."); setLoading(false); } });
    return () => { alive = false; };
  }, [sym, range]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = (ms) => { if (!points.length || !Number.isFinite(ms)) return null; let best = points[0], bd = Infinity; for (const p of points) { const d = Math.abs(p.t - ms); if (d < bd) { bd = d; best = p; } } return best; };
  const entry = useMemo(() => nearest(entryMs), [entryMs, points]);

  // What the call would have SOLD FOR at the entry date: Black-Scholes value of the
  // chosen strike (or the nearest standard strike if none entered yet) using the
  // entry-date stock price, DTE, and IV. This is the premium you'd have collected.
  const estK = K > 0 ? K : (entry ? Math.round(entry.c / strikeStep(entry.c)) * strikeStep(entry.c) : 0);
  const estPremSh = (entry && estK > 0 && ivv > 0) ? callVal(entry.c, estK, DTE, ivv / 100) : null;
  const estPremTotal = estPremSh != null ? estPremSh * shares : null;

  // Covered-call P&L each day: stock move + premium kept (premium − cost to buy
  // the call back, marked with Black-Scholes). At/after expiry the call is intrinsic.
  const callMark = (S, remDays) => (remDays > 0 ? callVal(S, K, remDays, ivv / 100) : Math.max(0, S - K));
  const series = useMemo(() => {
    if (!entry || !(K > 0)) return [];
    return points.filter((p) => p.t >= entry.t && (p.t - entry.t) / DAY <= DTE + 2).map((p) => {
      const rem = Math.max(0, DTE - (p.t - entry.t) / DAY);
      const mk = callMark(p.c, rem);
      const premiumKept = (prem - mk) * shares;
      const stockUnreal = S0 > 0 ? (p.c - S0) * shares : 0;
      return { t: p.t, c: p.c, mk, premiumKept, total: stockUnreal + premiumKept };
    });
  }, [entry, points, K, ivv, prem, S0, DTE, shares]); // eslint-disable-line react-hooks/exhaustive-deps
  const bestBuyback = useMemo(() => (series.length ? series.reduce((b, s) => (s.premiumKept > b.premiumKept ? s : b), series[0]) : null), [series]);
  const bestTotal = useMemo(() => (series.length ? series.reduce((b, s) => (s.total > b.total ? s : b), series[0]) : null), [series]);
  const last = series.length ? series[series.length - 1] : null;
  const premiumCollected = prem * shares;
  // Outcome if held to expiry: assigned (S≥K, shares sell at K) or expired.
  const expPoint = series.length ? series[series.length - 1] : null;
  const expiryOutcome = expPoint ? (expPoint.c >= K
    ? { label: "called away", pl: S0 > 0 ? (K - S0 + prem) * shares : prem * shares }
    : { label: "expired", pl: S0 > 0 ? (expPoint.c - S0 + prem) * shares : prem * shares }) : null;

  useEffect(() => { setCopied(false); setAi({ loading: false, advice: null, error: null }); }, [sym, costBasis, strike, premium, iv, dte, contracts, entryMs]);

  const buildPrompt = () => {
    if (!series.length || !entry) return "";
    const step = Math.max(1, Math.ceil(series.length / 70));
    const path = series.filter((_, i) => i % step === 0 || i === series.length - 1).map((s) => `${msToDate(s.t)}:${px(s.c)}`).join("  ");
    return [
      `I'm running a COVERED CALL on ${sym}. I own ${shares} shares${S0 > 0 ? ` at a cost basis of ${px(S0)}/share` : ""} and sold ${n} call(s) at strike ${K} for ${px(prem)}/share premium, ${DTE} DTE, ~${ivv}% IV.`,
      breakeven != null ? `Breakeven (cost basis − premium): ${px(breakeven)}. If assigned, shares sell at ${K}.` : `If assigned, shares sell at ${K}.`,
      `Entered ${msToDate(entry.t)} with the stock at ${px(entry.c)}; latest ${last ? msToDate(last.t) : "—"} at ${last ? px(last.c) : "—"}.`,
      `Daily closes since entry (date:price): ${path}`,
      ``,
      `Advise what to do with the call now. Consider the stock's move toward/away from the ${K} strike, how much premium I've captured via time decay (cost to buy it back = premium × 100 × contracts minus the call's current value), and assignment risk. Answer in this format:`,
      `BUY-BACK: <buy it back now or wait, and why>`,
      `HOLD/EXPIRE: <let it ride to expiration, or roll — and why>`,
      `OVERALL: <the single most important action now>`,
      ``,
      `This is educational analysis of historical data, not financial advice.`,
    ].join("\n");
  };
  const copyPrompt = async () => { try { await navigator.clipboard.writeText(buildPrompt()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setShowPrompt(true); } };
  const askAI = async () => { if (!series.length) return; setAi({ loading: true, advice: null, error: null }); try { const r = await optionsExitAdvice({ prompt: buildPrompt() }); setAi({ loading: false, advice: r.advice, error: null }); } catch (e) { setAi({ loading: false, advice: null, error: e?.message || "AI request failed." }); } };

  // geometry
  const VBW = 920, VBH = 340, PL = 60, PR = 884, PT = 20, PB = 296;
  const tMin = points.length ? points[0].t : 0, tMax = points.length ? points[points.length - 1].t : 1;
  const cvals = points.map((p) => p.c).concat([K, breakeven].filter((v) => Number.isFinite(v) && v > 0));
  let clo = Math.min(...cvals), chi = Math.max(...cvals);
  if (!Number.isFinite(clo)) { clo = 0; chi = 1; } const cpad = (chi - clo) * 0.08 || 1; clo -= cpad; chi += cpad;
  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (PR - PL);
  const yC = (v) => PB - ((v - clo) / ((chi - clo) || 1)) * (PB - PT);
  const line = points.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yC(p.c).toFixed(1)).join(" ");
  const pvals = series.map((s) => s.total); let plo = Math.min(0, ...pvals), phi = Math.max(0, ...pvals);
  if (!Number.isFinite(phi) || phi === plo) { phi = 1; plo = -1; } const ppad = (phi - plo) * 0.12 || 1; phi += ppad; plo -= ppad;
  const yPL = (v) => PB - ((v - plo) / ((phi - plo) || 1)) * (PB - PT);
  const plLine = series.length > 1 ? series.map((s, i) => (i ? "L" : "M") + xT(s.t).toFixed(1) + " " + yPL(s.total).toFixed(1)).join(" ") : "";
  const cTicks = [0, 1, 2, 3, 4].map((i) => clo + ((chi - clo) * i) / 4);
  const pTicks = [plo, (plo + phi) / 2, phi];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + (tMax - tMin) * f);
  const amber = T.warn || T.warning || "#E6A23C";

  const tFromEvent = (e) => { const rect = svgRef.current?.getBoundingClientRect(); if (!rect?.width) return null; const x = ((e.clientX - rect.left) / rect.width) * VBW; return tMin + (tMax - tMin) * Math.max(0, Math.min(1, (x - PL) / (PR - PL))); };
  const onMove = (e) => { const t = tFromEvent(e); if (t == null) return; const p = nearest(t); if (p) setHoverI(points.indexOf(p)); };
  const onClick = (e) => { const t = tFromEvent(e); if (t == null) return; const p = nearest(t); if (p) setEntryMs(p.t); };
  const hv = hoverI != null ? points[hoverI] : null;
  const hvTotal = hv && entry && hv.t >= entry.t ? (() => { const rem = Math.max(0, DTE - (hv.t - entry.t) / DAY); const mk = callMark(hv.c, rem); return ((prem - mk) * shares) + (S0 > 0 ? (hv.c - S0) * shares : 0); })() : null;

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const font = T.fontMono;
  const pill = (a) => ({ padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const inp = { minHeight: 38, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };

  return (
    <div role="region" aria-label="Covered call projections">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Projections · Covered-call back-test</h2>
        {sym && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{RANGES.map((r) => <button key={r} onClick={() => setRange(r)} style={pill(range === r)}>{r}</button>)}</div>}
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: T.textDim }}>Covered call<br />
            <select value={selId} onChange={(e) => loadPosition(e.target.value)} style={{ ...inp, minWidth: 180 }}>
              <option value="custom">Custom (enter below)</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.sym} ${p.strike} ×{p.contracts || 1}</option>)}
            </select></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Symbol<br /><input value={sym} onChange={(e) => { setSym(e.target.value.toUpperCase()); setSelId("custom"); }} placeholder="PFE" style={{ ...inp, width: 90 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Cost basis<br /><input value={costBasis} onChange={(e) => setCostBasis(e.target.value)} style={{ ...inp, width: 84 }} /></label>
          <label style={{ fontSize: 11, color: T.danger }}>Strike<br /><input value={strike} onChange={(e) => setStrike(e.target.value)} style={{ ...inp, width: 72 }} /></label>
          <label style={{ fontSize: 11, color: T.success }}>Premium<br /><input value={premium} onChange={(e) => setPremium(e.target.value)} style={{ ...inp, width: 72 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>IV %<br /><input value={iv} onChange={(e) => setIv(e.target.value)} style={{ ...inp, width: 60 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>DTE<br /><input value={dte} onChange={(e) => setDte(e.target.value)} style={{ ...inp, width: 60 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Contracts<br /><input value={contracts} onChange={(e) => setContracts(e.target.value)} style={{ ...inp, width: 70 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Entry date<br /><input type="date" value={msToDate(entry?.t)} onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) setEntryMs(ms); }} style={{ ...inp, width: 150 }} /></label>
        </div>

        {/* What the call would have sold for at entry (Black-Scholes estimate) */}
        {sym && entry && estPremSh != null && (
          <div style={{ marginBottom: 12, padding: "10px 13px", borderRadius: 8, border: `1px solid ${T.success}44`, background: `${T.success}10`, fontFamily: font, fontSize: 12.5, color: T.text, lineHeight: 1.7, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              At entry (<b>{fmtDate(entry.t)}</b>, {sym} <b>{px(entry.c)}</b>), a <b style={{ color: T.danger }}>${estK}</b> call · {DTE} DTE · {ivv}% IV would have sold for ≈ <b style={{ color: T.success }}>{px(estPremSh)}/sh</b> → <b style={{ color: T.success }}>{usd(estPremTotal)}</b> for {n} contract{n === 1 ? "" : "s"}.
            </span>
            <span style={{ display: "inline-flex", gap: 6 }}>
              {!(K > 0) && <button onClick={() => setStrike(String(estK))} style={pill(false)}>Use ${estK} strike</button>}
              <button onClick={() => { if (!(K > 0)) setStrike(String(estK)); setPremium(px(estPremSh)); }} style={pill(true)}>Use est. premium</button>
            </span>
          </div>
        )}

        {!sym ? <div style={{ color: T.textDim, fontFamily: font, fontSize: 13 }}>Pick a working covered call, or enter a symbol + strike + premium to back-test.</div> : (
        <div style={{ position: "relative", width: "100%" }}>
          {loading ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {sym}…</div>
          : error ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
          : !points.length ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No data.</div>
          : (
            <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)} onClick={onClick}>
              {cTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yC(v)} x2={PR} y2={yC(v)} stroke={T.border} strokeWidth="1" opacity="0.28" /><text x={PL - 8} y={yC(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text></g>))}
              {xTicks.map((t, i) => <text key={i} x={xT(t)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>{fmtDate(t)}</text>)}
              <path d={line} fill="none" stroke={T.accent} strokeWidth="1.5" opacity="0.85" />
              {K > 0 && K > clo && K < chi && (<><line x1={PL} y1={yC(K)} x2={PR} y2={yC(K)} stroke={T.danger} strokeWidth="1.5" strokeDasharray="5 4" /><text x={PR - 4} y={yC(K) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.danger} fontWeight="700">Strike {K} (assign)</text></>)}
              {breakeven != null && breakeven > clo && breakeven < chi && (<><line x1={PL} y1={yC(breakeven)} x2={PR} y2={yC(breakeven)} stroke={amber} strokeWidth="1.25" strokeDasharray="5 4" /><text x={PR - 4} y={yC(breakeven) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={amber} fontWeight="700">Breakeven {px(breakeven)}</text></>)}
              {plLine && (<>
                {pTicks.map((v, i) => <text key={i} x={PR + 4} y={yPL(v) + 3} textAnchor="start" fontSize="9" fontFamily={font} fill={VIOLET}>{usd(v, true)}</text>)}
                <line x1={entry ? xT(entry.t) : PL} y1={yPL(0)} x2={PR} y2={yPL(0)} stroke={VIOLET} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
                <path d={plLine} fill="none" stroke={VIOLET} strokeWidth="2.25" />
                {bestTotal && bestTotal.total > 0 && (<><circle cx={xT(bestTotal.t)} cy={yPL(bestTotal.total)} r="5" fill={VIOLET} stroke={T.surface} strokeWidth="2" /><text x={xT(bestTotal.t)} y={yPL(bestTotal.total) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={VIOLET}>best exit</text></>)}
              </>)}
              {entry && (<><line x1={xT(entry.t)} y1={PT} x2={xT(entry.t)} y2={PB} stroke={T.text} strokeWidth="1.25" opacity="0.6" /><text x={xT(entry.t)} y={PT + 10} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.text}>entry</text></>)}
              {hv && (<line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />)}
            </svg>
          )}
          {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 8px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap" }}><b style={{ color: T.text }}>{px(hv.c)}</b> · {fmtDate(hv.t)}{hvTotal != null && <div style={{ color: hvTotal >= 0 ? T.success : T.danger, marginTop: 2 }}>CC P&L {usd(hvTotal, true)}</div>}</div>)}
        </div>)}
        <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6 }}>Click the chart to set the entry date. Violet = covered-call P&L (stock move + premium kept, call marked daily with Black-Scholes) over {DTE} DTE. Red = strike (assignment); amber = breakeven.</div>
      </div>

      {sym && entry && last && (
        <div style={card}>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 10 }}>{sym} ${K} call — entered {fmtDate(entry.t)} at {px(entry.c)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Stat T={T} label="Premium collected" value={usd(premiumCollected)} color={T.success} />
            <Stat T={T} label="CC P&L now" value={usd(last.total, true)} color={last.total >= 0 ? T.success : T.danger} />
            <Stat T={T} label="Best buy-back" value={bestBuyback && bestBuyback.premiumKept > 0 ? `${fmtDate(bestBuyback.t)} · ${usd(bestBuyback.premiumKept)}` : "—"} />
            <Stat T={T} label="Best total exit" value={bestTotal && bestTotal.total > 0 ? `${fmtDate(bestTotal.t)} · ${usd(bestTotal.total, true)}` : "—"} color={T.success} />
            <Stat T={T} label="If held to expiry" value={expiryOutcome ? `${expiryOutcome.label} · ${usd(expiryOutcome.pl, true)}` : "—"} color={expiryOutcome && expiryOutcome.pl >= 0 ? T.success : T.danger} />
          </div>

          {/* Ask Claude — covered-call exit advice */}
          <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 8, border: `1px solid ${T.accent}44`, background: T.accentDim }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ color: T.accent, fontFamily: font, fontSize: 12, fontWeight: 700 }}>Ask Claude — buy back, hold, or roll?</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setShowPrompt((s) => !s)} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${T.border}`, cursor: "pointer", background: "transparent", color: T.textDim, fontFamily: font, fontSize: 12, fontWeight: 700 }}>{showPrompt ? "Hide" : "View"}</button>
                <button onClick={copyPrompt} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: font, fontSize: 12, fontWeight: 700 }}>{copied ? "✓ Copied" : "📋 Copy for Pro chat"}</button>
                <button onClick={askAI} disabled={ai.loading} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.accent}`, cursor: ai.loading ? "default" : "pointer", background: T.accent, color: "#0A0A0A", fontFamily: font, fontSize: 12, fontWeight: 700, opacity: ai.loading ? 0.6 : 1 }}>{ai.loading ? "Analyzing…" : ai.advice ? "↻ Re-run via API" : "⚡ Run via API"}</button>
              </div>
            </div>
            {ai.error && <div style={{ color: T.danger, fontFamily: font, fontSize: 11.5, marginTop: 8 }}>{ai.error}</div>}
            {ai.advice && <div style={{ color: T.text, fontFamily: font, fontSize: 12.5, lineHeight: 1.65, marginTop: 8, whiteSpace: "pre-wrap", padding: "10px 12px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}><div style={{ color: T.textDim, fontSize: 10, marginBottom: 4 }}>Claude (API):</div>{ai.advice}</div>}
            {showPrompt && <textarea readOnly value={buildPrompt()} onFocus={(e) => e.target.select()} style={{ width: "100%", boxSizing: "border-box", height: 150, marginTop: 8, padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 11, lineHeight: 1.5, resize: "vertical" }} />}
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
      <div style={{ color: color || T.text, fontSize: 15, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
