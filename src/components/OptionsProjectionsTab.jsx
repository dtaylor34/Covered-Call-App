// ─── src/components/OptionsProjectionsTab.jsx ────────────────────────────────
// Options Manager → Projections: model a CALL and a PUT at a chosen strike on ANY
// symbol (stocks like OKLO/META/GOOGL/PFE, ETFs, or Treasury futures) and back-test
// them against history. Two breakeven lines cross the price chart — the CALL
// breakeven (price must rise ABOVE to profit) and the PUT breakeven (price must
// fall BELOW to profit). Each leg is valued two ways: live Black-Scholes
// mark-to-market (time value included) AND intrinsic value. From your entry date
// forward, P&L is tracked day-by-day so you can see the BEST time to exit; past
// the last close the chart projects the price to expiration (flat / ±1σ). A
// standard strike ladder around the selected day gives strike context.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";
import { optionsExitAdvice } from "../services/ai";
import { callVal, putVal, strikeStep } from "../lib/coveredCallMath";
import { SYMBOL_GROUPS } from "../data/optionsSymbols";
import OptionChain from "./OptionChain";

const RANGES = ["3M", "6M", "1Y", "2Y"];
const DAY = 86400000;
const QUICK = ["OKLO", "META", "GOOGL", "PFE", "ZB=F"]; // one-tap symbols
const usd = (n, signed) => { const a = Math.abs(n || 0); const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s; return (n < -0.005 ? "−" : "") + s; };
const pxv = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : "—");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);
const BLUE = "#6366f1", VIOLET = "#A78BFA";

// Futures (Yahoo "=F") trade $1000/point for the Treasuries here; everything else
// (stocks/ETFs/indices) is a standard 100-share option contract.
const isFut = (s) => /=F$/.test(String(s || ""));
const multOf = (s) => (isFut(s) ? 1000 : 100);
const unitOf = (s) => (isFut(s) ? "point" : "share");
const labelOf = (s) => { for (const g of SYMBOL_GROUPS) { const hit = g.items.find(([k]) => k === s); if (hit) return hit[1]; } return s; };

