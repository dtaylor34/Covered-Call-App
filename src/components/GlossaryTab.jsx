// ─── src/components/GlossaryTab.jsx ───────────────────────────────────────────
import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

const Card = ({ children, style }) => {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: "20px 24px", marginBottom: 16, ...style,
    }}>{children}</div>
  );
};

const TERMS = [
  { category: "Core Concepts", items: [
    { term: "Covered Call", def: "An options strategy where you own the underlying stock and sell call options against it to generate income from premiums. 'Covered' because you hold the shares to deliver if assigned." },
    { term: "Premium", def: "The price paid by the option buyer to the seller. This is your income when selling covered calls. Quoted per share, so multiply by 100 for the per-contract value." },
    { term: "Strike Price", def: "The price at which the option buyer can purchase your shares if they exercise. Choosing the right strike balances income vs. risk of being called away." },
    { term: "Expiration Date", def: "The date the option contract expires. After this, the contract is worthless. Weekly, monthly, and LEAPS expirations are available." },
    { term: "Contract", def: "One options contract represents 100 shares. If you own 200 shares, you can sell 2 contracts." },
    { term: "Underlying", def: "The stock that the option is based on. For covered calls, you must own the underlying shares." },
  ]},
  { category: "Position Status", items: [
    { term: "ITM (In The Money)", def: "When the stock price is above the call's strike price. Higher risk of assignment. The call has intrinsic value." },
    { term: "OTM (Out of The Money)", def: "When the stock price is below the strike. The ideal zone for covered call sellers — the call has no intrinsic value and will expire worthless if it stays OTM." },
    { term: "ATM (At The Money)", def: "When the stock price equals the strike price. Highest time value (theta) decay rate." },
    { term: "Deep ITM / Deep OTM", def: "Significantly above or below the strike. Deep OTM calls are very safe but low premium. Deep ITM calls have high premium but near-certain assignment." },
  ]},
  { category: "The Greeks", items: [
    { term: "Delta (Δ)", def: "How much the option price changes per $1 move in the stock. A delta of 0.30 means the option gains $0.30 for each $1 stock increase. For covered calls, lower delta = less assignment risk." },
    { term: "Theta (Θ)", def: "Time decay — how much the option loses per day just from time passing. Theta works in your favor as a seller. It accelerates as expiration approaches." },
    { term: "Gamma (Γ)", def: "Rate of change of delta. High gamma near ATM means delta can shift rapidly with small stock moves." },
    { term: "Vega (ν)", def: "Sensitivity to implied volatility. Higher vega = option price reacts more to volatility changes. Selling when vega is high means larger premiums." },
    { term: "Rho (ρ)", def: "Sensitivity to interest rate changes. Generally minor for short-dated options." },
  ]},
  { category: "Volatility", items: [
    { term: "IV (Implied Volatility)", def: "The market's forecast of future stock movement, derived from option prices. Higher IV = higher premiums = better for sellers. IV typically spikes before earnings." },
    { term: "HV (Historical Volatility)", def: "How much the stock actually moved over a past period. Compare HV to IV — if IV > HV, options may be overpriced (good for selling)." },
    { term: "IV Rank / IV Percentile", def: "Where current IV falls relative to its historical range. High IV rank = premiums are elevated relative to the stock's normal behavior." },
    { term: "Volatility Crush", def: "A sharp drop in IV after a known event (earnings, FDA decision). Sellers benefit because option prices deflate even if the stock doesn't move much." },
  ]},
  { category: "Actions & Orders", items: [
    { term: "Sell to Open (STO)", def: "Opening a new short position — this is what you do when selling a covered call. You receive the premium." },
    { term: "Buy to Close (BTC)", def: "Closing your short option by buying it back before expiration. You pay the current option price. Profit = premium received - buyback cost." },
    { term: "Rolling", def: "Closing your current call and simultaneously opening a new one at a different strike or expiration. Roll up (higher strike), roll out (later date), or both." },
    { term: "Assignment", def: "When the option buyer exercises their right and your shares are sold at the strike price. Usually happens at expiration if ITM, but can happen early." },
    { term: "GTC (Good Till Canceled)", def: "An order that stays active until filled or manually canceled. Use GTC for buyback orders so they auto-execute when premium hits your target." },
    { term: "Limit Order", def: "An order to buy or sell at a specific price or better. Always use limit orders for options — never market orders." },
  ]},
  { category: "Analysis & Metrics", items: [
    { term: "Annualized Return", def: "Premium yield projected over a full year. Calculated as (premium / stock price) × (365 / days to expiry). Helps compare contracts with different timeframes." },
    { term: "Breakeven Price", def: "Your stock purchase price minus premium received. The stock can drop to this level before you start losing money on the overall position." },
    { term: "Max Profit", def: "Premium collected + (strike price - stock price) × 100 per contract. Achieved when the stock is at or above the strike at expiration." },
    { term: "Cost Basis Reduction", def: "Each premium collected lowers your effective purchase price. Over multiple cycles, this can significantly reduce your cost basis." },
    { term: "Probability of Profit (POP)", def: "The statistical likelihood of keeping the premium. Roughly estimated as (1 - delta) for OTM calls." },
  ]},
  { category: "Strategies", items: [
    { term: "Wheel Strategy", def: "Sell cash-secured puts → get assigned → sell covered calls → get called away → repeat. A systematic income generation cycle." },
    { term: "Collar", def: "Covered call + protective put. Caps both upside and downside. Used for portfolio protection during uncertain markets." },
    { term: "Poor Man's Covered Call", def: "Using a deep ITM LEAPS call instead of owning shares, then selling short-term calls against it. Requires less capital than traditional covered calls." },
    { term: "Buy-Write", def: "Simultaneously buying shares and selling a covered call in one transaction. Some brokers offer this as a single order type." },
  ]},
];

export default function GlossaryTab() {
  const { T } = useTheme();
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? TERMS.map((cat) => ({
        ...cat,
        items: cat.items.filter((t) =>
          t.term.toLowerCase().includes(filter.toLowerCase()) ||
          t.def.toLowerCase().includes(filter.toLowerCase())
        ),
      })).filter((cat) => cat.items.length > 0)
    : TERMS;

  const totalTerms = TERMS.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <div role="region" aria-label="Covered calls glossary">
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span aria-hidden="true" style={{ fontSize: 16 }}>📖</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Glossary</h3>
          <span aria-label={`${totalTerms} terms available`} style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono }}>{totalTerms} terms</span>
        </div>
        <input
          type="text" placeholder="Search terms, abbreviations, definitions..."
          aria-label="Search glossary terms"
          value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: T.card, border: `1px solid ${T.border}`, color: T.text,
            fontFamily: T.fontBody, outline: "none", boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => e.target.style.borderColor = T.accent}
          onBlur={(e) => e.target.style.borderColor = T.border}
        />
      </Card>

      {filtered.map((cat) => (
        <Card key={cat.category}>
          <div style={{ color: T.accent, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
            {cat.category}
          </div>
          {cat.items.map((t, i) => (
            <div key={i} style={{
              padding: "12px 0",
              borderBottom: i < cat.items.length - 1 ? `1px solid ${T.border}` : "none",
            }}>
              <div style={{ color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.fontDisplay, marginBottom: 4 }}>{t.term}</div>
              <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.6 }}>{t.def}</div>
            </div>
          ))}
        </Card>
      ))}

      {filtered.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ color: T.textDim, fontSize: 13 }}>No terms match "{filter}"</div>
          </div>
        </Card>
      )}
    </div>
  );
}
