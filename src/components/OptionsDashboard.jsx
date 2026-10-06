// ─── src/components/OptionsDashboard.jsx ─────────────────────────────────────
// Options Manager → "Dashboard" tab. Pick a symbol (incl. US Treasury: ZB=F
// futures, TLT ETF, ^TYX yield), watch its price trend (Day/Week/Month), and
// browse all expirations + strikes for optionable symbols (collapsible, with a
// strike-count limiter to tune spacing). Treasury futures/yield indices chart
// fine but have no listed option chain — TLT is the optionable 30-yr proxy.

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getPriceHistory } from "../services/priceHistory";
import { useExpirations, useOptionsChain } from "../hooks/useMarketData";
import { SYMBOL_GROUPS, CATALOG_SYMBOLS } from "../data/optionsSymbols";
import MinuteCompareChart from "./MinuteCompareChart";

const GRAN = [{ k: "D", range: "1Y", label: "Day" }, { k: "W", range: "2Y", label: "Week" }, { k: "M", range: "ALL", label: "Month" }];
const COUNTS = [10, 20, 40, 0]; // 0 = All

const money = (v) => (v || v === 0 ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
const px2 = (v) => (v > 0 ? Number(v).toFixed(2) : "—");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const expLabel = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : iso; };
const monthName = (iso) => { const [y, m] = String(iso || "").split("-").map(Number); return y ? new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" }) : iso; };

// ── Price trend chart (Day / Week / Month) ───────────────────────────────────
const VBW = 820, VBH = 280, PL = 56, PR = 806, PT = 16, PB = 250;
function TrendChart({ symbol, T }) {
  const [gran, setGran] = useState("D");
  const [pts, setPts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoverI, setHoverI] = useState(null);
  const range = GRAN.find((g) => g.k === gran)?.range || "1Y";

  useEffect(() => {
    let alive = true; setLoading(true); setError(""); setHoverI(null);
    getPriceHistory(symbol, range)
      .then((r) => { if (alive) { setPts(r.points || []); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e?.message || "No data for this symbol."); setLoading(false); } });
    return () => { alive = false; };
  }, [symbol, range]);

  const n = pts.length;
  const vals = pts.map((p) => p.c);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const xT = (i) => PL + (n <= 1 ? 0 : (i / (n - 1)) * (PR - PL));
  const yP = (v) => { const r = PB - ((v - lo) / ((hi - lo) || 1)) * (PB - PT); return Number.isFinite(r) ? r : PB; };
  const line = pts.map((p, i) => (i ? "L" : "M") + xT(i).toFixed(1) + " " + yP(p.c).toFixed(1)).join(" ");
  const area = n ? `${line} L ${xT(n - 1).toFixed(1)} ${PB} L ${xT(0).toFixed(1)} ${PB} Z` : "";
  const last = n ? pts[n - 1].c : 0, first = n ? pts[0].c : 0;
  const chg = last - first, chgPct = first ? (chg / first) * 100 : 0, up = chg >= 0;
  const color = up ? T.success : T.danger;
  const font = T.fontMono;
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const xTicks = n ? [...new Set([0, 1, 2, 3, 4].map((i) => Math.round(((n - 1) * i) / 4)))] : [];
  const hv = hoverI != null ? pts[hoverI] : null;
  const onMove = (e) => { if (!n) return; const r = e.currentTarget.getBoundingClientRect(); const vbx = ((e.clientX - r.left) / r.width) * VBW; setHoverI(Math.max(0, Math.min(n - 1, Math.round(((vbx - PL) / (PR - PL)) * (n - 1))))); };
  const pill = (a) => ({ padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: 0 }}>{symbol}</h3>
          <span style={{ color: T.text, fontFamily: font, fontSize: 18, fontWeight: 700 }}>{n ? px2(last) : "—"}</span>
          {n > 0 && <span style={{ color, fontFamily: font, fontSize: 13, fontWeight: 700 }}>{up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)} ({up ? "+" : ""}{chgPct.toFixed(2)}%)</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>{GRAN.map((g) => <button key={g.k} onClick={() => setGran(g.k)} style={pill(gran === g.k)}>{g.label}</button>)}</div>
      </div>
      <div style={{ position: "relative", width: "100%" }}>
        {loading ? <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>Loading {symbol}…</div>
          : error ? <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.danger, fontFamily: font, fontSize: 13 }}>{error}</div>
          : n === 0 ? <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontFamily: font, fontSize: 13 }}>No price history for {symbol}.</div>
          : (
            <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverI(null)}>
              <defs><linearGradient id="odArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
              {yTicks.map((v, i) => (<g key={i}><line x1={PL} y1={yP(v)} x2={PR} y2={yP(v)} stroke={T.border} strokeWidth="1" opacity="0.4" /><text x={PL - 8} y={yP(v) + 3} textAnchor="end" fontSize="10" fontFamily={font} fill={T.textDim}>{v.toFixed(2)}</text></g>))}
              <path d={area} fill="url(#odArea)" /><path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {xTicks.map((i) => (<text key={i} x={xT(i)} y={VBH - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="10" fontFamily={font} fill={T.textDim}>{fmtDate(pts[i].t)}</text>))}
              {hv && (<g><line x1={xT(hoverI)} y1={PT} x2={xT(hoverI)} y2={PB} stroke={T.textDim} strokeWidth="1" strokeDasharray="3 3" /><circle cx={xT(hoverI)} cy={yP(hv.c)} r="4" fill={color} stroke={T.surface} strokeWidth="2" /></g>)}
            </svg>
          )}
        {hv && (<div style={{ position: "absolute", top: 0, left: `${(xT(hoverI) / VBW) * 100}%`, transform: `translateX(${xT(hoverI) > VBW * 0.7 ? "-105%" : "8px"})`, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", pointerEvents: "none", fontFamily: font, fontSize: 11, whiteSpace: "nowrap", boxShadow: "0 6px 18px #00000055" }}><div style={{ color: T.text, fontWeight: 700 }}>{px2(hv.c)}</div><div style={{ color: T.textDim, marginTop: 2 }}>{fmtDate(hv.t)}</div></div>)}
      </div>
    </div>
  );
}

// ── Strikes + expirations browser ────────────────────────────────────────────
function StrikesBrowser({ symbol, T, onUseTLT }) {
  const [collapsed, setCollapsed] = useState(false);
  const [year, setYear] = useState(null);
  const [exp, setExp] = useState(null);
  const [count, setCount] = useState(20);
  // Futures ("ZB=F") and index ("^TYX") symbols have no equity option chain —
  // don't call the chain endpoints (avoids 400 "Invalid ticker symbol" noise).
  const optionable = !/[=^]/.test(symbol);
  const { expirations } = useExpirations(optionable ? symbol : null);

  const byYear = useMemo(() => { const m = {}; (expirations || []).forEach((e) => { const y = String(e).slice(0, 4); (m[y] = m[y] || []).push(e); }); return m; }, [expirations]);
  const years = Object.keys(byYear).sort();
  useEffect(() => { setYear(years[0] || null); }, [symbol, expirations]); // eslint-disable-line
  useEffect(() => { setExp(year && byYear[year] ? byYear[year][0] : null); }, [year]); // eslint-disable-line
  const { chain, loading, error } = useOptionsChain(optionable ? symbol : null, exp);

  const under = chain?.underlyingPrice || 0;
  // Robust key lookup: the returned chain key may not exactly equal `exp`
  // (matches the existing OptionChain behavior) — fall back to the first key.
  const chainKey = chain?.chain ? (chain.chain[exp] ? exp : Object.keys(chain.chain)[0]) : null;
  const legs = chainKey ? chain.chain[chainKey] : null;
  const rows = useMemo(() => {
    if (!legs) return [];
    const byStrike = {};
    (legs.calls || []).forEach((c) => { (byStrike[c.strike] = byStrike[c.strike] || { strike: c.strike }).call = c; });
    (legs.puts || []).forEach((p) => { (byStrike[p.strike] = byStrike[p.strike] || { strike: p.strike }).put = p; });
    let all = Object.values(byStrike).sort((a, b) => a.strike - b.strike);
    if (count > 0 && all.length > count && under > 0) {
      let atm = 0, best = Infinity;
      all.forEach((r, i) => { const d = Math.abs(r.strike - under); if (d < best) { best = d; atm = i; } });
      const half = Math.floor(count / 2);
      all = all.slice(Math.max(0, atm - half), Math.max(0, atm - half) + count);
    }
    return all;
  }, [legs, count, under]);

  const font = T.fontMono;
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const chip = (a) => ({ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${a ? T.accent : T.border}`, background: a ? T.accent : "transparent", color: a ? "#0A0A0A" : T.textDim });
  const th = { color: T.textDim, fontSize: 9, fontFamily: font, letterSpacing: 0.5, textTransform: "uppercase", padding: "6px 8px", textAlign: "right" };
  const cell = { fontFamily: font, fontSize: 12, padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" };
  const noChain = !optionable || (!loading && (error || (years.length === 0 && (expirations || []).length === 0)));

  return (
    <div style={card} role="region" aria-label="Strikes and expirations">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button onClick={() => setCollapsed((c) => !c)} style={{ display: "flex", alignItems: "baseline", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0, fontWeight: 600 }}>Strikes & Expirations</h3>
          <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>{symbol}{under > 0 ? ` · ${px2(under)}` : ""}</span>
        </button>
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", width: 30, height: 30, borderRadius: 7, fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{collapsed ? "+" : "−"}</button>
      </div>

      {!collapsed && (<>
        {noChain ? (
          <div style={{ color: T.textDim, fontSize: 13, lineHeight: 1.6, marginTop: 12 }}>
            No listed option chain available for <b>{symbol}</b> from this data source (futures/yield indices don't expose one here).
            {" "}Treasury options are available via the <b>TLT</b> ETF.
            {onUseTLT && <button onClick={onUseTLT} style={{ ...chip(false), marginLeft: 8, borderColor: T.accent, color: T.accent }}>Use TLT</button>}
          </div>
        ) : (<>
          {/* Year selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "14px 0 8px" }}>
            <span style={{ color: T.textDim, fontSize: 11, fontFamily: font, minWidth: 38 }}>Year</span>
            {years.map((y) => <button key={y} onClick={() => setYear(y)} style={chip(year === y)}>{y}</button>)}
          </div>
          {/* Month / expiration selector for the year */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ color: T.textDim, fontSize: 11, fontFamily: font, minWidth: 38 }}>Exp</span>
            {(byYear[year] || []).map((e) => <button key={e} onClick={() => setExp(e)} style={chip(exp === e)}>{monthName(e)} {String(e).slice(8)}</button>)}
          </div>
          {/* Strike-count limiter */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ color: T.textDim, fontSize: 11, fontFamily: font, minWidth: 38 }}>Strikes</span>
            {COUNTS.map((c) => <button key={c} onClick={() => setCount(c)} style={chip(count === c)}>{c === 0 ? "All" : c}</button>)}
            {under > 0 && count > 0 && <span style={{ color: T.textMuted || T.textDim, fontSize: 10, fontFamily: font }}>({count} around the money)</span>}
          </div>

          {loading ? (
            <div style={{ color: T.textDim, fontSize: 13 }}>Loading chain…</div>
          ) : rows.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: 13 }}>No strikes for {exp ? expLabel(exp) : "this expiration"}.</div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr>
                  {["Call Bid", "Call Ask", "Strike", "Put Bid", "Put Ask"].map((h, i) => (
                    <th key={i} style={{ ...th, textAlign: i === 2 ? "center" : "right", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const atm = under > 0 && Math.abs(r.strike - under) < (rows[1] ? Math.abs(rows[1].strike - rows[0].strike) : 1) / 2;
                    return (
                      <tr key={r.strike} style={{ background: atm ? T.accentDim : "transparent", borderBottom: `1px solid ${T.border}22` }}>
                        <td style={{ ...cell, color: T.success }}>{px2(r.call?.bid)}</td>
                        <td style={{ ...cell, color: T.textDim }}>{px2(r.call?.ask)}</td>
                        <td style={{ ...cell, textAlign: "center", fontWeight: 700, color: atm ? T.accent : T.text, borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}` }}>{r.strike}</td>
                        <td style={{ ...cell, color: T.danger }}>{px2(r.put?.bid)}</td>
                        <td style={{ ...cell, color: T.textDim }}>{px2(r.put?.ask)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>)}
      </>)}
    </div>
  );
}

