// ─── src/components/SetupTab.jsx ──────────────────────────────────────────────
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

const BROKERS = [
  { id: "schwab", name: "Charles Schwab", color: "#00a3e0", icon: "🟦" },
  { id: "etrade", name: "E*TRADE", color: "#6b21a8", icon: "🟪" },
  { id: "merrill", name: "Merrill Lynch", color: "#8b4513", icon: "🟫" },
  { id: "morgan", name: "Morgan Stanley", color: "#475569", icon: "⬛" },
];

const GUIDES = {
  schwab: {
    platform: "Schwab.com or thinkorswim",
    sell: [
      { step: "Log in → Trade → Options", detail: "Or open thinkorswim desktop app for advanced features" },
      { step: "Enter your stock symbol", detail: "The option chain will load automatically" },
      { step: "Select 'Sell to Open' as the action", detail: "This creates a new short call position" },
      { step: "Choose your expiration date", detail: "Use the tabs across the top of the chain" },
      { step: "Click the Bid price on your strike", detail: "This pre-fills the order with current market bid" },
      { step: "Set order type to 'Limit'", detail: "Enter your target premium (at or slightly above bid)" },
      { step: "Enter number of contracts", detail: "1 contract = 100 shares. Make sure you have enough shares to cover" },
      { step: "Set Time-in-Force to 'GTC'", detail: "Good Till Canceled — stays active until filled" },
      { step: "Review order summary → Submit", detail: "Double-check symbol, strike, expiration, and premium" },
    ],
    buyback: [
      { step: "Go to Positions page", detail: "Find your short call position" },
      { step: "Right-click → 'Create Closing Order'", detail: "Or click the position and select Buy to Close" },
      { step: "Set a limit price at your buyback target", detail: "Typically 50% of original premium for profit-taking" },
      { step: "Set as GTC order", detail: "This auto-executes when premium drops to your target" },
      { step: "For rolling: right-click → 'Roll'", detail: "thinkorswim handles the close + open as one order" },
    ],
    automation: "thinkorswim supports conditional orders: set a trigger (stock price or option price) to automatically place your buyback order. Go to Trade → Conditional Order to set up.",
  },
  etrade: {
    platform: "Power E*TRADE (web or app)",
    sell: [
      { step: "Open Power E*TRADE → Options Chain", detail: "Power E*TRADE has better options tools than basic E*TRADE" },
      { step: "Enter stock symbol and select expiration", detail: "Use the expiration tabs" },
      { step: "Click the Bid price on your target strike", detail: "This pre-fills a Sell order" },
      { step: "Verify: Action = Sell to Open", detail: "Check quantity matches your contract count" },
      { step: "Set price type to Limit", detail: "Enter your target premium" },
      { step: "Duration: GTC", detail: "Good Till Canceled" },
      { step: "Review → Place Order", detail: "Confirm all details before submitting" },
    ],
    buyback: [
      { step: "Use the Exit Plan feature (parachute icon)", detail: "Available on the order confirmation page" },
      { step: "Set up an OCO (One-Cancels-Other) order", detail: "Profit target + stop loss in one setup" },
      { step: "Profit target: Buy to Close at your buyback %", detail: "Typically 50% of premium" },
      { step: "Stop: Buy to Close if premium exceeds threshold", detail: "Safety net if the stock rallies" },
      { step: "The Exit Plan auto-fires when conditions are met", detail: "No manual monitoring needed" },
    ],
    automation: "E*TRADE's Exit Plan and Quote Triggers can automate your buyback strategy. Set up at order entry time for the cleanest workflow.",
  },
  merrill: {
    platform: "Merrill Edge MarketPro",
    sell: [
      { step: "Log in → Trade → Options Trading", detail: "MarketPro has the full options chain" },
      { step: "Enter symbol and load the options chain", detail: "Select the expiration you want" },
      { step: "Find your target strike price", detail: "Click to start building the order" },
      { step: "Choose 'Sell to Open'", detail: "This writes a new covered call" },
      { step: "Enter number of contracts", detail: "Make sure you own enough shares to cover" },
      { step: "Set as Limit order with target premium", detail: "Use the bid as your starting reference" },
      { step: "Select GTC duration", detail: "Good Till Canceled" },
      { step: "⚠ Check tax lot selection", detail: "Merrill defaults to FIFO — this may not be optimal for your tax situation" },
    ],
    buyback: [
      { step: "Go to Positions → find the short call", detail: "Click to see position details" },
      { step: "Select 'Buy to Close'", detail: "This closes your short call position" },
      { step: "Enter your buyback limit price", detail: "Your profit-take target" },
      { step: "Set as GTC order", detail: "Auto-executes when premium drops" },
      { step: "Set up Price Alerts for your strike", detail: "Get notified when stock approaches your strike" },
    ],
    automation: "Merrill's Strategy Analyzer can model outcomes before you trade. Use the Alerts feature to get notified when action is needed.",
  },
  morgan: {
    platform: "Morgan Stanley Online or FA-Assisted",
    sell: [
      { step: "Log into Morgan Stanley Online → Trading", detail: "Or contact your Financial Advisor" },
      { step: "Navigate to Options trading", detail: "May need to enable options in your account" },
      { step: "Enter symbol, select expiration and strike", detail: "Review the chain for your target" },
      { step: "Action: Sell to Open", detail: "This opens the covered call position" },
      { step: "Set limit price and GTC duration", detail: "Always use limit orders" },
      { step: "Review margin requirements", detail: "Covered calls typically don't require margin, but verify" },
      { step: "Submit", detail: "FA clients: your advisor may handle execution" },
    ],
    buyback: [
      { step: "Navigate to Open Positions", detail: "Find your short call" },
      { step: "Select → Buy to Close", detail: "Enter your buyback target price" },
      { step: "Set GTC duration", detail: "Auto-executes at your target" },
      { step: "Discuss rolling with your FA if applicable", detail: "Advisors can help with complex roll strategies" },
      { step: "Monitor via the MS app", detail: "Enable push notifications for position changes" },
    ],
    automation: "Morgan Stanley clients working with a Financial Advisor can request automated monitoring and rolling strategies. Ask your FA about options management services.",
  },
};

