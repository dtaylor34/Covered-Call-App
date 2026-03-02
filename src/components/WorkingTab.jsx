// ─── src/components/WorkingTab.jsx ────────────────────────────────────────────
// P&L analysis tab. Auto-populates from shared activePosition state.
// Shows position summary, 31-row buyback table, key price levels, and guidance.

import { useMemo } from "react";
import { useStockQuote } from "../hooks/useMarketData";
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

const Badge = ({ children, color, ...props }) => {
  const { T } = useTheme();
  return (
    <span {...props} style={{
      padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      fontFamily: T.fontMono, letterSpacing: 0.5, background: color + "18", color,
      ...props.style,
    }}>{children}</span>
  );
};

const StatBox = ({ label, value, color }) => {
  const { T } = useTheme();
  return (
    <div style={{
      textAlign: "center", padding: "12px 8px", borderRadius: 8,
      background: T.card, border: `1px solid ${T.border}`, minWidth: 100,
    }}>
      <div style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || T.text, fontSize: 18, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
};

export default function WorkingTab({ activePosition }) {
  const { T } = useTheme();
  const symbol = activePosition?.symbol || null;
  const contract = activePosition?.contract || null;
  const { quote } = useStockQuote(symbol);

  const stockPrice = quote?.price || contract?.stockPrice || 0;
  const strike = contract?.strike || 0;
  const premium = contract?.premium || 0;
  const premiumPerShare = premium > 0 ? premium / 100 : 0;
  const expiration = contract?.expiration || "";

  // Days to expiry
  const daysLeft = useMemo(() => {
    if (!expiration) return 0;
    const exp = new Date(expiration);
    const now = new Date();
    return Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));
  }, [expiration]);

  // Generate P&L rows from -15% to +15%
  const rows = useMemo(() => {
    if (!stockPrice || !strike) return [];
    const result = [];
    for (let pct = -15; pct <= 15; pct++) {
      const price = stockPrice * (1 + pct / 100);
      const intrinsic = Math.max(0, price - strike);
      const timeRatio = Math.max(0, daysLeft / 30);
      const timeValue = Math.max(0, premiumPerShare * 0.3 * timeRatio * (1 - Math.abs(pct) / 20));
      const optionValue = intrinsic + timeValue;
      const buybackPerContract = optionValue * 100;
      const netPL = premium - buybackPerContract;
      const pctKept = premium > 0 ? ((premium - buybackPerContract) / premium) * 100 : 0;
      result.push({ pct, price, optionValue, buybackPerContract, netPL, pctKept });
    }
    return result;
  }, [stockPrice, strike, premium, premiumPerShare, daysLeft]);

  // Current position analysis
  const pctFromStrike = strike > 0 ? ((stockPrice - strike) / strike) * 100 : 0;

  // Key price levels
  const dangerPrice = strike > 0 ? strike * 0.97 : 0;
  const buybackTarget = premiumPerShare > 0 ? premiumPerShare * 0.5 : 0;

  if (!symbol) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ color: T.text, fontSize: 16, fontWeight: 700, fontFamily: T.fontDisplay, marginBottom: 8 }}>
            No Active Position
          </div>
          <div style={{ color: T.textDim, fontSize: 13, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
            Search a symbol on the Dashboard tab and select a contract. It will automatically appear here for P&L analysis.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div role="region" aria-label={`Working P&L analysis for ${symbol}`}>
      {/* Position Summary */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Position Summary</h3>
          <Badge color={T.accent}>{symbol}</Badge>
          {daysLeft > 0 && <Badge aria-label={`${daysLeft} days to expiration`} color={daysLeft <= 7 ? T.danger : T.textDim}>{daysLeft}d left</Badge>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          <StatBox label="Stock Price" value={`$${stockPrice.toFixed(2)}`} color={T.accent} />
          <StatBox label="Strike" value={strike ? `$${strike}` : "—"} color={T.text} />
          <StatBox label="Expiry" value={expiration ? expiration.slice(5) : "—"} />
          <StatBox label="Premium" value={premium ? `$${premium.toFixed(0)}` : "—"} color={T.success} />
          <StatBox label="Per Share" value={premiumPerShare ? `$${premiumPerShare.toFixed(2)}` : "—"} />
          <StatBox label="From Strike" value={`${pctFromStrike >= 0 ? "+" : ""}${pctFromStrike.toFixed(1)}%`}
            color={pctFromStrike > 0 ? T.danger : pctFromStrike > -3 ? T.warn : T.success} />
        </div>
      </Card>

      {/* Buyback P&L Table */}
      {rows.length > 0 && (
        <Card style={{ padding: "20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>📈</span>
            <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Buyback P&L Table</h3>
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table aria-label="Buyback profit and loss analysis" style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.fontMono, fontSize: 11, minWidth: 600 }}>
              <thead>
                <tr>
                  {["% Move", "Stock $", "Option Val", "Buyback", "Net P&L", "% Kept", "Status"].map((h) => (
                    <th key={h} scope="col" style={{
                      textAlign: "right", padding: "8px 8px", borderBottom: `1px solid ${T.border}`,
                      color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
                      position: "sticky", top: 0, background: T.surface,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isBold = r.pct % 5 === 0;
                  const isCurrentPrice = r.pct === 0;
                  const isStrikeRow = strike > 0 && Math.abs(r.price - strike) < stockPrice * 0.005;
                  const isProfit = r.netPL >= 0;
                  const status = r.pctKept >= 70 ? "STRONG" : r.pctKept >= 40 ? "GOOD" : r.pctKept >= 0 ? "SLIM" : "OWES";
                  const statusColor = r.pctKept >= 70 ? T.success : r.pctKept >= 40 ? T.accent : r.pctKept >= 0 ? T.warn : T.danger;

                  return (
                    <tr key={r.pct} style={{
                      opacity: isBold ? 1 : 0.55,
                      background: isCurrentPrice ? T.accentDim : !isProfit ? T.dangerDim : "transparent",
                      borderLeft: isCurrentPrice ? `3px solid ${T.accent}` : isStrikeRow ? `3px solid ${T.warn}` : "3px solid transparent",
                    }}>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: r.pct > 0 ? T.success : r.pct < 0 ? T.danger : T.accent, fontWeight: isBold ? 700 : 400 }}>
                        {r.pct > 0 ? "+" : ""}{r.pct}%
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: T.text, fontWeight: isBold ? 700 : 400 }}>
                        ${r.price.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: T.textDim }}>
                        ${r.optionValue.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: T.textDim }}>
                        ${r.buybackPerContract.toFixed(0)}
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: isProfit ? T.success : T.danger, fontWeight: 700 }}>
                        {r.netPL >= 0 ? "+" : ""}${r.netPL.toFixed(0)}
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: isProfit ? T.success : T.danger }}>
                        {r.pctKept.toFixed(0)}%
                      </td>
                      <td style={{ textAlign: "right", padding: "5px 8px" }}>
                        <Badge color={statusColor}>{status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Key Price Levels */}
      {strike > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>📍</span>
            <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Key Price Levels</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ padding: "14px", borderRadius: 8, background: T.successDim, border: `1px solid ${T.success}22` }}>
              <div style={{ color: T.success, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, fontWeight: 700 }}>MAX PROFIT ZONE</div>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                Below ${strike.toFixed(2)}
              </div>
              <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>Option expires worthless. You keep 100% of premium.</div>
            </div>
            <div style={{ padding: "14px", borderRadius: 8, background: T.dangerDim, border: `1px solid ${T.danger}22` }}>
              <div style={{ color: T.danger, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, fontWeight: 700 }}>DANGER ZONE</div>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                Above ${dangerPrice.toFixed(2)}
              </div>
              <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>Buyback cost exceeds premium. Risk of assignment increases.</div>
            </div>
            <div style={{ padding: "14px", borderRadius: 8, background: T.accentDim, border: `1px solid ${T.accent}22` }}>
              <div style={{ color: T.accent, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, fontWeight: 700 }}>BUYBACK TARGET</div>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                ${buybackTarget.toFixed(2)}/share
              </div>
              <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>50% of premium collected. Good profit-take level.</div>
            </div>
          </div>
        </Card>
      )}

      {/* What Should I Do */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 14 }}>🎯</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>What Should I Do Right Now?</h3>
        </div>
        {(() => {
          if (!strike || !stockPrice) return <div style={{ color: T.textDim, fontSize: 12 }}>Select a contract to see guidance.</div>;
          let urgency, color, advice;
          if (pctFromStrike < -5) {
            urgency = "LOW"; color = T.success;
            advice = `Stock is ${Math.abs(pctFromStrike).toFixed(1)}% below your $${strike} strike. Position is safe. Hold and let time decay (theta) work in your favor. No action needed.`;
          } else if (pctFromStrike < -2) {
            urgency = "MODERATE"; color = T.accent;
            advice = `Stock is ${Math.abs(pctFromStrike).toFixed(1)}% below strike. Comfortable but worth monitoring. Consider placing a GTC buyback order at 50% of premium ($${buybackTarget.toFixed(2)}/share) to lock in profits automatically.`;
          } else if (pctFromStrike < 0) {
            urgency = "ELEVATED"; color = T.warn;
            advice = `Stock is only ${Math.abs(pctFromStrike).toFixed(1)}% from your $${strike} strike. If you've captured 60%+ of your premium, consider closing now. The remaining premium isn't worth the assignment risk.`;
          } else {
            urgency = "HIGH"; color = T.danger;
            advice = `Stock is ${pctFromStrike.toFixed(1)}% ABOVE your $${strike} strike! Assignment risk is high. Buy back immediately and consider rolling to a higher strike or later expiration. Every day ITM increases assignment probability.`;
          }
          return (
            <div role="status" aria-label={`${urgency} urgency — ${advice}`} style={{ padding: "16px", background: color + "12", border: `1px solid ${color}33`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Badge color={color}>{urgency} URGENCY</Badge>
                <Badge color={T.textDim}>{daysLeft}d to expiry</Badge>
              </div>
              <div style={{ color: T.text, fontSize: 13, lineHeight: 1.7 }}>{advice}</div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