export default function OptionsDashboard() {
  const { T } = useTheme();
  // Default to TLT (optionable 30-yr Treasury proxy) so the chart AND the strike
  // chain both populate on first load; ZB=F futures are one dropdown pick away.
  const [symbol, setSymbol] = useState("TLT");
  const [input, setInput] = useState("");
  const font = T.fontMono;
  const inp = { minHeight: 42, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: font, fontSize: 14 };
  const apply = () => { const s = input.trim().toUpperCase(); if (s) { setSymbol(s); setInput(""); } };

  return (
    <div role="region" aria-label="Options dashboard">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Options Dashboard</h2>
        <span style={{ color: T.textDim, fontSize: 12 }}>price trend + strikes/expirations for any symbol (incl. US Treasuries)</span>
      </div>

      {/* Symbol picker: grouped dropdown + free-text for anything else */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={CATALOG_SYMBOLS.has(symbol) ? symbol : ""} onChange={(e) => { if (e.target.value) setSymbol(e.target.value); }}
          aria-label="Select a symbol" style={{ ...inp, flex: 1, minWidth: 220, cursor: "pointer" }}>
          <option value="">Choose a symbol…</option>
          {SYMBOL_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map(([s, name]) => <option key={s} value={s}>{s} — {name}</option>)}
            </optgroup>
          ))}
        </select>
        <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>or</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} placeholder="type any symbol" style={{ ...inp, width: 160 }} />
        <button onClick={apply} style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 700, border: `1px solid ${T.accent}`, background: T.accent, color: "#0A0A0A" }}>Load</button>
      </div>

      <TrendChart symbol={symbol} T={T} />
      <MinuteCompareChart symbol={symbol} />
      <StrikesBrowser symbol={symbol} T={T} onUseTLT={() => setSymbol("TLT")} />
    </div>
  );
}