export default function SetupTab({ activePosition }) {
  const { T } = useTheme();
  const [activeBroker, setActiveBroker] = useState("schwab");
  const broker = BROKERS.find((b) => b.id === activeBroker);
  const guide = GUIDES[activeBroker];
  const sym = activePosition?.symbol || "AAPL";
  const strike = activePosition?.contract?.strike || "---";

  const Step = ({ index, step, detail }) => (
    <div role="listitem" aria-label={`Step ${index}: ${step}`} style={{
      display: "flex", gap: 12, padding: "12px 0",
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div aria-hidden="true" style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        background: broker.color + "22", color: broker.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, fontFamily: T.fontMono,
      }}>{index}</div>
      <div>
        <div style={{ color: T.text, fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{step}</div>
        <div style={{ color: T.textDim, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>{detail}</div>
      </div>
    </div>
  );

  return (
    <div role="region" aria-label={`${broker.name} broker setup guide`}>
      {/* Broker Selector */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ fontSize: 16 }}>🔧</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Broker Setup Guides</h3>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {BROKERS.map((b) => (
            <button key={b.id} aria-label={`Select ${b.name} broker guide`} aria-pressed={activeBroker === b.id} onClick={() => setActiveBroker(b.id)} style={{
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

      {/* Quick Reference */}
      <Card style={{ background: broker.color + "08", borderColor: broker.color + "22" }}>
        <div style={{ color: broker.color, fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
          QUICK REFERENCE — {broker.name.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, fontFamily: T.fontMono }}>
          <span style={{ color: T.text }}>Symbol: <strong style={{ color: T.accent }}>{sym}</strong></span>
          <span style={{ color: T.text }}>Strike: <strong>${strike}</strong></span>
          <span style={{ color: T.text }}>Platform: <strong>{guide.platform}</strong></span>
        </div>
      </Card>

      {/* Selling Guide */}
      <Card>
        <div style={{ color: broker.color, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 8 }}>
          PART 1 — SELLING THE COVERED CALL
        </div>
        {guide.sell.map((s, i) => (
          <Step key={i} index={i + 1} step={s.step} detail={s.detail} />
        ))}
      </Card>

      {/* Buyback Guide */}
      <Card>
        <div style={{ color: broker.color, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 8 }}>
          PART 2 — SETTING STOPS & BUYBACK
        </div>
        {guide.buyback.map((s, i) => (
          <Step key={i} index={i + 1} step={s.step} detail={s.detail} />
        ))}
      </Card>

      {/* Automation */}
      <Card>
        <div style={{ color: broker.color, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 8 }}>
          AUTOMATION & TOOLS
        </div>
        <div style={{ color: T.text, fontSize: 12, lineHeight: 1.7 }}>{guide.automation}</div>
      </Card>
    </div>
  );
}