export default function OptionsProjectionsTab() {
  const { T } = useTheme();
  const [symbol, setSymbol] = useState("PFE");
  const [symInput, setSymInput] = useState("");
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
  const [expInput, setExpInput] = useState("");   // expiration date (yyyy-mm-dd)
  const [ivPct, setIvPct] = useState("25");       // implied volatility %
  const [hoverI, setHoverI] = useState(null);
  const [pickedSide, setPickedSide] = useState("put"); // last strike side picked from the live chain
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [ai, setAi] = useState({ loading: false, advice: null, error: null });
  const svgRef = useRef(null);

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setPoints([]);
    getPriceHistory(symbol, range).then((r) => {
      if (!alive) return;
      const pts = r.points || []; setPoints(pts); setLoading(false);
      if (pts.length > 2) {
        const e = pts[Math.floor(pts.length * 0.75)];      // default entry ~recent quarter
        setEntryMs(e.t);
        const step = strikeStep(e.c);
        const atm = Math.round(e.c / step) * step;          // nearest standard strike
        setStrike(String(+atm.toFixed(2)));
        const last = pts[pts.length - 1];
        const prem = Math.max(0.05, Math.round(last.c * 0.03 * 100) / 100); // ~3% as a starting premium
        setCallPrem(String(prem)); setPutPrem(String(prem));
        setExpInput(msToDate(last.t + 30 * DAY));            // default expiration 30 days out
      }
    }).catch((e) => { if (alive) { setError(e?.message || "No data."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, range]);

  const nearest = (ms) => { if (!points.length || !Number.isFinite(ms)) return null; let best = points[0], bd = Infinity; for (const p of points) { const d = Math.abs(p.t - ms); if (d < bd) { bd = d; best = p; } } return best; };
  const entry = useMemo(() => nearest(entryMs), [entryMs, points]);
  const last = points.length ? points[points.length - 1] : null;

  const mult = multOf(symbol), unit = unitOf(symbol);
  const K = Number(strike) || 0, cPrem = Number(callPrem) || 0, pPrem = Number(putPrem) || 0;
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const callLong = callDir === "long", putLong = putDir === "long";
  const ivFrac = Math.max(0.01, (Number(ivPct) || 25) / 100);
  const lastT = last ? last.t : Date.now();
  const expMs = dateToMs(expInput) || (lastT + 30 * DAY);
  const callBE = K > 0 ? K + cPrem : null;
  const putBE = K > 0 ? K - pPrem : null;
  const daysLeftAt = (t) => Math.max(0, (expMs - t) / DAY);

  // Two valuations per leg: "bs" = Black-Scholes mark-to-market (time value kept),
  // "intr" = intrinsic only. BS collapses to intrinsic at expiry (days→0).
  const callValueAt = (S, t, model) => (model === "intr" ? Math.max(0, S - K) : callVal(S, K, daysLeftAt(t), ivFrac));
  const putValueAt = (S, t, model) => (model === "intr" ? Math.max(0, K - S) : putVal(S, K, daysLeftAt(t), ivFrac));
  // Direction-aware per-leg P&L at price S on date t. Long profits from value gained
  // over premium paid; short profits from premium kept over value owed.
  const callPLat = (S, t, model = "bs") => (callLong ? callValueAt(S, t, model) - cPrem : cPrem - callValueAt(S, t, model)) * mult * n;
  const putPLat = (S, t, model = "bs") => (putLong ? putValueAt(S, t, model) - pPrem : pPrem - putValueAt(S, t, model)) * mult * n;

  // Day-by-day leg P&L from entry forward → best exit for each leg (BS basis).
  const after = useMemo(() => (entry ? points.filter((p) => p.t >= entry.t) : []), [entry, points]);
  const bestCall = useMemo(() => after.reduce((b, p) => (!b || callPLat(p.c, p.t) > callPLat(b.c, b.t) ? p : b), null), [after, K, cPrem, mult, n, callLong, ivFrac, expMs]);
  const bestPut = useMemo(() => after.reduce((b, p) => (!b || putPLat(p.c, p.t) > putPLat(b.c, b.t) ? p : b), null), [after, K, pPrem, mult, n, putLong, ivFrac, expMs]);

  // Standard strike ladder around the selected (entry) day's price — realistic
  // strike levels (premiums are modeled, not real historical quotes).
  const ladder = useMemo(() => {
    if (!entry) return [];
    const step = strikeStep(entry.c);
    const atm = Math.round(entry.c / step) * step;
    const out = [];
    for (let i = -3; i <= 3; i++) { const s = +(atm + i * step).toFixed(2); if (s > 0) out.push(s); }
    return out;
  }, [entry]);

  // Reset the "copied" flag + AI advice when the scenario changes.
  useEffect(() => { setCopied(false); setAi({ loading: false, advice: null, error: null }); }, [symbol, range, strike, callPrem, putPrem, contracts, entryMs, callDir, putDir, expInput, ivPct]);

  const aiPayload = () => {
    const step = Math.max(1, Math.ceil(after.length / 70));
    const path = after.filter((_, i) => i % step === 0 || i === after.length - 1).map((p) => ({ d: msToDate(p.t), c: p.c }));
    return { instrument: labelOf(symbol), symbol, strike: K, callPrem: cPrem, putPrem: pPrem, callDir, putDir, contracts: n, multiplier: mult, iv: ivFrac, expiration: msToDate(expMs), callBE, putBE, path };
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
      `I'm trading options on ${labelOf(symbol)} (${symbol}). I ${callLong ? "bought a LONG" : "sold a SHORT"} call and ${putLong ? "bought a LONG" : "sold a SHORT"} put at strike ${K}, expiring ${msToDate(expMs)}, assumed IV ${(ivFrac * 100).toFixed(0)}%.`,
      `Call premium: ${pxv(cPrem)} per ${unit}. Put premium: ${pxv(pPrem)}. Contracts: ${n}. Contract multiplier: $${mult}.`,
      `Call breakeven: ${pxv(callBE)} (${callLong ? "profit ABOVE" : "profit BELOW"}). Put breakeven: ${pxv(putBE)} (${putLong ? "profit BELOW" : "profit ABOVE"}).`,
      `Entered ${msToDate(entry.t)} at ${pxv(entry.c)}; latest ${last ? msToDate(last.t) : "—"} at ${last ? pxv(last.c) : "—"}.`,
      `Daily closes since entry (date:price): ${path}`,
      ``,
      `Per-leg intrinsic P&L at price S: call = (${cForm}) * ${mult} * ${n}; put = (${pForm}) * ${mult} * ${n}. (Before expiry, add Black-Scholes time value.)`,
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

  const loadSymbol = (s) => { const v = String(s || "").trim().toUpperCase(); if (v) { setSymbol(v); setSymInput(""); } };

  // Click a real strike's bid in the live chain → load that strike + premium + the
  // real expiration into the scenario, so the estimate runs on actual market numbers.
  const pickStrike = (strikeVal, price, expKey, side) => {
    setStrike(String(strikeVal));
    if (side === "call") setCallPrem(String(price)); else setPutPrem(String(price));
    if (/^\d{4}-\d{2}-\d{2}$/.test(expKey || "")) setExpInput(expKey);
    setPickedSide(side);
  };

  // chart geometry
  const VBW = 920, VBH = 340, PL = 60, PR = 904, PT = 20, PB = 296;
  const tMin = points.length ? points[0].t : 0;
  const tMax = points.length ? Math.max(points[points.length - 1].t, expMs) : 1;

  // Forward price scenarios from the last close to expiration: flat and ±1σ, where
  // σ scales with IV over the remaining time.
  const daysToExp = daysLeftAt(lastT);
  const sigma = last && ivFrac > 0 ? last.c * ivFrac * Math.sqrt(daysToExp / 365) : 0;
  const scenarios = (last && expMs > lastT) ? [
    { k: "up", s: last.c + sigma, color: T.success, label: "+1σ" },
    { k: "flat", s: last.c, color: T.textDim, label: "flat" },
    { k: "down", s: Math.max(0, last.c - sigma), color: T.danger, label: "−1σ" },
  ] : [];

  const vals = points.map((p) => p.c)
    .concat([callBE, putBE, K].filter((v) => Number.isFinite(v) && v > 0))
    .concat(ladder)
    .concat(scenarios.map((x) => x.s));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const xT = (t) => PL + ((t - tMin) / ((tMax - tMin) || 1)) * (PR - PL);
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const line = points.map((p, i) => (i ? "L" : "M") + xT(p.t).toFixed(1) + " " + yP(p.c).toFixed(1)).join(" ");
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + (tMax - tMin) * f);

  // Combined straddle (call + put) P&L over the holding window, on a right axis (BS).
  const combo = after.map((p) => ({ t: p.t, v: callPLat(p.c, p.t) + putPLat(p.c, p.t) }));
  const bestCombo = combo.length ? combo.reduce((b, p) => (p.v > b.v ? p : b), combo[0]) : null;
  const comboVals = combo.map((c) => c.v);
  let plHi = Math.max(0, ...comboVals), plLo = Math.min(0, ...comboVals);
  if (!Number.isFinite(plHi) || plHi === plLo) { plHi = 1; plLo = -1; }
  const ppad = (plHi - plLo) * 0.12 || 1; plHi += ppad; plLo -= ppad;
  const yP2 = (v) => { const r = PB - ((v - plLo) / ((plHi - plLo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const comboLine = combo.length > 1 ? combo.map((c, i) => (i ? "L" : "M") + xT(c.t).toFixed(1) + " " + yP2(c.v).toFixed(1)).join(" ") : "";
  const pTicks = [plLo, (plLo + plHi) / 2, plHi];
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

  // "Worth today" figures for the leg cards + scenario banner.
  const putNowBS = last ? putValueAt(last.c, last.t, "bs") : null;
  const putNowIntr = last ? putValueAt(last.c, last.t, "intr") : null;
  const callNowBS = last ? callValueAt(last.c, last.t, "bs") : null;
  const callNowIntr = last ? callValueAt(last.c, last.t, "intr") : null;

  // ── Position summary: cost, risk/reward, time decay, and a $-move table ──────
  const Snow = last ? last.c : null;
  // Net cash: debit (you paid) if long legs outweigh short; credit if the reverse.
  const netDebit = ((callLong ? cPrem : -cPrem) + (putLong ? pPrem : -pPrem)) * mult * n;
  // Per-leg economics. Max loss/gain are per-leg so mixed positions stay correct.
  const legEcon = (long, prem, kind) => {
    const cost = prem * mult * n;
    const be = kind === "call" ? K + prem : K - prem;
    const moveToBE = Snow ? ((be - Snow) / Snow) * 100 : null;
    const toZero = K * mult * n; // put value if the stock went to 0
    let maxLoss, maxGain;
    if (kind === "call") { maxLoss = long ? cost : Infinity; maxGain = long ? Infinity : cost; }
    else { maxLoss = long ? cost : toZero - cost; maxGain = long ? toZero - cost : cost; }
    return { cost, be, moveToBE, maxLoss, maxGain };
  };
  const callEcon = legEcon(callLong, cPrem, "call");
  const putEcon = legEcon(putLong, pPrem, "put");
  // Time decay today: value lost per day (one fewer day to expiry), signed by position.
  const thetaLeg = (valueAt, long) => {
    if (!Snow || daysLeftAt(lastT) <= 0.5) return 0;
    const drop = valueAt(Snow, lastT, "bs") - valueAt(Snow, lastT + DAY, "bs"); // value lost/day
    return (long ? -1 : 1) * drop * mult * n; // long loses it, short gains it
  };
  const totalTheta = (last ? thetaLeg(callValueAt, callLong) + thetaLeg(putValueAt, putLong) : 0);
  // "If the stock moved $X today" — value & P&L at today's days-left (isolates the move).
  const moveRows = Snow ? [-5, -2, 0, 2, 5].map((d) => {
    const S2 = Math.max(0, Snow + d);
    return { d, S2, putWorth: putValueAt(S2, lastT, "bs"), putPL: putPLat(S2, lastT, "bs"), callPL: callPLat(S2, lastT, "bs"), total: putPLat(S2, lastT, "bs") + callPLat(S2, lastT, "bs") };
  }) : [];
  const moneyInf = (v) => (v === Infinity ? "Unlimited" : usd(v));
  const moveNeed = (pct) => (pct == null ? "—" : `${Math.abs(pct).toFixed(1)}% ${pct < 0 ? "drop" : "rise"}`);

  return (
    <div role="region" aria-label="Projections">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Projections · Call / Put back-test</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{RANGES.map((r) => <button key={r} onClick={() => setRange(r)} style={pill(range === r)}>{r}</button>)}</div>
      </div>

      <div style={card}>
        {/* symbol row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: T.textDim }}>Symbol<br />
            <select value={SYMBOL_GROUPS.some((g) => g.items.some(([k]) => k === symbol)) ? symbol : ""} onChange={(e) => e.target.value && loadSymbol(e.target.value)} style={{ ...selStyle, maxWidth: 230 }}>
              <option value="">{symbol} (current)</option>
              {SYMBOL_GROUPS.map((g) => (<optgroup key={g.group} label={g.group}>{g.items.map(([s, name]) => <option key={s} value={s}>{s} — {name}</option>)}</optgroup>))}
            </select></label>
          <label style={{ fontSize: 11, color: T.textDim }}>or type any<br />
            <input value={symInput} onChange={(e) => setSymInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") loadSymbol(symInput); }} placeholder="e.g. OKLO" style={{ ...numStyle, width: 120 }} /></label>
          <button onClick={() => loadSymbol(symInput)} style={{ ...pill(false), minHeight: 36 }}>Load</button>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            {QUICK.map((s) => <button key={s} onClick={() => loadSymbol(s)} style={pill(symbol === s)}>{s}</button>)}
          </div>
          <span style={{ color: T.textDim, fontFamily: font, fontSize: 11, marginLeft: "auto" }}>{labelOf(symbol)} · {unit} ×{mult}/contract</span>
        </div>

        {/* scenario row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
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
          <label style={{ fontSize: 11, color: T.textDim }}>Expiration<br /><input type="date" value={expInput} onChange={(e) => setExpInput(e.target.value)} style={{ ...numStyle, width: 150 }} /></label>
          <label style={{ fontSize: 11, color: T.textDim }}>IV %<br /><input value={ivPct} onChange={(e) => setIvPct(e.target.value)} style={{ ...numStyle, width: 64 }} /></label>
        </div>

        {/* legend */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontFamily: font, fontSize: 11, color: T.textDim }}>
          <span><span style={{ display: "inline-block", width: 14, height: 2, background: T.accent, verticalAlign: "middle", marginRight: 5 }} />price</span>
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${T.success}`, verticalAlign: "middle", marginRight: 5 }} />{callLong ? "long" : "short"} call BE {callBE != null ? pxv(callBE) : ""} (profit {callLong ? "above" : "below"})</span>
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${BLUE}`, verticalAlign: "middle", marginRight: 5 }} />{putLong ? "long" : "short"} put BE {putBE != null ? pxv(putBE) : ""} (profit {putLong ? "below" : "above"})</span>
          <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dotted ${T.textDim}`, verticalAlign: "middle", marginRight: 5 }} />strike ladder</span>
          <span><span style={{ display: "inline-block", width: 14, height: 2, background: VIOLET, verticalAlign: "middle", marginRight: 5 }} />combined P&L (right axis)</span>
        </div>

        <div style={{ position: "relative", width: "100%" }}>
          {loading ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol}…</div>
          : error ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
          : !points.length ? <div style={{ height: 296, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No data for {symbol}.</div>
          : (
            <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)} onClick={onClick}>
              {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.3" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text></g>))}
              {xTicks.map((t, i) => <text key={i} x={xT(t)} y={VBH - 6} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>{fmtDate(t)}</text>)}

              {/* projection zone (last close → expiration) */}
              {expMs > lastT && (<>
                <rect x={xT(lastT)} y={PT} width={Math.max(0, xT(expMs) - xT(lastT))} height={PB - PT} fill={T.accent} opacity="0.04" />
                <text x={(xT(lastT) + xT(expMs)) / 2} y={PT + 11} textAnchor="middle" fontSize="9" fontFamily={font} fill={T.textDim}>projection → exp {fmtDate(expMs)}</text>
              </>)}

              {/* profit-zone shading (direction-aware) */}
              {callBE != null && callBE > lo && callBE < hi && (callLong
                ? <rect x={PL} y={PT} width={PR - PL} height={Math.max(0, yP(callBE) - PT)} fill={T.success} opacity="0.05" />
                : <rect x={PL} y={yP(callBE)} width={PR - PL} height={Math.max(0, PB - yP(callBE))} fill={T.success} opacity="0.05" />)}
              {putBE != null && putBE > lo && putBE < hi && (putLong
                ? <rect x={PL} y={yP(putBE)} width={PR - PL} height={Math.max(0, PB - yP(putBE))} fill={BLUE} opacity="0.05" />
                : <rect x={PL} y={PT} width={PR - PL} height={Math.max(0, yP(putBE) - PT)} fill={BLUE} opacity="0.05" />)}

              {/* strike ladder around the selected day (click a line to set the strike) */}
              {ladder.map((s) => (s > lo && s < hi) && (
                <g key={s} onClick={(e) => { e.stopPropagation(); setStrike(String(s)); }} style={{ cursor: "pointer" }}>
                  <line x1={PL} y1={yP(s)} x2={PR} y2={yP(s)} stroke={s === K ? T.danger : T.textDim} strokeWidth={s === K ? 1 : 0.75} strokeDasharray="1 4" opacity={s === K ? 0.5 : 0.22} />
                  <text x={PL + 3} y={yP(s) - 2} fontSize="8" fontFamily={font} fill={T.textDim} opacity="0.75">{s}</text>
                </g>
              ))}

              <path d={line} fill="none" stroke={T.accent} strokeWidth="1.75" strokeLinejoin="round" />

              {/* forward price scenarios: flat / ±1σ from the last close to expiry */}
              {scenarios.map((sc) => (
                <g key={sc.k}>
                  <line x1={xT(lastT)} y1={yP(last.c)} x2={xT(expMs)} y2={yP(sc.s)} stroke={sc.color} strokeWidth="1.25" strokeDasharray="4 4" opacity="0.7" />
                  <circle cx={xT(expMs)} cy={yP(sc.s)} r="2.5" fill={sc.color} />
                  <text x={xT(expMs) - 3} y={yP(sc.s) + (sc.k === "down" ? 10 : sc.k === "up" ? -4 : -4)} textAnchor="end" fontSize="8.5" fontFamily={font} fill={sc.color} fontWeight="700">{sc.label} {pxv(sc.s)}</text>
                </g>
              ))}

              {/* breakeven lines */}
              {callBE != null && callBE > lo && callBE < hi && (<><line x1={PL} y1={yP(callBE)} x2={PR} y2={yP(callBE)} stroke={T.success} strokeWidth="1.5" strokeDasharray="5 4" /><text x={PR - 4} y={yP(callBE) - 4} textAnchor="end" fontSize="10" fontFamily={font} fill={T.success} fontWeight="700">Call BE {pxv(callBE)}</text></>)}
              {putBE != null && putBE > lo && putBE < hi && (<><line x1={PL} y1={yP(putBE)} x2={PR} y2={yP(putBE)} stroke={BLUE} strokeWidth="1.5" strokeDasharray="5 4" /><text x={PR - 4} y={yP(putBE) + 12} textAnchor="end" fontSize="10" fontFamily={font} fill={BLUE} fontWeight="700">Put BE {pxv(putBE)}</text></>)}

              {/* combined straddle P&L (right axis) over the holding window */}
              {comboLine && (<>
                <line x1={entry ? xT(entry.t) : PL} y1={yP2(0)} x2={PR} y2={yP2(0)} stroke={VIOLET} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
                {pTicks.map((v, i) => <text key={i} x={PR + 4} y={yP2(v) + 3} textAnchor="start" fontSize="9" fontFamily={font} fill={VIOLET}>{usd(v, true)}</text>)}
                <path d={comboLine} fill="none" stroke={VIOLET} strokeWidth="2" opacity="0.9" />
                {bestCombo && bestCombo.v > 0 && <circle cx={xT(bestCombo.t)} cy={yP2(bestCombo.v)} r="4.5" fill={VIOLET} stroke={T.surface} strokeWidth="2" />}
              </>)}

              {/* entry */}
              {entry && (<><line x1={xT(entry.t)} y1={PT} x2={xT(entry.t)} y2={PB} stroke={T.text} strokeWidth="1.25" opacity="0.6" /><circle cx={xT(entry.t)} cy={yP(entry.c)} r="5" fill={T.text} stroke={T.surface} strokeWidth="2" /><text x={xT(entry.t)} y={yP(entry.c) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={T.text}>entry {pxv(entry.c)}</text></>)}
              {/* best exits */}
              {bestCall && callPLat(bestCall.c, bestCall.t) > 0 && (<><circle cx={xT(bestCall.t)} cy={yP(bestCall.c)} r="5" fill={T.success} stroke={T.surface} strokeWidth="2" /><text x={xT(bestCall.t)} y={yP(bestCall.c) - 9} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={T.success}>best call exit</text></>)}
              {bestPut && putPLat(bestPut.c, bestPut.t) > 0 && (<><circle cx={xT(bestPut.t)} cy={yP(bestPut.c)} r="5" fill={BLUE} stroke={T.surface} strokeWidth="2" /><text x={xT(bestPut.t)} y={yP(bestPut.c) + 16} textAnchor="middle" fontSize="9" fontFamily={font} fontWeight="700" fill={BLUE}>best put exit</text></>)}

              {hv && (<g><line x1={xT(hv.t)} y1={PT} x2={xT(hv.t)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" /><circle cx={xT(hv.t)} cy={yP(hv.c)} r="3" fill={T.accent} /></g>)}
            </svg>
          )}
          {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hv.t) / VBW) * 100}%`, transform: `translateX(${xT(hv.t) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 8px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap" }}>
            <b style={{ color: T.text }}>{pxv(hv.c)}</b> · <span style={{ color: T.textDim }}>{fmtDate(hv.t)}</span>
            {entry && hv.t >= entry.t && (<>
              <div style={{ marginTop: 2 }}><span style={{ color: T.success }}>call {usd(callPLat(hv.c, hv.t), true)}</span> · <span style={{ color: BLUE }}>put {usd(putPLat(hv.c, hv.t), true)}</span></div>
              <div style={{ color: T.textDim, marginTop: 1, fontSize: 10 }}>value: call {pxv(callValueAt(hv.c, hv.t, "bs"))} · put {pxv(putValueAt(hv.c, hv.t, "bs"))}</div>
            </>)}
          </div>)}
        </div>
        <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
          Click the chart to set your entry date; click a dotted ladder line to set the strike. Dashed rays after the last close project price to expiration (flat / ±1σ from IV). Values use Black-Scholes (time value) with your IV & expiration; strikes are standard levels, not real historical quotes.
        </div>
      </div>

      {/* live option chain — real strikes & bids; click a bid to load it above */}
      <OptionChain symbol={symbol} onPickStrike={pickStrike} highlightStrike={strike} highlightSide={pickedSide} highlightExpiration={expInput} />

      {/* "worth today" scenario banner — answers e.g. "I bought a put, where is it now?" */}
      {entry && last && (
        <div style={{ ...card, border: `1px solid ${putLong ? BLUE : T.success}55`, background: `${putLong ? BLUE : T.success}10` }}>
          <div style={{ color: T.text, fontFamily: font, fontSize: 12.5, lineHeight: 1.7 }}>
            You {putLong ? "bought" : "sold"} the <b>${K} put</b> on <b>{fmtDate(entry.t)}</b> at <b>{pxv(entry.c)}</b> for <b>{pxv(pPrem)}/{unit}</b>.
            {" "}{labelOf(symbol)} is <b>{pxv(last.c)}</b> today ({last.c <= entry.c ? "down" : "up"} {pxv(Math.abs(last.c - entry.c))}).
            {" "}That put is worth about <b style={{ color: BLUE }}>{pxv(putNowBS)}/{unit}</b> now
            {" "}(<span style={{ color: T.textDim }}>intrinsic {pxv(putNowIntr)}</span>) → <b style={{ color: BLUE }}>{usd((putNowBS || 0) * mult * n)}</b> for {n} contract{n === 1 ? "" : "s"}.
            {" "}P&L {putLong ? "" : "(short) "}<b style={{ color: putPLat(last.c, last.t) >= 0 ? T.success : T.danger }}>{usd(putPLat(last.c, last.t), true)}</b>.
          </div>
        </div>
      )}

      {/* position summary: cost, risk/reward, time decay, $-move table */}
      {last && (
        <div style={card}>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 12 }}>Position summary <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>· {Snow != null ? `${symbol} ${pxv(Snow)} today` : ""} · {Math.round(daysLeftAt(lastT))} days to exp</span></div>

          {/* headline stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
            <SumStat T={T} label={netDebit >= 0 ? "Net cost (debit)" : "Net credit received"} value={usd(Math.abs(netDebit))} color={netDebit >= 0 ? T.text : T.success} sub={netDebit >= 0 ? "paid up front — your max risk on long legs" : "collected up front — keep it if legs expire worthless"} />
            <SumStat T={T} label="Time decay / day" value={`${totalTheta >= 0 ? "+" : "−"}${usd(Math.abs(totalTheta)).replace("$", "$")}`} color={totalTheta >= 0 ? T.success : T.danger} sub={totalTheta >= 0 ? "decay works FOR you (net short premium)" : "decay works AGAINST you — bleeds daily, faster near exp"} />
            <SumStat T={T} label={`Put BE ${pxv(putBE)}`} value={moveNeed(putEcon.moveToBE)} color={BLUE} sub={`${putLong ? "long" : "short"} put profits ${putLong ? "below" : "above"} breakeven at exp`} />
            <SumStat T={T} label={`Call BE ${pxv(callBE)}`} value={moveNeed(callEcon.moveToBE)} color={T.success} sub={`${callLong ? "long" : "short"} call profits ${callLong ? "above" : "below"} breakeven at exp`} />
          </div>

          {/* per-leg max risk / reward */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 14, fontFamily: font, fontSize: 12 }}>
            <div style={{ border: `1px solid ${BLUE}33`, borderRadius: 8, padding: "9px 12px" }}>
              <b style={{ color: BLUE }}>{putLong ? "Long" : "Short"} put ${K}</b> — cost {usd(putEcon.cost)}{putLong ? "" : " credit"} · max loss <b style={{ color: T.danger }}>{moneyInf(putEcon.maxLoss)}</b> · max gain <b style={{ color: T.success }}>{moneyInf(putEcon.maxGain)}</b>
            </div>
            <div style={{ border: `1px solid ${T.success}33`, borderRadius: 8, padding: "9px 12px" }}>
              <b style={{ color: T.success }}>{callLong ? "Long" : "Short"} call ${K}</b> — cost {usd(callEcon.cost)}{callLong ? "" : " credit"} · max loss <b style={{ color: T.danger }}>{moneyInf(callEcon.maxLoss)}</b> · max gain <b style={{ color: T.success }}>{moneyInf(callEcon.maxGain)}</b>
            </div>
          </div>

          {/* $-move table — "is a $2 move worth it?" */}
          <div style={{ color: T.textDim, fontFamily: font, fontSize: 11, marginBottom: 6 }}>If {symbol} moves this much <b style={{ color: T.text }}>today</b> (value sold now, decay held constant):</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460, fontFamily: font, fontSize: 12 }}>
              <thead><tr>
                {["Move", "Stock", "Put worth", "Put P&L", "Total P&L"].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {moveRows.map((r) => (
                  <tr key={r.d} style={{ background: r.d === 0 ? T.card : "transparent" }}>
                    <td style={{ textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: r.d < 0 ? T.danger : r.d > 0 ? T.success : T.textDim, fontWeight: 700 }}>{r.d === 0 ? "flat" : `${r.d > 0 ? "+" : "−"}$${Math.abs(r.d)}`}</td>
                    <td style={{ textAlign: "right", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: T.text }}>{pxv(r.S2)}</td>
                    <td style={{ textAlign: "right", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: T.text }}>{pxv(r.putWorth)}</td>
                    <td style={{ textAlign: "right", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: r.putPL >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(r.putPL, true)}</td>
                    <td style={{ textAlign: "right", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: r.total >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(r.total, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
            "Put worth" is the Black-Scholes value per {unit} after the move (× {mult} × {n} = dollars). P&L is vs. your {pxv(pPrem)} premium. Holding longer adds time decay (see Time decay / day above).
          </div>
        </div>
      )}

      {/* leg results + exit timing */}
      {entry && last && (
        <div style={{ ...card }}>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, marginBottom: 10 }}>If you entered {fmtDate(entry.t)} at {pxv(entry.c)} · {symbol} · exp {fmtDate(expMs)} · IV {(ivFrac * 100).toFixed(0)}%</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            <LegCard T={T} color={T.success} title={`${callLong ? "Long" : "Short"} call $${K}`} prem={cPrem} be={callBE} valBS={callNowBS} valIntr={callNowIntr} plBS={callPLat(last.c, last.t, "bs")} plIntr={callPLat(last.c, last.t, "intr")} best={bestCall} bestPL={bestCall ? callPLat(bestCall.c, bestCall.t) : null} unit={unit} />
            <LegCard T={T} color={BLUE} title={`${putLong ? "Long" : "Short"} put $${K}`} prem={pPrem} be={putBE} valBS={putNowBS} valIntr={putNowIntr} plBS={putPLat(last.c, last.t, "bs")} plIntr={putPLat(last.c, last.t, "intr")} best={bestPut} bestPL={bestPut ? putPLat(bestPut.c, bestPut.t) : null} unit={unit} />
            <div style={{ border: `1px solid #A78BFA55`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ color: VIOLET, fontFamily: font, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Combined (call + put)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontFamily: font, fontSize: 12 }}>
                <span style={{ color: T.textDim }}>P&L now</span><span style={{ textAlign: "right", color: comboNow == null ? T.text : comboNow >= 0 ? T.success : T.danger, fontWeight: 700 }}>{comboNow == null ? "—" : usd(comboNow, true)}</span>
                <span style={{ color: T.textDim }}>Best exit</span><span style={{ textAlign: "right", color: T.text }}>{bestCombo && bestCombo.v > 0 ? fmtDate(bestCombo.t) : "—"}</span>
                <span style={{ color: T.textDim }}>Best P&L</span><span style={{ textAlign: "right", color: bestCombo && bestCombo.v > 0 ? T.success : T.textDim, fontWeight: 700 }}>{bestCombo && bestCombo.v > 0 ? usd(bestCombo.v, true) : "—"}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 8, border: `1px solid ${amber}44`, background: `${amber}12` }}>
            <div style={{ color: amber, fontFamily: font, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Exit suggestion (heuristic)</div>
            <div style={{ color: T.text, fontFamily: font, fontSize: 12, lineHeight: 1.6 }}>{exitHeuristic({ bestCall, bestPut, bcPL: bestCall ? callPLat(bestCall.c, bestCall.t) : -Infinity, bpPL: bestPut ? putPLat(bestPut.c, bestPut.t) : -Infinity })}</div>
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

function exitHeuristic({ bestCall, bestPut, bcPL, bpPL }) {
  if (bcPL <= 0 && bpPL <= 0) return "Neither leg reached profit over this window — the price stayed between the two breakevens (the dead zone). A bigger move was needed; consider a closer strike or waiting for higher volatility.";
  const parts = [];
  if (bcPL > 0 && bestCall) parts.push(`The call would have been best to close around ${fmtDate(bestCall.t)} at ${pxv(bestCall.c)} (≈${usd(bcPL, true)}) — after that the pullback gave profit back.`);
  if (bpPL > 0 && bestPut) parts.push(`The put's best exit was around ${fmtDate(bestPut.t)} at ${pxv(bestPut.c)} (≈${usd(bpPL, true)}).`);
  parts.push("Rule of thumb: take profit once a leg is well past its breakeven and momentum stalls; cut the other leg if it's decaying toward zero.");
  return parts.join(" ");
}

function SumStat({ T, label, value, color, sub }) {
  const font = T.fontMono;
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", background: T.card }}>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: font, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 18, fontWeight: 700, fontFamily: font, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function LegCard({ T, color, title, prem, be, valBS, valIntr, plBS, plIntr, best, bestPL, unit }) {
  const font = T.fontMono;
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ color, fontFamily: font, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title} <span style={{ color: T.textDim, fontWeight: 400 }}>@ {pxv(prem)} prem</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontFamily: font, fontSize: 12 }}>
        <span style={{ color: T.textDim }}>Breakeven</span><span style={{ textAlign: "right", color: T.text }}>{be != null ? pxv(be) : "—"}</span>
        <span style={{ color: T.textDim }}>Worth now (BS)</span><span style={{ textAlign: "right", color: T.text, fontWeight: 700 }}>{pxv(valBS)}<span style={{ color: T.textDim, fontWeight: 400 }}>/{unit}</span></span>
        <span style={{ color: T.textDim }}>Intrinsic</span><span style={{ textAlign: "right", color: T.textDim }}>{pxv(valIntr)}/{unit}</span>
        <span style={{ color: T.textDim }}>P&L now (BS)</span><span style={{ textAlign: "right", color: plBS >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(plBS, true)}</span>
        <span style={{ color: T.textDim }}>P&L (intrinsic)</span><span style={{ textAlign: "right", color: plIntr >= 0 ? T.success : T.danger }}>{usd(plIntr, true)}</span>
        <span style={{ color: T.textDim }}>Best exit</span><span style={{ textAlign: "right", color: T.text }}>{best && bestPL > 0 ? `${fmtDate(best.t)}` : "—"}</span>
        <span style={{ color: T.textDim }}>Best P&L</span><span style={{ textAlign: "right", color: bestPL > 0 ? T.success : T.textDim, fontWeight: 700 }}>{bestPL != null && bestPL > 0 ? usd(bestPL, true) : "—"}</span>
      </div>
    </div>
  );
}
