// ─── src/components/RiskTab.jsx ───────────────────────────────────────────────
import { useMemo } from "react";
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

const Badge = ({ children, color }) => {
  const { T } = useTheme();
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      fontFamily: T.fontMono, letterSpacing: 0.5, background: color + "18", color,
    }}>{children}</span>
  );
};

export default function RiskTab() {
  const { T } = useTheme();

  const SCENARIOS = useMemo(() => [
    { title: "Stock Drops Significantly", severity: "HIGH", color: T.danger, icon: "📉",
      description: "If the stock drops well below your purchase price, the premium collected provides a small buffer but won't offset major losses. You still own the shares and absorb the full downside.",
      action: "The premium reduces your cost basis, but you hold full downside risk on the stock. Consider setting stop-losses on the underlying if the drop is significant. Don't sell more calls at lower strikes just to collect premium — that locks in losses." },
    { title: "Stock Gets Called Away (Assignment)", severity: "MEDIUM", color: T.warn, icon: "📤",
      description: "If the stock rises above your strike at expiration, your shares will be sold at the strike price. You keep the premium but miss any gains above the strike.",
      action: "This is the opportunity cost risk. If you're bullish long-term, sell calls at higher OTM strikes. If assigned, you can repurchase shares and sell new calls (the 'wheel strategy')." },
    { title: "Stock Gaps Up on Earnings", severity: "HIGH", color: T.danger, icon: "⚡",
      description: "A sudden spike (earnings beat, acquisition news) can push the stock far past your strike overnight. You miss significant upside and face immediate assignment.",
      action: "Avoid selling calls through earnings unless you're okay with assignment at the strike. Close or roll positions 2-3 days before earnings announcements. Check the earnings calendar before opening any position." },
    { title: "Early Assignment (Dividend Risk)", severity: "MEDIUM", color: T.warn, icon: "💰",
      description: "If your call is in-the-money near an ex-dividend date, the buyer may exercise early to capture the dividend. This is most common with deep ITM calls.",
      action: "Monitor ex-dividend dates. If your call is ITM and ex-date is approaching, close the position beforehand. Early assignment means your shares are sold and you lose the dividend." },
    { title: "Low Liquidity / Wide Spreads", severity: "LOW", color: T.accent, icon: "🏜",
      description: "Illiquid options have wide bid-ask spreads, making it expensive to buy back your call. You may pay significantly more than the theoretical value.",
      action: "Stick to high-volume stocks (SPY, AAPL, MSFT, etc.) and near-the-money strikes. Use limit orders, never market orders. Avoid weeklies on low-volume names." },
    { title: "Market Crash / Black Swan Event", severity: "CRITICAL", color: T.danger, icon: "🦢",
      description: "A broad market crash drops all stocks. Your call expires worthless (you keep the premium) but your shares lose significant value. The premium is a small consolation.",
      action: "Covered calls don't protect against crashes — they only provide a small buffer. For tail risk protection, consider buying protective puts (creating a 'collar'). Diversification across sectors also helps." },
  ], [T]);
  return (
    <div role="region" aria-label="Covered call risk scenarios">
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Risk Scenarios</h3>
        </div>
        <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.7 }}>
          Covered calls are one of the more conservative options strategies, but they carry real risks.
          Understanding these scenarios helps you decide when to sell, close, or roll your positions.
        </div>
      </Card>

      {SCENARIOS.map((s, i) => (
        <Card key={i}>
          <div role="article" aria-label={`${s.title} — ${s.severity} severity`} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.fontDisplay }}>{s.title}</div>
            </div>
            <Badge color={s.color}>{s.severity}</Badge>
          </div>
          <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>{s.description}</div>
          <div style={{
            padding: "12px 16px", borderRadius: 8, background: s.color + "08",
            border: `1px solid ${s.color}18`, color: T.text, fontSize: 12, lineHeight: 1.7,
          }}>
            <strong style={{ color: s.color }}>What to do: </strong>{s.action}
          </div>
        </Card>
      ))}
    </div>
  );
}
