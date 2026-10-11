// ─── src/components/OptionsProjectionsTab.jsx ────────────────────────────────
// Options Manager → Projections: model a CALL and a PUT at a chosen strike on a
// US Treasury future (30y ZB, 10y ZN, 5y ZF) and back-test them against history.
// Two breakeven lines cross the price chart — the CALL breakeven (price must
// rise ABOVE to profit) and the PUT breakeven (price must fall BELOW to profit).
// From your entry date forward, each leg's P&L is tracked day-by-day so you can
// see the BEST time to get out of the call vs. the put. A heuristic exit
// suggestion is shown now; true AI (Claude) exit timing is the next step.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";
import { optionsExitAdvice } from "../services/ai";

const TREASURIES = [
  { k: "ZB=F", label: "30-Year Bond (ZB)", mult: 1000 },
  { k: "ZN=F", label: "10-Year Note (ZN)", mult: 1000 },
  { k: "ZF=F", label: "5-Year Note (ZF)", mult: 1000 },
];
const RANGES = ["3M", "6M", "1Y", "2Y"];
const usd = (n, signed) => { const a = Math.abs(n || 0); const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s; return (n < -0.005 ? "−" : "") + s; };
const pxv = (v) => (Number.isFinite(v) ? Number(v).toFixed(3) : "—");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);
const BLUE = "#6366f1";

