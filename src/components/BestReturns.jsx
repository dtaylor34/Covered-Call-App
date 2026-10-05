// ─── src/components/BestReturns.jsx ──────────────────────────────────────────
// Three one-click covered-call strategies for the current symbol, scored on the
// live option chain by the getBestReturns Cloud Function (see best-returns-spec.md).
// Clicking a button applies its strike / expiry / premium to the Contract Cost
// section above (via onApply) and shows a plain-English recommendation note.

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { getBestReturns } from "../services/bestReturns";

const fmt$ = (n) => (n || n === 0 ? `$${Number(n).toFixed(2)}` : "—");
const fmtPct = (n) => (n || n === 0 ? `${Number(n).toFixed(1)}%` : "—");
const expText = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" }).toUpperCase();
};

// Strategy metadata — keyed to the fields getBestReturns returns.
const STRATEGIES = [
  {
    key: "bestReturn", label: "Best Return", emoji: "🚀",
    blurb: "Highest annualized premium (21–60 DTE). Most income, but a nearer strike means a higher chance of being called away.",
  },
  {
    key: "noSale", label: "Best No-Sale Return", emoji: "🛡️",
    blurb: "7–15% out-of-the-money. Collect solid premium while keeping a low chance your shares get called away — best when you want to hold.",
  },
  {
    key: "sale", label: "Best Sale Return", emoji: "💰",
    blurb: "0–4% out-of-the-money. You're happy to sell: premium plus the gain up to the strike maximizes your total return if assigned.",
  },
];

export default function BestReturns({ symbol, contracts, onApply }) {
  const { T } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true); setError(""); setData(null); setSelected(null);
    try {
      const res = await getBestReturns(symbol, contracts || 1);
      setData(res);
    } catch (e) {
      setError(e?.message || "Could not score returns. Try again shortly.");
    } finally { setLoading(false); }
  }, [symbol, contracts]);

  // Fetch automatically whenever the symbol changes.
  useEffect(() => { load(); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (strat) => {
    const pick = data?.[strat.key];
    if (!pick) return;
    const prem = pick.prem || pick.bid || 0;
    onApply?.(pick.strike, prem, pick.exp, "call");
    setSelected(strat.key);
  };

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const font = T.fontMono, displayFont = T.fontDisplay;

  const summaryLine = (pick, isSel) => {
    if (!pick) return "No qualifying strike in this band";
    const premSh = pick.prem || pick.bid;
    const otm = pick.otmPct != null ? ` · ${pick.otmPct.toFixed(1)}% OTM` : "";
    const total = pick.totalPremium != null ? pick.totalPremium : premSh * 100 * (data?.contracts || 1);
    return (
      <>
        {`$${pick.strike} · ${expText(pick.exp)} · ${pick.dte}d · ${fmt$(premSh)}/sh · ${fmtPct(pick.annualized)} ann${otm}`}
        {" "}
        <span style={{ color: isSel ? "rgba(10,10,10,0.6)" : (T.textMuted || T.textDim), fontWeight: 700 }}>· ${Math.round(total).toLocaleString()} PR</span>
      </>
    );
  };

  const chosen = selected ? data?.[selected] : null;
  const chosenMeta = STRATEGIES.find((s) => s.key === selected);

  return (
    <div style={card} role="region" aria-label="Best returns">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ color: T.text, fontFamily: displayFont, fontSize: 16, margin: 0, fontWeight: 600 }}>Best Returns</h3>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>live chain · {symbol}</span>
        </div>
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textDim, cursor: loading ? "default" : "pointer", fontFamily: font, fontSize: 11, padding: "4px 10px", borderRadius: 6, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Scoring…" : "↻ Refresh"}
        </button>
      </div>

      {error ? (
        <div style={{ color: T.danger, fontSize: 12, fontFamily: font }}>{error}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {STRATEGIES.map((s) => {
            const pick = data?.[s.key];
            const isSel = selected === s.key;
            const disabled = loading || !pick;
            return (
              <button key={s.key} onClick={() => apply(s)} disabled={disabled} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 9, cursor: disabled ? "default" : "pointer",
                background: isSel ? T.accent : T.card, color: isSel ? "#0A0A0A" : T.text,
                border: `1px solid ${isSel ? T.accent : T.border}`, opacity: disabled && !isSel ? 0.55 : 1,
                transition: "all 0.15s", fontFamily: font,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{s.emoji} {s.label}</div>
                <div style={{ fontSize: 11, lineHeight: 1.45, color: isSel ? "#0A0A0A" : T.textDim }}>
                  {loading ? "Scoring…" : summaryLine(pick, isSel)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Recommendation note for the selected strategy */}
      {chosen && chosenMeta && (
        <div style={{ marginTop: 12, padding: 12, background: T.profitDim || `${T.accent}14`, borderRadius: 8, border: `1px solid ${T.accent}33` }}>
          <div style={{ color: T.accent, fontFamily: font, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {chosenMeta.emoji} {chosenMeta.label} — applied
          </div>
          <div style={{ color: T.text, fontFamily: font, fontSize: 12, lineHeight: 1.6 }}>
            Sell {data.contracts}× <strong>${chosen.strike}</strong> call{data.contracts > 1 ? "s" : ""} expiring <strong>{expText(chosen.exp)}</strong> ({chosen.dte}d) for ~<strong>{fmt$((chosen.prem || chosen.bid) * 100 * data.contracts)}</strong> total premium (<strong>{fmtPct(chosen.annualized)}</strong> annualized).
            {chosen.gtc != null && <> Suggested buy-to-close GTC at <strong>{fmt$(chosen.gtc)}</strong>.</>}
            {selected === "sale" && chosen.stockGain > 0 && <> If assigned you also keep <strong>{fmt$(chosen.stockGain)}</strong> of stock gain up to the strike.</>}
          </div>
          <div style={{ color: T.textDim, fontFamily: font, fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>{chosenMeta.blurb}</div>
        </div>
      )}

      {!loading && !error && data && !data.bestReturn && !data.noSale && !data.sale && (
        <div style={{ color: T.textDim, fontSize: 12, fontFamily: font, marginTop: 10 }}>
          No liquid strikes qualified for {symbol} right now (wide spreads or thin bids). Try again during market hours.
        </div>
      )}
    </div>
  );
}
