import React, { useMemo, useRef, useState, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";

/**
 * CoveredCallExitCard
 * -------------------
 * A self-contained covered-call "exit now" card. No external dependencies
 * beyond React. The payoff curve is drawn with inline SVG and the price marker
 * is draggable (pointer + slider). All option values use a Black-Scholes model.
 *
 * Drop-in usage:
 *   import CoveredCallExitCard from "./CoveredCallExitCard";
 *   <CoveredCallExitCard />
 *
 * Everything is configurable via props (defaults match a GOOGL example):
 *   entry        cost basis / price when the call was sold
 *   strikes      array of [itm, atm, otm] strike prices
 *   totalDays    days to expiration at entry
 *   vol          implied volatility (decimal, e.g. 0.28)
 *   rate         risk-free rate (decimal)
 *   ticker       label shown in the header
 *   fees         { optionCommission, optionRegulatory, spread } per-contract close costs
 */

// ---------- option math ----------
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function bsCall(S, K, t, r, sig) {
  if (t <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + (r + (sig * sig) / 2) * t) / (sig * Math.sqrt(t));
  const d2 = d1 - sig * Math.sqrt(t);
  return S * normCdf(d1) - K * Math.exp(-r * t) * normCdf(d2);
}

// ---------- formatting ----------
const money = (v) => {
  const n = Math.round(v);
  return (n >= 0 ? "+$" : "\u2212$") + Math.abs(n).toLocaleString();
};
const cost = (v) => "\u2212$" + Math.abs(Math.round(v)).toLocaleString();

// ---------- chart geometry ----------
const VBW = 660;
const VBH = 300;
const PL = 52;
const PR = 642;
const PT = 26;
const PB = 250;

export default function CoveredCallExitCard({
  entry = 366,
  strikes = [360, 365, 370],
  totalDays = 30,
  vol = 0.28,
  rate = 0.045,
  ticker = "GOOGL",
  fees = { optionCommission: 0.65, optionRegulatory: 0.04, spread: 6.0 },
  initialStrike = 1,
  initialDay = 1,
  initialPrice = 384,
}) {
  const { T } = useTheme();
  const [sel, setSel] = useState(initialStrike);
  const [day, setDay] = useState(initialDay);
  const [price, setPrice] = useState(initialPrice);
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const svgRef = useRef(null);

  const accents = [T.success, T.accent, T.warn]; // itm / atm / otm
  const accent = accents[sel];

  const strikeMin = Math.min(...strikes);
  const strikeMax = Math.max(...strikes);
  const strikePad = (strikeMax - strikeMin) * 0.15 || strikeMax * 0.05;
  const xMin = strikeMin - strikePad;
  const xMax = strikeMax + strikePad;

  const labels = ["ITM", "ATM", "OTM"];
  const tooltips = [
    "In The Money: Strike is below current price. High intrinsic value, safer but less premium.",
    "At The Money: Strike is near current price. High time value, balanced risk and reward.",
    "Out of The Money: Strike is above current price. Mostly time value, higher risk/reward."
  ];

  // premium collected at entry, and the capped max profit, per strike
  const prem = useMemo(
    () => strikes.map((K) => bsCall(entry, K, totalDays / 365, rate, vol)),
    [strikes, entry, totalDays, rate, vol]
  );
  const maxP = useMemo(
    () => strikes.map((K, i) => Math.round((K - entry + prem[i]) * 100),
    ),
    [strikes, entry, prem]
  );

  const dte = totalDays - day;
  const t = dte / 365;
  const K = strikes[sel];

  const livePnl = useCallback(
    (S) => (S - entry) * 100 + (prem[sel] - bsCall(S, K, t, rate, vol)) * 100,
    [entry, prem, sel, K, t, rate, vol]
  );

  // curve points + y-domain
  const { pts, yMin, yMax } = useMemo(() => {
    const p = [];
    for (let s = xMin; s <= xMax; s += 1) p.push({ x: s, y: livePnl(s) });
    const ys = p.map((d) => d.y);
    let lo = Math.min(0, ...ys);
    let hi = Math.max(maxP[sel], ...ys);
    const pad = (hi - lo) * 0.14 || 100;
    return { pts: p, yMin: lo - pad, yMax: hi + pad };
  }, [livePnl, maxP, sel, xMin, xMax]);

  const px = (v) => PL + ((v - xMin) / (xMax - xMin)) * (PR - PL);
  const py = (v) => PB - ((v - yMin) / (yMax - yMin)) * (PB - PT);

  const path = useMemo(
    () => pts.map((d, i) => (i ? "L" : "M") + px(d.x).toFixed(1) + " " + py(d.y).toFixed(1)).join(" "),
    [pts] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // money breakdown at the current price
  const b = useMemo(() => {
    const callNow = bsCall(price, K, t, rate, vol);
    const stockLeg = (price - entry) * 100;
    const premKept = prem[sel] * 100;
    const buyback = callNow * 100;
    const gross = stockLeg + premKept - buyback;
    const stockFees = price * 100 * 0.0000278 + 100 * 0.000166;
    const friction =
      fees.optionCommission + fees.optionRegulatory + fees.spread + stockFees;
    const net = gross - friction;
    const intrinsic = Math.max(price - K, 0) * 100;
    const timeValue = buyback - intrinsic;
    const pct = Math.round((gross / maxP[sel]) * 100);
    return { callNow, stockLeg, premKept, buyback, gross, friction, net, timeValue, pct };
  }, [price, K, t, rate, vol, entry, prem, sel, maxP, fees]);

  // dragging
  const priceFromClientX = useCallback(
    (clientX) => {
      const svg = svgRef.current;
      if (!svg) return price;
      const rect = svg.getBoundingClientRect();
      const xv = ((clientX - rect.left) / rect.width) * VBW;
      const raw = xMin + ((xv - PL) / (PR - PL)) * (xMax - xMin);
      return Math.max(xMin, Math.min(xMax, Math.round(raw)));
    },
    [price, xMin, xMax]
  );
  const dragging = useRef(false);
  const onDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPrice(priceFromClientX(e.clientX));
  };
  const onMove = (e) => {
    if (dragging.current) setPrice(priceFromClientX(e.clientX));
  };
  const onUp = () => {
    dragging.current = false;
  };

  const markerX = px(price);
  const markerY = py(livePnl(price));

  return (
    <div className="cc-card" style={{
      "--cc-accent": accent,
      "--cc-surface": T.surface,
      "--cc-surface-2": T.inputBg,
      "--cc-border": T.border,
      "--cc-text": T.text,
      "--cc-muted": T.textDim,
      "--cc-grid": T.borderActive,
      "--cc-zero": T.textMuted,
      "--cc-entry": T.textMuted,
      "--cc-pos": T.success,
      "--cc-neg": T.danger
    }}>
      <style>{CSS}</style>

      <div className="cc-head">
        <div>
          <div className="cc-title" style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
            <span>{ticker} <span className="cc-sub">sold at ${entry}</span></span>
            <button 
              className="cc-live-btn"
              onClick={() => {
                setPrice(initialPrice);
                setDay(initialDay);
              }}
              title="Reset to current market conditions"
            >
              <span className="live-dot" /> Live
            </button>
          </div>
        </div>
        <div className="cc-seg" style={{ position: "relative" }}>
          {labels.map((l, i) => (
            <button
              key={l}
              className={"cc-segbtn" + (i === sel ? " on" : "")}
              style={i === sel ? { color: accents[i], borderColor: accents[i] } : undefined}
              onClick={() => setSel(i)}
              onMouseEnter={() => setHoveredBtn(i)}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              ${strikes[i]} {l}
            </button>
          ))}
          {hoveredBtn !== null && (
            <div className="cc-tooltip">
              {tooltips[hoveredBtn]}
            </div>
          )}
        </div>
      </div>

      <div className="cc-controls">
        <label className="cc-ctl">
          <span>Day {day} of {totalDays}</span>
          <input type="range" min={1} max={totalDays} value={day}
            onChange={(e) => setDay(+e.target.value)} />
          <em>{dte} days left</em>
        </label>
        <label className="cc-ctl">
          <span>Current price</span>
          <input type="range" min={xMin} max={xMax} value={price}
            onChange={(e) => setPrice(+e.target.value)} />
          <em>${price}</em>
        </label>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VBW} ${VBH}`}
        className="cc-chart"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={`Covered call payoff for the $${K} strike at day ${day}. Selling at $${entry}, current price $${price}, net if exited now ${money(b.net)}.`}
      >
        {/* zero line */}
        <line x1={PL} y1={py(0)} x2={PR} y2={py(0)} className="cc-zero" />
        {/* cap line */}
        <line x1={PL} y1={py(maxP[sel])} x2={PR} y2={py(maxP[sel])} className="cc-cap" stroke={accent} />
        <text x={PR} y={py(maxP[sel]) - 6} textAnchor="end" className="cc-caplbl" fill={accent}>
          cap {money(maxP[sel])}
        </text>

        {/* x ticks */}
        {[Math.ceil(xMin / 10) * 10].map(() => null)}
        {Array.from({ length: Math.floor((xMax - xMin) / 10) + 1 }, (_, i) => Math.ceil(xMin / 10) * 10 + i * 10)
          .filter((v) => v <= xMax)
          .map((v) => (
            <g key={v}>
              <line x1={px(v)} y1={PT} x2={px(v)} y2={PB} stroke="var(--cc-grid)" strokeWidth="1" opacity="0.4" />
              <text x={px(v)} y={PB + 18} textAnchor="middle" className="cc-tick">
                ${v}
              </text>
            </g>
          ))}

        {/* entry marker */}
        <line x1={px(entry)} y1={PT} x2={px(entry)} y2={PB} className="cc-entry" />
        <text x={px(entry)} y={PB - 6} textAnchor="middle" className="cc-entrylbl">
          sold ${entry}
        </text>

        {/* payoff curve */}
        <path d={path} className="cc-curve" stroke={accent} />

        {/* current price marker */}
        <line x1={markerX} y1={PT + 14} x2={markerX} y2={PB} stroke={accent} strokeWidth="2" />
        <circle cx={markerX} cy={markerY} r="6" fill={accent} className="cc-dot" />
        <text x={markerX} y={PT + 8} textAnchor="middle" className="cc-nowlbl" fill={accent}>
          now ${price} · drag
        </text>
      </svg>

      <div className="cc-ledger">
        <div className="cc-ledgerhead">
          If you exit fully at ${price} · {b.pct}% of the cap
        </div>
        <Row label={`Sell 100 shares  (100 × ($${price} − $${entry}))`} value={money(b.stockLeg)} tone={b.stockLeg >= 0 ? "pos" : "neg"} tooltip="If you exit, you are selling your 100 shares at the current market price. This is the profit or loss on the shares alone." />
        <Row label="Premium you already kept" value={money(b.premKept)} tone="pos" tooltip="The cash you received upfront when you originally sold the covered call. You keep this entirely." />
        <Row label={<><strong>Buy back the call</strong>  (cost to close)</>} value={cost(b.buyback)} tone="neg" tooltip="To exit early, you must buy back the call option at its current live price. This costs you money." />
        <div className="cc-rule" />
        <Row label="Gross if you exit now" value={money(b.gross)} tone={b.gross >= 0 ? "pos" : "neg"} tooltip="The sum of your share sale, the premium kept, and the cost to buy back the call, before fees." />
        <Row label="Same-day frictions (est.)" value={cost(b.friction)} tone="neg" tooltip="Estimated broker commissions, regulatory fees, and the bid/ask spread lost by closing the trade today." />
        <div className="cc-rule" />
        <Row label="Net in your pocket" value={money(b.net)} tone={b.net >= 0 ? "pos" : "neg"} big tooltip="The final estimated amount you walk away with after all costs and fees." />
      </div>

      <p className="cc-foot">
        Buy-back cost is the call’s live price × 100; about {cost(b.timeValue)} of it is time
        value, the only part you forfeit by closing early. Frictions are roughly $
        {fees.optionCommission.toFixed(2)} option commission, a few cents of regulatory fees, ~$1
        in SEC/TAF on the share sale, and the option bid/ask spread (the main one). Closing same
        day makes the gain short-term, taxed as ordinary income. Estimates only — not financial advice.
      </p>
    </div>
  );
}

function Row({ label, value, tone, big, tooltip }) {
  return (
    <div className={"cc-row" + (big ? " big" : "")}>
      <span className="cc-rlabel" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {label}
        {tooltip && (
          <span className="cc-info-icon" data-tip={tooltip}>
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Z"/>
            </svg>
          </span>
        )}
      </span>
      <span className={"cc-rval " + (tone || "")}>{value}</span>
    </div>
  );
}

const CSS = `
.cc-card{
  --cc-surface:#ffffff; --cc-surface-2:#f6f5f1; --cc-border:#e6e4dd;
  --cc-text:#26251f; --cc-muted:#76746c; --cc-grid:#ecebe5;
  --cc-zero:#c9c7bf; --cc-entry:#9a988f; --cc-pos:#3B6D11; --cc-neg:#B23D1E;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--cc-text); background:transparent;
  border:none; padding:0;
  width:100%; max-width:100%; box-shadow:none;
  box-sizing:border-box;
}
@media (prefers-color-scheme: dark){
  .cc-card{
    box-shadow:none;
  }
  .cc-tooltip {
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
}
.cc-card *{ box-sizing:border-box; }
.cc-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
.cc-title{ font-size:20px; font-weight:650; margin-top:2px; letter-spacing:-.01em; }
.cc-sub{ font-size:13px; font-weight:500; color:var(--cc-muted); }
.cc-live-btn {
  background:transparent; border:1px solid var(--cc-border);
  color:var(--cc-text); border-radius:6px; padding:2px 8px;
  font-size:11px; cursor:pointer; font-family:inherit; font-weight:600;
  text-transform:uppercase; transition:all 0.15s;
  display:inline-flex; align-items:center; gap:5px;
}
.cc-live-btn:hover { background:var(--cc-surface-2); }
.live-dot { width:6px; height:6px; background:var(--cc-pos); border-radius:50%; box-shadow:0 0 4px var(--cc-pos); }
.cc-seg{ display:flex; gap:6px; }
.cc-segbtn{
  font:inherit; font-size:13px; padding:6px 10px; border-radius:9px; cursor:pointer;
  background:transparent; color:var(--cc-text); border:1px solid var(--cc-border);
  transition:border-color .15s,color .15s,background .15s;
}
.cc-segbtn:hover{ background:var(--cc-surface-2); }
.cc-segbtn.on{ border-width:2px; font-weight:600; }
.cc-tooltip{
  position:absolute; top:100%; right:0; margin-top:8px;
  background:var(--cc-surface-2); border:1px solid var(--cc-border);
  padding:8px 12px; border-radius:8px; font-size:11px;
  color:var(--cc-text); width:240px; z-index:10;
  box-shadow:0 4px 12px rgba(0,0,0,0.15); pointer-events:none;
  line-height: 1.4;
}
.cc-controls{ display:flex; gap:18px; margin:16px 0 4px; flex-wrap:wrap; }
.cc-ctl{ display:flex; flex-direction:column; gap:4px; flex:1; min-width:180px; font-size:12px; color:var(--cc-muted); }
.cc-ctl em{ font-style:normal; font-weight:600; color:var(--cc-text); font-variant-numeric:tabular-nums; }
.cc-ctl input[type=range]{ accent-color:var(--cc-accent); width:100%; }
.cc-chart{ width:calc(100% + 48px); height:auto; display:block; margin:4px -24px 6px; touch-action:none; cursor:ew-resize; }
.cc-zero{ stroke:var(--cc-zero); stroke-width:1; stroke-dasharray:3 3; }
.cc-cap{ stroke-width:1; stroke-dasharray:5 4; opacity:.8; }
.cc-caplbl{ font-size:12px; font-weight:600; }
.cc-tick{ font-size:11px; fill:var(--cc-muted); }
.cc-entry{ stroke:var(--cc-entry); stroke-width:1; stroke-dasharray:4 4; }
.cc-entrylbl{ font-size:11px; fill:var(--cc-entry); }
.cc-curve{ fill:none; stroke-width:2.5; stroke-linejoin:round; }
.cc-dot{ stroke:var(--cc-surface); stroke-width:2; }
.cc-nowlbl{ font-size:12px; font-weight:600; }
.cc-ledger{ background:var(--cc-surface-2); border-radius:12px; padding:14px 16px; margin-top:8px; }
.cc-ledgerhead{ font-size:12px; color:var(--cc-muted); margin-bottom:8px; }
.cc-row{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:5px 0; font-size:14px; }
.cc-row.big{ font-size:16px; }
.cc-rlabel{ color:var(--cc-text); }
.cc-rval{ font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
.cc-row.big .cc-rval{ font-size:20px; }
.cc-rval.pos{ color:var(--cc-pos); }
.cc-rval.neg{ color:var(--cc-neg); }
.cc-rule{ border-top:1px solid var(--cc-border); margin:5px 0; }
.cc-foot{ font-size:12px; line-height:1.6; color:var(--cc-muted); margin:12px 2px 0; }
.cc-info-icon{
  display:inline-flex; justify-content:center; align-items:center;
  width:22px; height:22px; border-radius:50%;
  background:var(--cc-surface-2); border:none;
  color:var(--cc-muted);
  cursor:help; position:relative;
}
.cc-info-icon::after{
  content:attr(data-tip); position:absolute; bottom:100%; left:50%; transform:translateX(-50%);
  margin-bottom:8px; background:var(--cc-surface-2); border:1px solid var(--cc-border);
  padding:8px 12px; border-radius:8px; font-size:11px;
  color:var(--cc-text); width:200px; z-index:10;
  box-shadow:0 4px 12px rgba(0,0,0,0.15); pointer-events:none;
  opacity:0; transition:opacity 0.15s;
  text-align:left; font-family:ui-sans-serif, system-ui, sans-serif;
  font-weight:normal; line-height:1.4; white-space:normal;
}
@media (prefers-color-scheme: dark){
  .cc-info-icon { background:#0d1117; }
  .cc-info-icon::after{ box-shadow:0 4px 12px rgba(0,0,0,0.5); }
}
.cc-info-icon:hover::after{ opacity:1; }
`;