export default function OptionsProjectionsTab() {
  const { T } = useTheme();
  const [inst, setInst] = useState(TREASURIES[0]);
  const [range, setRange] = useState("1Y");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [strike, setStrike] = useState("");
  const [callPrem, setCallPrem] = useState("");
  const [putPrem, setPutPrem] = useState("");
  const [contracts, setContracts] = useState("1");
  const [callDir, setCallDir] = useState("long");
  const [putDir, setPutDir] = useState("long");
  const [entryMs, setEntryMs] = useState(null);
  const [hoverI, setHoverI] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [ai, setAi] = useState({ loading: false, advice: null, error: null });
  const svgRef = useRef(null);

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setPoints([]);
    getPriceHistory(inst.k, range).then((r) => {
      if (!alive) return;
      const pts = r.points || []; setPoints(pts); setLoading(false);
      if (pts.length > 2) {
        const e = pts[Math.floor(pts.length * 0.25)];
        setEntryMs(e.t);
        const atm = Math.round(e.c * 2) / 2; // nearest 0.5
        setStrike(String(atm));
        const prem = Math.max(0.25, Math.round(e.c * 0.012 * 100) / 100);
        setCallPrem(String(prem)); setPutPrem(String(prem));
      }
    }).catch((e) => { if (alive) { setError(e?.message || "No data."); setLoading(false); } });
    return () => { alive = false; };
  }, [inst, range]);

  const nearest = (ms) => { if (!points.length || !Number.isFinite(ms)) return null; let best = points[0], bd = Infinity; for (const p of points) { const d = Math.abs(p.t - ms); if (d < bd) { bd = d; best = p; } } return best; };
  const entry = useMemo(() => nearest(entryMs), [entryMs, points]);

  const K = Number(strike) || 0, cPrem = Number(callPrem) || 0, pPrem = Number(putPrem) || 0;
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const callLong = callDir === "long", putLong = putDir === "long";
  const callBE = K > 0 ? K + cPrem : null;
  const putBE = K > 0 ? K - pPrem : null;
  // Direction-aware per-leg P&L. Long profits from the move; short profits from decay.
  const callPL = (S) => (callLong ? Math.max(0, S - K) - cPrem : cPrem - Math.max(0, S - K)) * inst.mult * n;
  const putPL = (S) => (putLong ? Math.max(0, K - S) - pPrem : pPrem - Math.max(0, K - S)) * inst.mult * n;

  // Day-by-day leg P&L from entry forward → best exit for each leg.
  const after = useMemo(() => (entry ? points.filter((p) => p.t >= entry.t) : []), [entry, points]);
  const bestCall = useMemo(() => after.reduce((b, p) => (!b || callPL(p.c) > callPL(b.c) ? p : b), null), [after, K, cPrem, inst, n]);
  const bestPut = useMemo(() => after.reduce((b, p) => (!b || putPL(p.c) > putPL(b.c) ? p : b), null), [after, K, pPrem, inst, n]);
  const last = points.length ? points[points.length - 1] : null;

  // Reset the "copied" flag + AI advice when the scenario changes.
  useEffect(() => { setCopied(false); setAi({ loading: false, advice: null, error: null }); }, [inst, range, strike, callPrem, putPrem, contracts, entryMs, callDir, putDir]);

  const aiPayload = () => {
    const step = Math.max(1, Math.ceil(after.length / 70));
    const path = after.filter((_, i) => i % step === 0 || i === after.length - 1).map((p) => ({ d: msToDate(p.t), c: p.c }));
    return { instrument: inst.label, strike: K, callPrem: cPrem, putPrem: pPrem, callDir, putDir, contracts: n, multiplier: inst.mult, callBE, putBE, path };
  };
  const askAI = async () => {
    if (!after.length) return;
    setAi({ loading: true, advice: null, error: null });
    try { const r = await optionsExitAdvice(aiPayload()); setAi({ loading: false, advice: r.advice, error: null }); }
    catch (e) { setAi({ loading: false, advice: null, error: e?.message || "AI request failed." }); }
  };

  // Build a ready-to-paste prompt for Claude.ai (uses your Pro account — no API).
  const buildPrompt = () => {
    if (!after.length || !entry) return "";
    const step = Math.max(1, Math.ceil(after.length / 70));
    const path = after.filter((_, i) => i % step === 0 || i === after.length - 1).map((p) => `${msToDate(p.t)}:${pxv(p.c)}`).join("  ");
    const cForm = callLong ? `max(0, S-${K}) - ${pxv(cPrem)}` : `${pxv(cPrem)} - max(0, S-${K})`;
    const pForm = putLong ? `max(0, ${K}-S) - ${pxv(pPrem)}` : `${pxv(pPrem)} - max(0, ${K}-S)`;
    return [
      `I'm trading options on the ${inst.label}. I ${callLong ? "bought a LONG" : "sold a SHORT"} call and ${putLong ? "bought a LONG" : "sold a SHORT"} put at strike ${K}.`,
      `Call premium: ${pxv(cPrem)} per point. Put premium: ${pxv(pPrem)}. Contracts: ${n}. Point multiplier: $${inst.mult}.`,
      `Call breakeven: ${pxv(callBE)} (${callLong ? "profit ABOVE" : "profit BELOW"}). Put breakeven: ${pxv(putBE)} (${putLong ? "profit BELOW" : "profit ABOVE"}).`,
      `Entered ${msToDate(entry.t)} at ${pxv(entry.c)}; latest ${last ? msToDate(last.t) : "—"} at ${last ? pxv(last.c) : "—"}.`,
      `Daily closes since entry (date:price): ${path}`,
      ``,
      `Per-leg P&L at price S near expiry: call = (${cForm}) * ${inst.mult} * ${n}; put = (${pForm}) * ${inst.mult} * ${n}.`,
      ``,
      `Given this historical path, advise when I should exit each leg. Consider momentum/direction, how far price moved through or away from each breakeven, and premium decay as expiry nears. Answer in this format:`,
      `CALL: <keep or exit, and why>`,
      `PUT: <keep or exit, and why>`,
      `OVERALL: <the single most important action now>`,
      ``,
      `This is educational analysis of historical data, not financial advice.`,
    ].join("\n");
  };

  const copyPrompt = async () => {
    const text = buildPrompt();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setShowPrompt(true); } // clipboard blocked → reveal the text to copy manually
  };

  // chart geometry
  const VBW = 920, VBH = 340, PL = 60, PR = 904, PT = 20, PB = 296;
  const tMin = points.length ? points[0].t : 0, tMax = points.length ? points[points.length - 1].t : 1;
  const vals = points.map((p) => p.c).concat([callBE, putBE, K].filter((v) => Number.isFinite(v) && v > 0));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (PR - PL);
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const line = points.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yP(p.c).toFixed(1)).join(" ");
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + (tMax - tMin) * f);

  // Combined straddle (call + put) P&L over the holding window, on a right axis.
  const combo = after.map((p) => ({ t: p.t, v: callPL(p.c) + putPL(p.c) }));
  const bestCombo = combo.length ? combo.reduce((b, p) => (p.v > b.v ? p : b), combo[0]) : null;
  const comboVals = combo.map((c) => c.v);
  let plHi = Math.max(0, ...comboVals), plLo = Math.min(0, ...comboVals);
  if (!Number.isFinite(plHi) || plHi === plLo) { plHi = 1; plLo = -1; }
  const ppad = (plHi - plLo) * 0.12 || 1; plHi += ppad; plLo -= ppad;
  const yP2 = (v) => { const r = PB - ((v - plLo) / ((plHi - plLo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const comboLine = combo.length > 1 ? combo.map((c, i) => (i ? "L" : "M") + xT(c.t).toFixed(1) + " " + yP2(c.v).toFixed(1)).join(" ") : "";
  const pTicks = [plLo, (plLo + plHi) / 2, plHi];
  const VIOLET = "#A78BFA";
  const comboNow = combo.length ? combo[combo.length - 1].v : null;

  const tFromEvent = (e) => { const rect = svgRef.current?.getBoundingClientRect(); if (!rect?.width) return null; const xUser = ((e.clientX - rect.left) / rect.width) * VBW; const f = Math.max(0, Math.min(1, (xUser - PL) / (PR - PL))); return tMin + (tMax - tMin) * f; };
  const onMove = (e) => { const t = tFromEvent(e); if (t == null) return; const p = nearest(t); if (p) setHoverI(points.indexOf(p)); };
  const onClick = (e) => { const t = tFromEvent(e); if (t == null) return; const p = nearest(t); if (p) setEntryMs(p.t); };

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const pill = (a) => ({ padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const selStyle = { minHeight: 40, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };
  const numStyle = { width: 84, minHeight: 36, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 13 };
  const hv = hoverI != null ? points[hoverI] : null;
  const amber = T.warn || T.warning || "#E6A23C";

  return (
    <div role="region" aria-label="Projections">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Projections · Call / Put strike back-test</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{RANGES.map((r) => <button key={r} onClick={() => setRange(r)} style={pill(range === r)}>{r}</button>)}</div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: T.textDim }}>Instrument<br />
            <select value={inst.k} onChange={(e) => setInst(TREASURIES.find((x) => x.k === e.target.value))} style={selStyle}>{TREASURIES.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Strike<br /><input value={strike} onChange={(e) => setStrike(e.target.value)} style={numStyle} /></label>
          <label style={{ fontSize: 11, color: T.success }}>Call<br />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={callPrem} onChange={(e) => setCallPrem(e.target.value)} style={{ ...numStyle, width: 64 }} />
              <div style={{ display: "flex", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: 2, gap: 2 }}>{["long", "short"].map((d) => <button key={d} onClick={() => setCallDir(d)} style={{ padding: "4px 8px", borderRadius: 5, border: "none", cursor: "pointer", background: callDir === d ? T.success : "transparent", color: callDir === d ? "#0A0A0A" : T.textDim, fontFamily: font, fontSize: 10, fontWeight: 700 }}>{d}</button>)}</div>
            </div></label>
          <label style={{ fontSize: 11, color: BLUE }}>Put<br />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={putPrem} onChange={(e) => setPutPrem(e.target.value)} style={{ ...numStyle, width: 64 }} />
              <div style={{ display: "flex", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: 2, gap: 2 }}>{["long", "short"].map((d) => <button key={d} onClick={() => setPutDir(d)} style={{ padding: "4px 8px", borderRadius: 5, border: "none", cursor: "pointer", background: putDir === d ? BLUE : "transparent", color: putDir === d ? "#fff" : T.textDim, fontFamily: font, fontSize: 10, fontWeight: 700 }}>{d}</button>)}</div>
            </div></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Contracts<br /><input value={contracts} onChange={(e) => setContracts(e.target.value)} style={{ ...numStyle, width: 70 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>Entry date<br /><input type="date" value={msToDate(entry?.t)} onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) setEntryMs(ms); }} style={{ ...numStyle, width: 150 }} /></label>
        </div>

        {/* legend */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontFamily: font, fontSize: 11, color: T.textDim }}>
          <span><span style={{ display: "inline-block", width: 14, height: 2, background: T.accent, verticalAlign: "middle", marginRight: 5 }} />price</span>
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${T.success}`, verticalAlign: "middle", marginRight: 5 }} />{callLong ? "long" : "short"} call BE {callBE != null ? pxv(callBE) : ""} (profit {callLong ? "above" : "below"})</span>
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${BLUE}`, verticalAlign: "middle", marginRight: 5 }} />{putLong ? "long" : "short"} put BE {putBE != null ? pxv(putBE) : ""} (profit {putLong ? "below" : "above"})</span>
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${T.danger}`, verticalAlign: "middle", marginRight: 5 }} />strike {K || ""}</span>
          <span><span style={{ display: "inline-block", width: 14, height: 2, background: "#A78BFA", verticalAlign: "middle", marginRight: 5 }} />combined call+put P&L (right axis)</span>
        </div>

        <div style={{ position: "relative", width: "100%" }}>
          {loading ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {inst.label}…</div>
          : error ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
          : !points.length ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No data.</div>
          : (
            <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)} onClick={onClick}>
              {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text></g>))}
              {xTicks.map((t, i) => <text key={i} x={xT(t)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>{fmtDate(t)}</text>)}

              {/* profit-zone shading (direction-aware: long call profits above BE, short below) */}
              {callBE != null && callBE > lo && callBE < hi && (callLong
                ? <rect x={PL} y={PT} width={PR - PL} height={Math.max(0, yP(callBE) - PT)} fill={T.success} opacity="0.06" />
                : <rect x={PL} y={yP(callBE)} width={PR - PL} height={Math.max(0, PB - yP(callBE))} fill={T.success} opacity="0.06" />)}
              {putBE != null && putBE > lo && putBE < hi && (putLong
                ? <rect x={PL} y={yP(putBE)} width={PR - PL} height={Math.max(0, PB - yP(putBE))} fill={BLUE} opacity="0.06" />
                : <rect x={PL} y={PT} width={PR - PL} height={Math.max(0, yP(putBE) - PT)} fill={BLUE} opacity="0.06" />)}

              <path d={line} fill="none" stroke={T.accent} strokeWidth="1.75" strokeLinejoin="round" />

              {/* strike + breakeven lines */}
              {K > 0 && K > lo && K < hi && (<><line x1={PL} y1={yP(K)} x2={PR} y2={yP(K)} stroke={T.danger} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" /><text x={PR - 4} y={yP(K) - 3} textAnchor="end" fontSize="9" fontFamily={font} fill={T.danger}>strike {K}</text></>)}
              {callBE != null && callBE > lo && callBE < hi && (<><line x1={PL} y1={yP(callBE)} x2={PR} y2={yP(callBE)} stroke={T.success} strokeWidth="1.5" strokeDasharray="5 4" /><text x={PR - 4} y={yP(callBE) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.success} fontWeight="700">Call BE {pxv(callBE)}</text></>)}
              {putBE != null && putBE > lo && putBE < hi && (<><line x1={PL} y1={yP(putBE)} x2={PR} y2={yP(putBE)} stroke={BLUE} strokeWidth="1.5" strokeDasharray="5 4" /><text x={PR - 4} y={yP(putBE) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={BLUE} fontWeight="700">Put BE {pxv(putBE)}</text></>)}

              {/* combined straddle P&L (right axis) over the holding window */}
              {comboLine && (<>
                <line x1={PR} y1={yP2(0)} x2={entry ? xT(entry.t) : PL} y2={yP2(0)} stroke={VIOLET} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
                {pTicks.map((v, i) => <text key={i} x={PR + 4} y={yP2(v) + 3} textAnchor="start" fontSize="9" fontFamily={font} fill={VIOLET}>{usd(v, true)}</text>)}
                <path d={comboLine} fill="none" stroke={VIOLET} strokeWidth="2" opacity="0.9" />
                {bestCombo && bestCombo.v > 0 && <circle cx={xT(bestCombo.t)} cy={yP2(bestCombo.v)} r="4.5" fill={VIOLET} stroke={T.surface} strokeWidth="2" />}
              </>)}

              {/* entry */}
              {entry && (<><line x1={xT(entry.t)} y1={PT} x2={xT(entry.t)} y2={PB} stroke={T.text} strokeWidth="1.25" opacity="0.6" /><circle cx={xT(entry.t)} cy={yP(entry.c)} r="5" fill={T.text} stroke={T.surface} strokeWidth="2" /><text x={xT(entry.t)} y={yP(entry.c) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={T.text}>entry {pxv(entry.c)}</text></>)}
              {/* best exits */}
              {bestCall && callPL(bestCall.c) > 0 && (<><circle cx={xT(bestCall.t)} cy={yP(bestCall.c)} r="5" fill={T.success} stroke={T.surface} strokeWidth="2" /><text x={xT(bestCall.t)} y={yP(bestCall.c) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={T.success}>best call exit</text></>)}
              {bestPut && putPL(bestPut.c) > 0 && (<><circle cx={xT(bestPut.t)} cy={yP(bestPut.c)} r="5" fill={BLUE} stroke={T.surface} strokeWidth="2" /><text x={xT(bestPut.t)} y={yP(bestPut.c) + 16} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={BLUE}>best put exit</text></>)}

              {hv && (<g><line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" /><circle cx={xT(hv.t)} cy={yP(hv.c)} r="3" fill={T.accent} /></g>)}
            </svg>
          )}
          {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 8px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap" }}><b style={{ color: T.text }}>{pxv(hv.c)}</b> · <span style={{ color: T.textDim }}>{fmtDate(hv.t)}</span>{entry && hv.t >= entry.t && <div style={{ marginTop: 2 }}><span style={{ color: T.success }}>call {usd(callPL(hv.c), true)}</span> · <span style={{ color: BLUE }}>put {usd(putPL(hv.c), true)}</span></div>}</div>)}
        </div>
        <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6 }}>Click the chart to set your entry date. Green zone = above the call breakeven (call profits); blue zone = below the put breakeven (put profits).</div>
      </div>

      {/* leg results + exit timing */}
      {entry && last && (
        <div style={{ ...card }}>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 10 }}>If you entered {fmtDate(entry.t)} at {pxv(entry.c)} · {inst.k}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <LegCard T={T} color={T.success} title={`${callLong ? "Long" : "Short"} call $${K}`} prem={cPrem} be={callBE} nowPL={callPL(last.c)} best={bestCall} bestPL={bestCall ? callPL(bestCall.c) : null} entryT={entry.t} />
            <LegCard T={T} color={BLUE} title={`${putLong ? "Long" : "Short"} put $${K}`} prem={pPrem} be={putBE} nowPL={putPL(last.c)} best={bestPut} bestPL={bestPut ? putPL(bestPut.c) : null} entryT={entry.t} />
            <div style={{ border: `1px solid #A78BFA55`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ color: "#A78BFA", fontFamily: font, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Combined (call + put)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontFamily: font, fontSize: 12 }}>
                <span style={{ color: T.textDim }}>P&L now</span><span style={{ textAlign: "right", color: comboNow == null ? T.text : comboNow >= 0 ? T.success : T.danger, fontWeight: 700 }}>{comboNow == null ? "—" : usd(comboNow, true)}</span>
                <span style={{ color: T.textDim }}>Best exit</span><span style={{ textAlign: "right", color: T.text }}>{bestCombo && bestCombo.v > 0 ? fmtDate(bestCombo.t) : "—"}</span>
                <span style={{ color: T.textDim }}>Best P&L</span><span style={{ textAlign: "right", color: bestCombo && bestCombo.v > 0 ? T.success : T.textDim, fontWeight: 700 }}>{bestCombo && bestCombo.v > 0 ? usd(bestCombo.v, true) : "—"}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 8, border: `1px solid ${amber}44`, background: `${amber}12` }}>
            <div style={{ color: amber, fontFamily: font, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Exit suggestion (heuristic)</div>
            <div style={{ color: T.text, fontFamily: font, fontSize: 12, lineHeight: 1.6 }}>{exitHeuristic({ inst, entry, bestCall, bestPut, callPL, putPL, cPrem, pPrem, K })}</div>
          </div>

          {/* Ask Claude (your Pro account) — copy a ready-made prompt, no API */}
          <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 8, border: `1px solid ${T.accent}44`, background: T.accentDim }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ color: T.accent, fontFamily: font, fontSize: 12, fontWeight: 700 }}>Ask Claude for exit timing</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setShowPrompt((s) => !s)} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${T.border}`, cursor: "pointer", background: "transparent", color: T.textDim, fontFamily: font, fontSize: 12, fontWeight: 700 }}>{showPrompt ? "Hide" : "View"}</button>
                <button onClick={copyPrompt} disabled={!after.length} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: font, fontSize: 12, fontWeight: 700 }}>{copied ? "✓ Copied" : "📋 Copy for Pro chat"}</button>
                <button onClick={askAI} disabled={ai.loading || !after.length} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.accent}`, cursor: ai.loading ? "default" : "pointer", background: T.accent, color: "#0A0A0A", fontFamily: font, fontSize: 12, fontWeight: 700, opacity: ai.loading ? 0.6 : 1 }}>{ai.loading ? "Analyzing…" : ai.advice ? "↻ Re-run via API" : "⚡ Run via API"}</button>
              </div>
            </div>
            <div style={{ color: T.textMuted || T.textDim, fontFamily: font, fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }}>
              <b>Copy for Pro chat</b>: paste into claude.ai (your Pro account — free). <b>Run via API</b>: get the answer inline here (uses the Anthropic API key — small per-click cost). Compare the two.
            </div>
            {ai.error && <div style={{ color: T.danger, fontFamily: font, fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>{ai.error}</div>}
            {ai.advice && <div style={{ color: T.text, fontFamily: font, fontSize: 12.5, lineHeight: 1.65, marginTop: 8, whiteSpace: "pre-wrap", padding: "10px 12px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 8 }}><div style={{ color: T.textDim, fontSize: 10, marginBottom: 4 }}>Claude (API):</div>{ai.advice}</div>}
            {showPrompt && <textarea readOnly value={buildPrompt()} onFocus={(e) => e.target.select()} style={{ width: "100%", boxSizing: "border-box", height: 150, marginTop: 8, padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 11, lineHeight: 1.5, resize: "vertical" }} />}
          </div>
        </div>
      )}
    </div>
  );
}

function exitHeuristic({ entry, bestCall, bestPut, callPL, putPL }) {
  const bc = bestCall ? callPL(bestCall.c) : -Infinity;
  const bp = bestPut ? putPL(bestPut.c) : -Infinity;
  if (bc <= 0 && bp <= 0) return "Neither leg reached profit over this window — the price stayed between the two breakevens (the dead zone). A straddle here would have needed a bigger move; consider a closer strike or waiting for higher volatility.";
  const parts = [];
  if (bc > 0 && bestCall) parts.push(`The call would have been best to close around ${fmtDate(bestCall.t)} at ${pxv(bestCall.c)} (≈${usd(bc, true)}) — after that the pullback gave profit back.`);
  if (bp > 0 && bestPut) parts.push(`The put's best exit was around ${fmtDate(bestPut.t)} at ${pxv(bestPut.c)} (≈${usd(bp, true)}).`);
  parts.push("Rule of thumb: take profit once a leg is well past its breakeven and momentum stalls; cut the other leg if it's decaying toward zero.");
  return parts.join(" ");
}

function LegCard({ T, color, title, prem, be, nowPL, best, bestPL, entryT }) {
  const font = T.fontMono;
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ color, fontFamily: font, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title} <span style={{ color: T.textDim, fontWeight: 400 }}>@ {pxv(prem)} prem</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontFamily: font, fontSize: 12 }}>
        <span style={{ color: T.textDim }}>Breakeven</span><span style={{ textAlign: "right", color: T.text }}>{be != null ? pxv(be) : "—"}</span>
        <span style={{ color: T.textDim }}>P&L now</span><span style={{ textAlign: "right", color: nowPL >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(nowPL, true)}</span>
        <span style={{ color: T.textDim }}>Best exit</span><span style={{ textAlign: "right", color: T.text }}>{best && bestPL > 0 ? `${fmtDate(best.t)}` : "—"}</span>
        <span style={{ color: T.textDim }}>Best P&L</span><span style={{ textAlign: "right", color: bestPL > 0 ? T.success : T.textDim, fontWeight: 700 }}>{bestPL != null && bestPL > 0 ? usd(bestPL, true) : "—"}</span>
      </div>
    </div>
  );
}
