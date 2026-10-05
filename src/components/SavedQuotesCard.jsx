// ─── src/components/SavedQuotesCard.jsx ──────────────────────────────────────
// Dashboard card listing staged covered-call "quotes" (paper — not sent to a
// broker). Each row: copy a thinkorswim order string to place it for real,
// promote it to Working once filled, or remove it.

import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useSavedQuotes } from "../hooks/useSavedQuotes";
import { usePositions } from "../hooks/usePositions";
import { tosCoveredCallOrder } from "../lib/tos";

const dte = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); if (!y) return null; return Math.round((new Date(y, m - 1, d) - new Date()) / 86400000); };
const money = (v) => `$${(Number(v) || 0).toFixed(2)}`;

export default function SavedQuotesCard() {
  const { T } = useTheme();
  const { quotes, loading, removeQuote } = useSavedQuotes();
  const { savePosition } = usePositions();
  const [copied, setCopied] = useState(null);
  const [msg, setMsg] = useState(null);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const font = T.fontMono, displayFont = T.fontDisplay;
  const chip = { padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700, border: `1px solid ${T.border}`, background: T.card, color: T.text };

  const copyOrder = async (q) => {
    const order = tosCoveredCallOrder(q);
    try { await navigator.clipboard.writeText(order); setCopied(q.id); setTimeout(() => setCopied(null), 2000); }
    catch { setMsg({ ok: false, text: order }); }
  };
  const promote = async (q) => {
    const res = await savePosition({
      sym: q.sym, contracts: q.contracts, strike: q.strike, expiry: q.expiry,
      fillStock: q.stockPrice, fillCall: q.premium, gtc: q.gtc, iv: q.iv,
      liveStock: q.stockPrice, liveCall: q.premium,
    });
    if (res.ok) { await removeQuote(q.id); setMsg({ ok: true, text: `${q.sym} $${q.strike} moved to Working.` }); }
    else setMsg({ ok: false, text: res.missing ? `Need: ${res.missing.join(", ")}` : (res.error || "Couldn't promote.") });
    setTimeout(() => setMsg(null), 5000);
  };

  return (
    <div style={card} role="region" aria-label="Saved quotes">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ color: T.text, fontFamily: displayFont, fontSize: 18, margin: 0 }}>Saved Quotes</h3>
          <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>staged covered calls · paper</span>
        </div>
        <span style={{ color: T.textDim, fontSize: 12, fontFamily: font }}>{quotes.length} saved</span>
      </div>

      {msg && <div style={{ color: msg.ok ? T.success : T.danger, fontFamily: font, fontSize: 12, marginBottom: 10, wordBreak: "break-all" }}>{msg.text}</div>}

      {loading ? (
        <div style={{ color: T.textDim, fontSize: 13 }}>Loading…</div>
      ) : quotes.length === 0 ? (
        <div style={{ color: T.textDim, fontSize: 13, lineHeight: 1.6 }}>
          No saved quotes yet. On the <b>Selection</b> tab, build a covered call (symbol → strike → expiration → tap a Bid) and hit <b>“📝 Save Quote.”</b> It'll show up here to copy into thinkorswim or promote to Working.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {quotes.map((q) => {
            const d = dte(q.expiry);
            const total = (Number(q.premium) || 0) * 100 * (Number(q.contracts) || 1);
            return (
              <div key={q.id} style={{ border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", background: T.card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ color: T.text, fontFamily: font, fontSize: 14, fontWeight: 700 }}>
                    {q.contracts}× {q.sym} <span style={{ color: T.accent }}>${q.strike}</span> CALL
                    <span style={{ color: T.textDim, fontWeight: 400 }}> · exp {q.expiry}{d != null ? ` (${d}d)` : ""}</span>
                  </div>
                  <div style={{ color: T.success, fontFamily: font, fontSize: 13, fontWeight: 700 }}>{money(q.premium)}/sh · {money(total)} total</div>
                </div>
                <div style={{ color: T.textDim, fontFamily: font, fontSize: 11, marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span>stock {money(q.stockPrice)}</span>
                  {q.gtc > 0 && <span>GTC buy-back {money(q.gtc)}</span>}
                  {q.iv > 0 && <span>IV {(q.iv * 100).toFixed(0)}%</span>}
                </div>
                {/* TOS order preview */}
                <div style={{ marginTop: 8, padding: "7px 10px", background: T.inputBg || T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.textDim, fontFamily: font, fontSize: 11, wordBreak: "break-all" }}>
                  {tosCoveredCallOrder(q)}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => copyOrder(q)} title="Copies this order string. Paste it into the thinkorswim order entry — it stages the ticket; you review and Send it yourself. Nothing is sent from here." style={{ ...chip, borderColor: T.accent, color: copied === q.id ? "#0A0A0A" : T.accent, background: copied === q.id ? T.accent : T.card }}>
                    {copied === q.id ? "✓ Copied — paste in thinkorswim" : "📋 Copy Order"}
                  </button>
                  <button onClick={() => promote(q)} style={chip}>→ Move to Working</button>
                  <button onClick={() => removeQuote(q.id)} style={{ ...chip, color: T.danger, borderColor: `${T.danger}55` }}>✕ Remove</button>
                </div>
                <div style={{ color: T.textMuted || T.textDim, fontFamily: font, fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>
                  Paste into thinkorswim (Schwab's platform) → it stages the order for you to review and send. The API can't stage orders, so nothing is ever sent from this app.
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
