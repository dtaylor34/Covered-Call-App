// ─── src/components/OptionsManager.jsx ───────────────────────────────────────
// The "Options Manager" product view — a sibling of the Covered Calls Manager,
// reached via the top header's site switch. It mirrors the same tab bar, with:
//   • Analysis tabs (Selection / Dashboard / Working / Risk / Trades / History)
//     as blank "coming soon" placeholders — context is filled in later.
//   • Global tabs (APIs, Profile, Setup, Glossary) reused LIVE from the shared
//     components, so the Schwab connection + account settings work identically
//     in both products.
//
// Tab ids match the shared TABS in Dashboard.jsx so the one tab bar drives both
// products; only the rendered content differs by app mode.

import { useTheme } from "../contexts/ThemeContext";
import GlossaryTab from "./GlossaryTab";
import SetupTab from "./SetupTab";
import ProfileTab from "./ProfileTab";
import APITab from "./APITab";
import OptionsDashboard from "./OptionsDashboard";

// Analysis tabs to scaffold (id → label + blurb). Labels mirror the CC tab bar.
// The "Dashboard" tab (id "selection") is built out — the rest are placeholders.
const BLANK_TABS = [
  { id: "dashboard", label: "Selection", blurb: "Find and screen option plays (calls, puts, spreads) by return, risk, and expiry." },
  { id: "working", label: "Working", blurb: "Track your open option positions with live P&L, exits, and per-position charts." },
  { id: "risk", label: "Risk", blurb: "Scenario and payoff-curve analysis across price, time, and volatility." },
  { id: "transactions", label: "Trades", blurb: "Your options transaction log and realized results." },
  { id: "history", label: "History", blurb: "Historical options data — IV, premiums, and price trends over time." },
];

function Placeholder({ T, title, blurb }) {
  return (
    <div style={{ background: T.surface, border: `1px dashed ${T.border}`, borderRadius: T.rL || 14, padding: "48px 24px", textAlign: "center" }}>
      <div aria-hidden="true" style={{ fontSize: 34, marginBottom: 12 }}>🧩</div>
      <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: "0 0 6px" }}>Options Manager — {title}</h2>
      <p style={{ color: T.textDim, fontFamily: T.fontBody, fontSize: 13, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>{blurb}</p>
      <div style={{ marginTop: 16, display: "inline-block", padding: "5px 12px", borderRadius: 6, background: T.accentDim, color: T.accent, fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
        COMING SOON
      </div>
    </div>
  );
}

export default function OptionsManager({ activeTab, activePosition }) {
  const { T } = useTheme();
  const panel = (id, node) => (
    <div role="tabpanel" aria-label={`Options Manager — ${id}`} style={{ display: activeTab === id ? "block" : "none" }}>
      {node}
    </div>
  );

  return (
    <>
      {/* Global tabs — reused live so Schwab/account work in both products */}
      {panel("glossary", <GlossaryTab />)}
      {panel("setup", <SetupTab activePosition={activePosition} />)}
      {panel("profile", <ProfileTab />)}
      {panel("api", <APITab />)}

      {/* Dashboard tab (id "selection") — built out */}
      {panel("selection", <OptionsDashboard />)}

      {/* Remaining options-specific analysis tabs — blank placeholders for now */}
      {BLANK_TABS.map(({ id, label, blurb }) => panel(id, <Placeholder T={T} title={label} blurb={blurb} />))}
    </>
  );
}
