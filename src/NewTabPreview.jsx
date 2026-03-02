// ─── src/components/NewTabPreview.jsx ─────────────────────────────────────────
// Preview component for the "New" tab. Contains a dropdown to select between
// different prototype views: Search History, Working, Risk, Transactions,
// Glossary, and Setup. Each shows a functional preview of the planned feature.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStockQuote } from "../hooks/useMarketData";
import { useTheme } from "../contexts/ThemeContext";

// ── Shared styled components ──
const Card = ({ children, style }) => (
  <div style={{
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
    padding: "20px 24px", marginBottom: 16, ...style,
  }}>{children}</div>
);

const Badge = ({ children, color, style }) => (
  <span style={{
    padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
    fontFamily: T.fontMono, letterSpacing: 0.5,
    background: color + "18", color, ...style,
  }}>{children}</span>
);

const SectionTitle = ({ icon, title, subtitle }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>{title}</h3>
    </div>
    {subtitle && <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontBody, marginTop: 4, marginLeft: 24 }}>{subtitle}</div>}
  </div>
);

// ─── VIEW DEFINITIONS ────────────────────────────────────────────────────────

const VIEWS = [
  { id: "history", label: "📋 Search History", tier: "basic" },
  { id: "working", label: "📊 Working (P&L Analysis)", tier: "advanced" },
  { id: "risk", label: "⚠ Risk Scenarios", tier: "advanced" },
  { id: "transactions", label: "📝 Transactions Log", tier: "advanced" },
  { id: "glossary", label: "📖 Glossary", tier: "basic" },
  { id: "setup", label: "🔧 Broker Setup Guides", tier: "expert" },
];

const TIER_COLORS = {
  basic: T.accent,
  advanced: T.pro,
  expert: T.owner,
};

// ─── SEARCH HISTORY VIEW (inline, not separate page) ─────────────────────────

function HistoryView() {
  const { T } = useTheme();
  const { searchHistory, deleteFromSearchHistory, clearSearchHistory } = useAuth();
  const navigate = useNavigate();
  const [confirmClear, setConfirmClear] = useState(false);
  const history = useMemo(() => searchHistory || [], [searchHistory]);

  if (history.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ color: T.text, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No search history yet</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>Search for a stock symbol on the Dashboard tab to start building your research history.</div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card style={{ padding: "12px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono }}>
            {history.length} saved search{history.length !== 1 ? "es" : ""}
          </div>
          {confirmClear ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { clearSearchHistory(); setConfirmClear(false); }} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                background: T.dangerDim, border: `1px solid ${T.danger}33`, color: T.danger, cursor: "pointer",
              }}>Yes, clear all</button>
              <button onClick={() => setConfirmClear(false)} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 10,
                background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer",
              }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 10,
              background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer",
            }}>Clear All</button>
          )}
        </div>
      </Card>

      {history.map((entry, i) => {
        const contract = entry.selectedContract;
        const timestamp = entry.updatedAt || entry.searchedAt;
        const timeAgo = timestamp ? getTimeAgo(timestamp) : "";

        return (
          <Card key={entry.symbol + "-" + i} style={{ cursor: "pointer", transition: "border-color 0.2s" }}
            onClick={() => navigate(`/?symbol=${entry.symbol}`, { state: { symbol: entry.symbol, selectedContract: contract } })}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = T.borderActive}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = T.border}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Badge color={T.accent} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 900 }}>
                  {entry.symbol}
                </Badge>
                {entry.stockPrice && (
                  <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>
                    ${Number(entry.stockPrice).toFixed(2)}
                  </span>
                )}
                {contract && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: T.textDim, fontSize: 10 }}>→</span>
                    <Badge color={T.pro}>${contract.strike} strike</Badge>
                    {contract.premium && <Badge color={T.success}>${contract.premium} premium</Badge>}
                    {contract.expiration && <Badge color={T.textDim}>{contract.expiration}</Badge>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: T.textMuted, fontSize: 10, fontFamily: T.fontMono }}>{timeAgo}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteFromSearchHistory(entry.symbol); }} style={{
                  padding: "4px 8px", borderRadius: 4, fontSize: 10,
                  background: "transparent", border: "none", color: T.textMuted, cursor: "pointer",
                }}>✕</button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── WORKING VIEW (P&L Analysis Preview) ────────────────────────────────────

