// ─── src/components/OptionChain.jsx ──────────────────────────────────────────
// thinkorswim-style option chain: pick an expiration (month), see the strike
// ladder with Calls | Strike | Puts (Last / Bid / Ask). ATM row highlighted,
// ITM cells tinted. Click a call to prefill a covered call (onPickStrike).
// Data via the existing market-data chain API (Yahoo; delayed).

import { useState, useMemo, useEffect, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useExpirations, useOptionsChain } from "../hooks/useMarketData";

const px = (n) => (n > 0 ? n.toFixed(2) : "—");
const expMeta = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return { text: iso || "", dte: 0 };
  const date = new Date(y, m - 1, d);
  const dte = Math.max(0, Math.round((date - new Date()) / 86400000));
  return { text: date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" }).toUpperCase(), dte };
};

export default function OptionChain({ symbol, onPickStrike, highlightStrike, highlightExpiration, highlightSide = "call" }) {
  const { T } = useTheme();
  const { expirations } = useExpirations(symbol);
  const [exp, setExp] = useState(null);
  const atmRef = useRef(null);
  const hiRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => { setExp(null); }, [symbol]);              // reset on symbol change
  useEffect(() => { if (expirations?.length && !exp) setExp(expirations[0]); }, [expirations, exp]);
  // Follow the Position Setup's expiration when it's a real chain expiration.
  useEffect(() => {
    if (highlightExpiration && (expirations || []).includes(highlightExpiration) && highlightExpiration !== exp) setExp(highlightExpiration);
  }, [highlightExpiration, expirations]); // eslint-disable-line

  const { chain, loading, error } = useOptionsChain(symbol, exp);
  const under = chain?.underlyingPrice || 0;
  const key = exp || (chain?.chain ? Object.keys(chain.chain)[0] : null);
  const legs = key ? chain?.chain?.[key] : null;

  const rows = useMemo(() => {
    if (!legs) return [];
    const byStrike = {};
    (legs.calls || []).forEach((c) => { byStrike[c.strike] = { strike: c.strike, call: c }; });
    (legs.puts || []).forEach((p) => { byStrike[p.strike] = { ...(byStrike[p.strike] || { strike: p.strike }), put: p }; });
    return Object.values(byStrike).sort((a, b) => a.strike - b.strike);
  }, [legs]);

  const atm = useMemo(() => {
    if (!rows.length || !under) return null;
    return rows.reduce((best, r) => (Math.abs(r.strike - under) < Math.abs(best.strike - under) ? r : best)).strike;
  }, [rows, under]);

  // Center the ATM/highlighted row WITHIN the chain's own scroll box only — never
  // call scrollIntoView (it scrolls the page too, yanking the view down to the
  // chain when the strike is set from the Best Returns buttons above).
  useEffect(() => {
    const row = hiRef.current || atmRef.current, box = boxRef.current;
    if (!row || !box) return;
    const rowRect = row.getBoundingClientRect(), boxRect = box.getBoundingClientRect();
    const delta = (rowRect.top - boxRect.top) - (box.clientHeight / 2 - rowRect.height / 2);
    box.scrollTo({ top: box.scrollTop + delta, behavior: "smooth" });
  }, [atm, exp, highlightStrike]);

  if (!symbol) return null;

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const COLS = "1fr 1fr 1fr 84px 1fr 1fr 1fr";
  const th = { color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 0.5, textTransform: "uppercase", textAlign: "right", padding: "6px 8px" };
  const cell = { fontFamily: T.fontMono, fontSize: 12, textAlign: "right", padding: "5px 8px", whiteSpace: "nowrap" };

  return (
    <div style={card} role="region" aria-label={`Option chain for ${symbol}`}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Option chain</h3>
        <span style={{ color: T.text, fontFamily: T.fontMono, fontWeight: 700 }}>{symbol}</span>
        {under > 0 && <span style={{ color: T.accent, fontFamily: T.fontMono, fontSize: 13 }}>${under.toFixed(2)}</span>}
        <span style={{ color: T.textDim, fontSize: 11 }}>15-min delayed</span>
      </div>

      {/* Expiration (month) selector */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
        {(expirations || []).map((e) => {
          const { text, dte } = expMeta(e);
          const on = e === (exp || key);
          return (
            <button key={e} onClick={() => setExp(e)} style={{
              flexShrink: 0, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontFamily: T.fontMono, fontSize: 12,
              border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accentDim : T.card, color: on ? T.accent : T.textDim,
            }}>
              {text} <span style={{ opacity: 0.7 }}>· {dte}d</span>
            </button>
          );
        })}
      </div>

      {loading && !rows.length ? (
        <div style={{ color: T.textDim, padding: "20px 0" }}>Loading chain…</div>
      ) : error ? (
        <div style={{ color: T.danger, padding: "20px 0" }}>{error}</div>
      ) : !rows.length ? (
        <div style={{ color: T.textDim, padding: "20px 0" }}>No options for this symbol / expiration.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: COLS, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.surface }}>
              <div style={{ ...th, gridColumn: "1 / 4", textAlign: "center", color: T.success }}>CALLS</div>
              <div style={{ ...th, textAlign: "center" }}>STRIKE</div>
              <div style={{ ...th, gridColumn: "5 / 8", textAlign: "center", color: T.danger }}>PUTS</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: COLS, borderBottom: `1px solid ${T.border}` }}>
              {["Last", "Bid", "Ask", "", "Bid", "Ask", "Last"].map((h, i) => (
                <div key={i} style={{ ...th, textAlign: i === 3 ? "center" : "right" }}>{h}</div>
              ))}
            </div>
            {/* Rows (scrollable, centered on ATM) */}
            <div ref={boxRef} style={{ maxHeight: 440, overflowY: "auto" }}>
              {rows.map((r) => {
                const isAtm = r.strike === atm;
                const isHi = highlightStrike != null && Number(r.strike) === Number(highlightStrike);
                const callItm = under > 0 && r.strike < under;
                const putItm = under > 0 && r.strike > under;
                // bid=true → the "sell here" price; emphasized + highlighted when selected on that side
                const callCell = (price, bid) => {
                  const hiBid = bid && isHi && highlightSide === "call" && price > 0;
                  return (
                    <div onClick={() => r.call && price > 0 && onPickStrike?.(r.strike, price, key, "call")}
                      title={r.call && price > 0 ? "Use as your call premium" : undefined}
                      style={{ ...cell, cursor: r.call && price > 0 ? "pointer" : "default",
                        background: hiBid ? T.success : (callItm ? `${T.success}12` : "transparent"),
                        color: hiBid ? "#0A0A0A" : (bid ? T.success : T.text), fontWeight: bid ? 700 : 400 }}>
                      {px(price)}
                    </div>
                  );
                };
                const putCell = (price, bid) => {
                  const hiBid = bid && isHi && highlightSide === "put" && price > 0;
                  return (
                    <div onClick={() => r.put && price > 0 && onPickStrike?.(r.strike, price, key, "put")}
                      title={r.put && price > 0 ? "Use as your put premium" : undefined}
                      style={{ ...cell, cursor: r.put && price > 0 ? "pointer" : "default",
                        background: hiBid ? T.danger : (putItm ? `${T.danger}12` : "transparent"),
                        color: hiBid ? "#0A0A0A" : (bid ? T.danger : T.textDim), fontWeight: bid ? 700 : 400 }}>
                      {px(price)}
                    </div>
                  );
                };
                return (
                  <div key={r.strike} ref={isHi ? hiRef : (isAtm ? atmRef : null)} style={{
                    display: "grid", gridTemplateColumns: COLS, alignItems: "center",
                    background: isHi ? `${T.accent}22` : (isAtm ? T.accentDim : "transparent"),
                    boxShadow: isHi ? `inset 3px 0 0 ${T.accent}` : "none",
                    borderBottom: `1px solid ${T.border}22`,
                  }}>
                    {callCell(r.call?.lastPrice, false)}
                    {callCell(r.call?.bid, true)}
                    {callCell(r.call?.ask, false)}
                    <div style={{ ...cell, textAlign: "center", fontWeight: 700, color: isHi || isAtm ? T.accent : T.text, borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}` }}>
                      {r.strike}
                    </div>
                    {putCell(r.put?.bid, true)}
                    {putCell(r.put?.ask, false)}
                    {putCell(r.put?.lastPrice, false)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {onPickStrike && <div style={{ color: T.textDim, fontSize: 11, marginTop: 8 }}>Tip: click a <span style={{ color: T.success, fontWeight: 700 }}>call Bid</span> (green) or <span style={{ color: T.danger, fontWeight: 700 }}>put Bid</span> (red) to set that strike + premium in the Contract Cost above.</div>}
    </div>
  );
}