function WorkingView() {
  const { T } = useTheme();
  const { searchHistory } = useAuth();
  const lastSymbol = searchHistory?.[0]?.symbol || null;
  const lastContract = searchHistory?.[0]?.selectedContract || null;
  const { quote } = useStockQuote(lastSymbol);

  const stockPrice = quote?.price || lastContract?.stockPrice || 0;
  const strike = lastContract?.strike || 0;
  const premium = lastContract?.premium || 0;
  const premiumPerShare = premium / 100;

  // Generate P&L rows from -15% to +15%
  const rows = [];
  for (let pct = -15; pct <= 15; pct++) {
    const price = stockPrice * (1 + pct / 100);
    // Simplified option value estimate (not Black-Scholes, just intrinsic + rough time value)
    const intrinsic = Math.max(0, price - strike);
    const timeValue = Math.max(0, premiumPerShare * 0.3 * (1 - Math.abs(pct) / 20));
    const optionValue = intrinsic + timeValue;
    const buybackPerContract = optionValue * 100;
    const netPL = premium - buybackPerContract;
    const pctKept = premium > 0 ? ((premium - buybackPerContract) / premium) * 100 : 0;

    rows.push({ pct, price, optionValue, buybackPerContract, netPL, pctKept });
  }

  if (!lastSymbol) {
    return (
      <Card>
        <SectionTitle icon="📊" title="Working — P&L Analysis" subtitle="Search a symbol on the Dashboard first to see buyback analysis here" />
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>No active position — search a symbol on the Dashboard tab, select a contract, and it will appear here automatically.</div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Position Summary */}
      <Card>
        <SectionTitle icon="📊" title="Working — P&L Analysis" subtitle={`Analyzing ${lastSymbol} position`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 8 }}>
          {[
            { label: "STOCK PRICE", value: `$${stockPrice.toFixed(2)}`, color: T.accent },
            { label: "STRIKE", value: strike ? `$${strike}` : "—", color: T.text },
            { label: "PREMIUM", value: premium ? `$${premium.toFixed(0)}` : "—", color: T.success },
            { label: "PER SHARE", value: premiumPerShare ? `$${premiumPerShare.toFixed(2)}` : "—", color: T.text },
          ].map((s, i) => (
            <div key={i} style={{
              textAlign: "center", padding: "12px", borderRadius: 8,
              background: T.card, border: `1px solid ${T.border}`,
            }}>
              <div style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* P&L Buyback Table */}
      <Card>
        <SectionTitle icon="📈" title="Buyback P&L Table" subtitle="What happens at every 1% stock move" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.fontMono, fontSize: 11 }}>
            <thead>
              <tr>
                {["% Move", "Stock Price", "Option Value", "Buyback Cost", "Net P&L", "% Kept", "Status"].map((h) => (
                  <th key={h} style={{
                    textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${T.border}`,
                    color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isBold = r.pct % 5 === 0;
                const isCurrentPrice = r.pct === 0;
                const isProfit = r.netPL >= 0;
                const status = r.pctKept >= 70 ? "STRONG" : r.pctKept >= 40 ? "GOOD" : r.pctKept >= 0 ? "SLIM" : "OWES";
                const statusColor = r.pctKept >= 70 ? T.success : r.pctKept >= 40 ? T.accent : r.pctKept >= 0 ? T.warn : T.danger;

                return (
                  <tr key={r.pct} style={{
                    opacity: isBold ? 1 : 0.6,
                    background: isCurrentPrice ? T.accentDim : !isProfit ? T.dangerDim : "transparent",
                    borderLeft: isCurrentPrice ? `3px solid ${T.accent}` : "3px solid transparent",
                  }}>
                    <td style={{ textAlign: "right", padding: "6px 10px", color: r.pct > 0 ? T.success : r.pct < 0 ? T.danger : T.accent, fontWeight: isBold ? 700 : 400 }}>
                      {r.pct > 0 ? "+" : ""}{r.pct}%
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px", color: T.text, fontWeight: isBold ? 700 : 400 }}>
                      ${r.price.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px", color: T.textDim }}>
                      ${r.optionValue.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px", color: T.textDim }}>
                      ${r.buybackPerContract.toFixed(0)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px", color: isProfit ? T.success : T.danger, fontWeight: 700 }}>
                      {r.netPL >= 0 ? "+" : ""}${r.netPL.toFixed(0)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px", color: isProfit ? T.success : T.danger }}>
                      {r.pctKept.toFixed(0)}%
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px" }}>
                      <Badge color={statusColor}>{status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* What Should I Do */}
      <Card>
        <SectionTitle icon="🎯" title="What Should I Do Right Now?" subtitle="Dynamic guidance based on current position" />
        {(() => {
          if (!strike || !stockPrice) return <div style={{ color: T.textDim, fontSize: 12 }}>Select a contract on the Dashboard to see guidance.</div>;
          const pctFromStrike = ((stockPrice - strike) / strike) * 100;
          let urgency, color, advice;
          if (pctFromStrike < -5) {
            urgency = "LOW"; color = T.success;
            advice = `Stock is ${Math.abs(pctFromStrike).toFixed(1)}% below strike. Your position is safe. Hold and let time decay work in your favor.`;
          } else if (pctFromStrike < -2) {
            urgency = "MODERATE"; color = T.accent;
            advice = `Stock is ${Math.abs(pctFromStrike).toFixed(1)}% below strike. Position is comfortable but worth monitoring. Consider setting a GTC buyback order.`;
          } else if (pctFromStrike < 0) {
            urgency = "ELEVATED"; color = T.warn;
            advice = `Stock is only ${Math.abs(pctFromStrike).toFixed(1)}% from your strike. Consider closing for profit if you've captured 60%+ of premium.`;
          } else {
            urgency = "HIGH"; color = T.danger;
            advice = `Stock is ${pctFromStrike.toFixed(1)}% ABOVE your strike. Risk of assignment is high. Consider buying back immediately or rolling to a higher strike.`;
          }
          return (
            <div style={{ padding: "16px", background: color + "12", border: `1px solid ${color}33`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Badge color={color}>{urgency} URGENCY</Badge>
              </div>
              <div style={{ color: T.text, fontSize: 13, lineHeight: 1.6 }}>{advice}</div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

// ─── RISK VIEW ──────────────────────────────────────────────────────────────

function RiskView() {
  const { T } = useTheme();
  const scenarios = [
    { title: "Stock Drops Significantly", severity: "HIGH", color: T.danger, icon: "📉",
      description: "If the stock drops well below your purchase price, the premium collected provides a small buffer but won't offset major losses.",
      action: "The covered call premium reduces your cost basis, but you still hold downside risk on the stock itself." },
    { title: "Stock Gets Called Away", severity: "MEDIUM", color: T.warn, icon: "📤",
      description: "If the stock rises above your strike at expiration, your shares will be sold at the strike price.",
      action: "You keep the premium but miss gains above the strike. This is the 'opportunity cost' risk of covered calls." },
    { title: "Stock Gaps Up on Earnings", severity: "HIGH", color: T.danger, icon: "⚡",
      description: "A sudden spike (e.g., earnings beat) can push the stock far past your strike, resulting in significant missed upside.",
      action: "Avoid selling calls through earnings unless you're okay with assignment. Or roll the call before the announcement." },
    { title: "Dividend Risk / Ex-Date Assignment", severity: "MEDIUM", color: T.warn, icon: "💰",
      description: "If your call is in-the-money near an ex-dividend date, the buyer may exercise early to capture the dividend.",
      action: "Watch for ex-dividend dates and consider closing positions beforehand if the call is ITM." },
    { title: "Liquidity Crunch", severity: "LOW", color: T.accent, icon: "🏜",
      description: "Illiquid options have wide bid-ask spreads, making it expensive to buy back your call.",
      action: "Stick to high-volume stocks and near-the-money strikes for better liquidity." },
    { title: "Market Crash / Black Swan", severity: "CRITICAL", color: T.danger, icon: "🦢",
      description: "A market-wide crash drops all stocks. Your call expires worthless (good) but your shares lose significant value (bad).",
      action: "The premium is yours to keep, but it's a small consolation. Consider protective puts if hedging against tail risk." },
  ];

  return (
    <div>
      <Card>
        <SectionTitle icon="⚠" title="Risk Scenarios" subtitle="What can go wrong and what to do about it" />
        <div style={{ color: T.textDim, fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
          Covered calls are considered one of the more conservative options strategies, but they're not risk-free.
          Understanding these scenarios helps you make better decisions about when to sell, close, or roll.
        </div>
      </Card>

      {scenarios.map((s, i) => (
        <Card key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.fontDisplay }}>{s.title}</div>
            </div>
            <Badge color={s.color}>{s.severity}</Badge>
          </div>
          <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>{s.description}</div>
          <div style={{
            padding: "10px 14px", borderRadius: 6, background: s.color + "0a",
            border: `1px solid ${s.color}22`, color: T.text, fontSize: 12, lineHeight: 1.5,
          }}>
            <strong style={{ color: s.color }}>What to do: </strong>{s.action}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── TRANSACTIONS VIEW ──────────────────────────────────────────────────────

function TransactionsView() {
  const { T } = useTheme();
  const { searchHistory } = useAuth();
  const [transactions, setTransactions] = useState([]);

  const logTransaction = (entry) => {
    const tx = {
      id: Date.now(),
      symbol: entry.symbol,
      stockPrice: entry.stockPrice,
      strike: entry.selectedContract?.strike,
      premium: entry.selectedContract?.premium,
      expiration: entry.selectedContract?.expiration,
      loggedAt: new Date().toISOString(),
    };
    setTransactions((prev) => [tx, ...prev]);
  };

  return (
    <div>
      <Card>
        <SectionTitle icon="📝" title="Transaction Log" subtitle="Log and track your covered call positions" />

        {/* Available to log from history */}
        {searchHistory?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
              Log from recent searches
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {searchHistory.filter((h) => h.selectedContract).map((entry, i) => (
                <button key={i} onClick={() => logTransaction(entry)} style={{
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  background: T.card, border: `1px solid ${T.border}`, color: T.text,
                  fontSize: 11, fontFamily: T.fontMono, transition: "border-color 0.2s",
                }}>
                  + {entry.symbol} ${entry.selectedContract.strike} ({entry.selectedContract.expiration?.slice(5)})
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Logged Transactions */}
      {transactions.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
            <div style={{ color: T.textDim, fontSize: 12 }}>No transactions logged yet. Search a symbol, select a contract, then log it here.</div>
          </div>
        </Card>
      ) : (
        transactions.map((tx) => (
          <Card key={tx.id}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Badge color={T.accent} style={{ fontSize: 12, padding: "5px 12px", fontWeight: 900 }}>{tx.symbol}</Badge>
                <Badge color={T.pro}>${tx.strike} strike</Badge>
                <Badge color={T.success}>${tx.premium} premium</Badge>
                <Badge color={T.textDim}>{tx.expiration}</Badge>
              </div>
              <span style={{ color: T.textMuted, fontSize: 10, fontFamily: T.fontMono }}>
                {new Date(tx.loggedAt).toLocaleString()}
              </span>
            </div>
          </Card>
        ))
      )}

      {/* Copy All for Docs */}
      {transactions.length > 0 && (
        <Card>
          <button onClick={() => {
            const text = transactions.map((tx) =>
              `${tx.symbol} | Strike: $${tx.strike} | Premium: $${tx.premium} | Exp: ${tx.expiration} | Logged: ${new Date(tx.loggedAt).toLocaleDateString()}`
            ).join("\n");
            navigator.clipboard.writeText(text);
          }} style={{
            width: "100%", padding: "12px", borderRadius: 8, cursor: "pointer",
            background: T.accentDim, border: `1px solid ${T.accent}33`, color: T.accent,
            fontSize: 12, fontWeight: 700, fontFamily: T.fontMono,
          }}>
            📋 Copy All for Google Docs
          </button>
        </Card>
      )}
    </div>
  );
}

// ─── GLOSSARY VIEW ──────────────────────────────────────────────────────────

function GlossaryView() {
  const { T } = useTheme();
  const [filter, setFilter] = useState("");

  const terms = [
    { category: "Core Concepts", items: [
      { term: "Covered Call", def: "An options strategy where you own the underlying stock and sell call options against it to generate income from premiums." },
      { term: "Premium", def: "The price paid by the option buyer to the seller. This is your income when selling covered calls." },
      { term: "Strike Price", def: "The price at which the option buyer can purchase your shares if they exercise the contract." },
      { term: "Expiration Date", def: "The date the option contract expires. After this date, the contract is worthless." },
      { term: "Contract", def: "One options contract represents 100 shares of the underlying stock." },
    ]},
    { category: "Position Status", items: [
      { term: "ITM (In The Money)", def: "When the stock price is above the call's strike price. Higher risk of assignment." },
      { term: "OTM (Out of The Money)", def: "When the stock price is below the call's strike price. The ideal zone for covered call sellers." },
      { term: "ATM (At The Money)", def: "When the stock price is approximately equal to the strike price." },
    ]},
    { category: "Greeks", items: [
      { term: "Delta (Δ)", def: "How much the option price changes per $1 move in the stock. For covered calls, lower delta = less risk of assignment." },
      { term: "Theta (Θ)", def: "Time decay — how much the option loses per day. Theta works in your favor as a seller." },
      { term: "Gamma (Γ)", def: "Rate of change of delta. High gamma means delta can shift rapidly." },
      { term: "Vega (ν)", def: "Sensitivity to volatility changes. Higher vega = option price reacts more to volatility shifts." },
      { term: "IV (Implied Volatility)", def: "The market's forecast of how much the stock will move. Higher IV = higher premiums." },
    ]},
    { category: "Actions", items: [
      { term: "Sell to Open (STO)", def: "Opening a new short position — this is what you do when selling a covered call." },
      { term: "Buy to Close (BTC)", def: "Closing your short option position by buying it back before expiration." },
      { term: "Rolling", def: "Closing your current call and opening a new one at a different strike or expiration." },
      { term: "Assignment", def: "When the option buyer exercises their right and your shares are sold at the strike price." },
      { term: "GTC (Good Till Canceled)", def: "An order type that stays active until filled or manually canceled. Common for buyback orders." },
    ]},
    { category: "Analysis", items: [
      { term: "Annualized Return", def: "The premium yield projected over a full year. Helps compare contracts with different expirations." },
      { term: "Breakeven Price", def: "Your stock purchase price minus the premium received. The stock can drop this far before you lose money." },
      { term: "Max Profit", def: "Premium collected + (strike - stock price) × shares. Achieved when stock is at or above strike at expiration." },
      { term: "Buyback", def: "Repurchasing the call option you sold to close the position before expiration." },
      { term: "Cost Basis", def: "Your effective purchase price after accounting for premiums received from selling calls." },
    ]},
  ];

  const filtered = filter
    ? terms.map((cat) => ({ ...cat, items: cat.items.filter((t) => t.term.toLowerCase().includes(filter.toLowerCase()) || t.def.toLowerCase().includes(filter.toLowerCase())) })).filter((cat) => cat.items.length > 0)
    : terms;

  return (
    <div>
      <Card>
        <SectionTitle icon="📖" title="Glossary" subtitle="Covered call terminology and definitions" />
        <input
          type="text" placeholder="Search terms..." value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 12,
            background: T.card, border: `1px solid ${T.border}`, color: T.text,
            fontFamily: T.fontBody, outline: "none", boxSizing: "border-box",
          }}
        />
      </Card>

      {filtered.map((cat) => (
        <Card key={cat.category}>
          <div style={{ color: T.accent, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            {cat.category}
          </div>
          {cat.items.map((t, i) => (
            <div key={i} style={{
              padding: "10px 0",
              borderBottom: i < cat.items.length - 1 ? `1px solid ${T.border}` : "none",
            }}>
              <div style={{ color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.fontDisplay, marginBottom: 3 }}>{t.term}</div>
              <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.5 }}>{t.def}</div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

// ─── SETUP / BROKER GUIDES VIEW ─────────────────────────────────────────────

function SetupView() {
  const { T } = useTheme();
  const [activeBroker, setActiveBroker] = useState("schwab");

  const brokers = [
    { id: "schwab", name: "Charles Schwab", color: "#00a3e0", icon: "🟦" },
    { id: "etrade", name: "E*TRADE / Morgan Stanley", color: "#6b21a8", icon: "🟪" },
    { id: "merrill", name: "Merrill Lynch", color: "#8b4513", icon: "🟫" },
    { id: "morgan", name: "Morgan Stanley", color: "#475569", icon: "⬛" },
  ];

  const guides = {
    schwab: {
      sell: [
        "Log into Schwab.com → Trade → Options",
        "Enter your stock symbol",
        "Select 'Sell to Open' as the action",
        "Choose your expiration date from the chain",
        "Select your strike price",
        "Set order type to 'Limit' and enter your premium price",
        "Set Time-in-Force to 'GTC' (Good Till Canceled)",
        "Review the order summary and submit",
      ],
      buyback: [
        "Navigate to your Positions page",
        "Click on the short call position",
        "Select 'Buy to Close'",
        "Set a limit price (your buyback target from the Working tab)",
        "Set as GTC order so it auto-executes when premium drops",
      ],
    },
    etrade: {
      sell: [
        "Open Power E*TRADE → Options Chain",
        "Enter stock symbol and select expiration",
        "Click the Bid price on your target strike to pre-fill Sell order",
        "Verify: Action = Sell to Open, Quantity = your contracts",
        "Set price type to Limit, enter premium target",
        "Duration: GTC",
        "Use the 'Exit Plan' feature to set automatic buyback",
        "Submit order",
      ],
      buyback: [
        "Use Power E*TRADE's Exit Plan (parachute icon)",
        "Set up an OCO (One-Cancels-Other) order",
        "Profit target: Buy to Close at your buyback %",
        "Stop: Buy to Close if premium exceeds your threshold",
        "The Exit Plan auto-fires when conditions are met",
      ],
    },
    merrill: {
      sell: [
        "Log into Merrill Edge → Trade → Options Trading",
        "Enter symbol and load the options chain",
        "Select expiration and find your strike",
        "Choose 'Sell to Open'",
        "Enter number of contracts",
        "Set as Limit order with your target premium",
        "Select GTC duration",
        "⚠ Check tax lot selection — Merrill defaults to FIFO",
      ],
      buyback: [
        "Go to your Positions → find the short call",
        "Select 'Buy to Close'",
        "Enter your buyback limit price",
        "Set as GTC order",
        "Set up an Alert for when stock approaches your strike",
      ],
    },
    morgan: {
      sell: [
        "Log into Morgan Stanley Online → Trading → Options",
        "Or contact your Financial Advisor for assisted trading",
        "Enter symbol, select expiration and strike",
        "Action: Sell to Open",
        "Set limit price and GTC duration",
        "Review margin requirements",
        "Submit (FA clients: your advisor may handle execution)",
      ],
      buyback: [
        "Navigate to Open Positions",
        "Select the short call → Buy to Close",
        "Enter buyback limit price, GTC duration",
        "Discuss rolling strategies with your FA if applicable",
        "Monitor via the Morgan Stanley app for alerts",
      ],
    },
  };

  const active = brokers.find((b) => b.id === activeBroker);
  const guide = guides[activeBroker];

  return (
    <div>
      <Card>
        <SectionTitle icon="🔧" title="Broker Setup Guides" subtitle="Step-by-step instructions for your brokerage" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {brokers.map((b) => (
            <button key={b.id} onClick={() => setActiveBroker(b.id)} style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: activeBroker === b.id ? b.color + "22" : T.card,
              border: `2px solid ${activeBroker === b.id ? b.color : T.border}`,
              color: activeBroker === b.id ? b.color : T.textDim,
              fontFamily: T.fontBody, transition: "all 0.2s",
            }}>
              {b.icon} {b.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Selling Guide */}
      <Card>
        <div style={{ color: active.color, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 12 }}>
          PART 1 — SELLING THE COVERED CALL
        </div>
        {guide.sell.map((step, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, padding: "10px 0",
            borderBottom: i < guide.sell.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              background: active.color + "22", color: active.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, fontFamily: T.fontMono,
            }}>{i + 1}</div>
            <div style={{ color: T.text, fontSize: 12, lineHeight: 1.5 }}>{step}</div>
          </div>
        ))}
      </Card>

      {/* Buyback Guide */}
      <Card>
        <div style={{ color: active.color, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 12 }}>
          PART 2 — SETTING STOPS & BUYBACK
        </div>
        {guide.buyback.map((step, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, padding: "10px 0",
            borderBottom: i < guide.buyback.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              background: active.color + "22", color: active.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, fontFamily: T.fontMono,
            }}>{i + 1}</div>
            <div style={{ color: T.text, fontSize: 12, lineHeight: 1.5 }}>{step}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── TIME AGO HELPER ────────────────────────────────────────────────────────

function getTimeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────

export default function NewTabPreview() {
  const { T } = useTheme();
  const [activeView, setActiveView] = useState("history");

  const activeItem = VIEWS.find((v) => v.id === activeView);

  return (
    <div>
      {/* View Selector */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>🆕</span>
            <span style={{ color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.fontDisplay }}>Preview Views</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={activeView}
              onChange={(e) => setActiveView(e.target.value)}
              style={{
                padding: "8px 32px 8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: T.card, border: `1px solid ${T.border}`, color: T.text,
                fontFamily: T.fontMono, cursor: "pointer", outline: "none",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
              }}
            >
              {VIEWS.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>

            <Badge color={TIER_COLORS[activeItem?.tier || "basic"]}>
              {(activeItem?.tier || "basic").toUpperCase()}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Active View */}
      {activeView === "history" && <HistoryView />}
      {activeView === "working" && <WorkingView />}
      {activeView === "risk" && <RiskView />}
      {activeView === "transactions" && <TransactionsView />}
      {activeView === "glossary" && <GlossaryView />}
      {activeView === "setup" && <SetupView />}
    </div>
  );
}
