// ─── src/components/KeyEvents.jsx ────────────────────────────────────────────
// Market notes for the current selection: what's happening between now and the
// chosen expiration that could move premium or raise assignment risk. Implements
// best-returns-spec2.md §2 — Dividend Capture, Earnings, IV Percentile, FOMC,
// Expiration Week, and Weekly/Monthly expiry events. Earnings/dividend/IV data
// comes from the enrichment the getBestReturns call already fetched (passed in
// as props); anything still missing degrades to a neutral "pending data" note
// rather than being silently dropped.

import { useState, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";

// Scheduled 2026 FOMC decision days (second day of each two-day meeting).
const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];

const parseISO = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return y ? new Date(y, m - 1, d) : null;
};
const isThirdFriday = (d) => d.getDay() === 5 && d.getDate() >= 15 && d.getDate() <= 21;
const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const daysBetween = (a, b) => Math.round((b - a) / 86400000);

// red (warning) → yellow (caution) → green (favorable) → gray (neutral).
const TONE_PRIORITY = { red: 0, yellow: 1, green: 2, gray: 3 };
const TONE_DOT = { red: "🔴", yellow: "🟡", green: "🟢", gray: "⚪" };

export default function KeyEvents({
  symbol, expiration, strike, price,
  earningsDate = null, exDivDate = null, dividendRate = 0, ivPct = null,
  InfoTip,
}) {
  const { T } = useTheme();
  const [open, setOpen] = useState(false);

  const events = useMemo(() => {
    const out = [];
    const exp = parseISO(expiration);
    const now = new Date(); now.setHours(0, 0, 0, 0);

    // OTM% of the selected strike (null until a strike + price are known).
    const otmPct = (strike > 0 && price > 0) ? ((strike - price) / price) * 100 : null;
    const otmStr = otmPct == null ? "—" : `${otmPct.toFixed(1)}%`;
    // Yahoo's dividendRate is the annual rate; most equities pay quarterly.
    const divPerShare = dividendRate > 0 ? dividendRate / 4 : 0;
    const assignRisk = otmPct == null ? "unknown" : otmPct >= 5 ? "low" : otmPct >= 2 ? "moderate" : "high";

    // ── Event 1: Dividend Capture ──────────────────────────────────────────
    const exDiv = parseISO(exDivDate);
    if (exDiv) {
      const daysToExDiv = daysBetween(now, exDiv);
      const nearAtm = otmPct != null && otmPct <= 2;
      if (daysToExDiv >= 0 && daysToExDiv <= 3 && nearAtm) {
        out.push({
          id: "ke-div", tone: "yellow", title: "Early assignment risk — ex-dividend near a near-ATM strike",
          text: `Ex-dividend ${fmtDate(exDiv)} with your strike only ${otmStr} OTM.`,
          tip: `When a call is in-the-money near an ex-dividend date, the call buyer may exercise early to capture the dividend. Your $${strike} strike is ${otmStr} OTM. Early assignment is more likely when the call's remaining time value is less than the dividend amount (≈$${divPerShare.toFixed(2)}/share).`,
        });
      } else if (exp && exDiv < exp) {
        out.push({
          id: "ke-div", tone: "green", title: `Dividend ≈$${divPerShare.toFixed(2)}/share captured before expiry`,
          text: `Ex-date ${fmtDate(exDiv)} is before your ${fmtDate(exp)} expiry — you'd hold shares on the ex-date.`,
          tip: `${symbol}'s ex-dividend date is ${fmtDate(exDiv)}. Since your expiry is ${fmtDate(exp)}, you'll own shares on the ex-date and receive the dividend (≈$${divPerShare.toFixed(2)}/share, est. from the $${dividendRate.toFixed(2)} annual rate). If your call were assigned early (rare, usually the day before ex-date on deep-ITM calls), you'd miss it. Your $${strike} strike is ${otmStr} OTM, so early-assignment risk is ${assignRisk}.`,
        });
      } else if (exp && exDiv > exp) {
        out.push({
          id: "ke-div", tone: "gray", title: `Dividend ex-date ${fmtDate(exDiv)} — after expiry, not captured`,
          text: `The next ex-date falls after your ${fmtDate(exp)} expiry.`,
          tip: `The next ex-dividend date for ${symbol} is ${fmtDate(exDiv)}, which falls after your ${fmtDate(exp)} expiry. You won't receive this dividend during this covered-call cycle. Consider a longer expiry if capturing the dividend matters.`,
        });
      }
    }

    // ── Event 2: Earnings Call ─────────────────────────────────────────────
    const earn = parseISO(earningsDate);
    if (earn && exp && earn >= now && earn <= exp) {
      const dBeforeExp = daysBetween(earn, exp);
      if (otmPct != null && otmPct < 8) {
        out.push({
          id: "ke-earn", tone: "red", title: `Earnings ${fmtDate(earn)} — tight ${otmStr} OTM cushion`,
          text: `Reports ${dBeforeExp}d before expiry; a big beat could blow past your strike.`,
          tip: `${symbol} reports earnings on ${fmtDate(earn)}, ${dBeforeExp} days before your expiry. Earnings can cause 5–15% moves. Your $${strike} strike is only ${otmStr} OTM, which may not absorb a large surprise. Consider a higher strike or a post-earnings expiry. IV typically drops 30–50% after earnings (IV crush), which helps sellers — but a gap above your strike leads to assignment.`,
        });
      } else if (otmPct != null && otmPct < 12) {
        out.push({
          id: "ke-earn", tone: "yellow", title: `Earnings ${fmtDate(earn)} within expiry — ${otmStr} cushion`,
          text: `Covers a typical earnings move; a blowout quarter could still threaten the strike.`,
          tip: `${symbol} reports earnings on ${fmtDate(earn)}. Your $${strike} strike is ${otmStr} OTM, which covers a typical earnings move (5–10%). A blowout (10%+) could threaten your strike. Post-earnings IV crush accelerates decay in your favor. Generally favorable for sellers, but monitor the stock on earnings day.`,
        });
      } else {
        out.push({
          id: "ke-earn", tone: "green", title: `Earnings ${fmtDate(earn)} — large ${otmStr} OTM buffer`,
          text: `Plenty of cushion even for a strong surprise; IV crush works in your favor.`,
          tip: `${symbol} reports earnings on ${fmtDate(earn)}. Your $${strike} strike is ${otmStr} OTM, a large buffer even for a strong surprise. Post-earnings IV crush accelerates decay in your favor. Selling premium before earnings at this distance is a high-probability strategy.`,
        });
      }
    } else if (earn) {
      out.push({
        id: "ke-earn", tone: "green", title: "No earnings this cycle",
        text: `Next report ${fmtDate(earn)} — after your expiry.`,
        tip: `${symbol}'s next earnings report is ${fmtDate(earn)}${exp ? `, which falls after your ${fmtDate(exp)} expiry` : ""}. No earnings-related volatility risk during this covered-call cycle.`,
      });
    }

    // ── Event 3: IV Percentile ─────────────────────────────────────────────
    if (ivPct != null) {
      if (ivPct >= 70) {
        out.push({
          id: "ke-iv", tone: "green", title: `IV at ${ivPct}th percentile — elevated, good time to sell`,
          text: "Higher implied vol means fatter premiums for sellers.",
          tip: `Implied volatility is at the ${ivPct}th percentile of its recent range. Higher IV means fatter option premiums. Selling calls when IV is elevated collects more than usual; when IV mean-reverts lower, the call value drops faster, benefiting you as the seller.`,
        });
      } else if (ivPct >= 40) {
        out.push({
          id: "ke-iv", tone: "gray", title: `IV at ${ivPct}th percentile — average range`,
          text: "Premiums are fairly priced; no particular IV edge right now.",
          tip: `Implied volatility is at a normal level relative to the collected history. Premiums are fairly priced — no particular edge or disadvantage to selling now based on IV alone.`,
        });
      } else {
        out.push({
          id: "ke-iv", tone: "yellow", title: `IV at ${ivPct}th percentile — below average, thinner premiums`,
          text: "Premiums are thin; an IV spike would pay more.",
          tip: `Implied volatility is low relative to the collected history, so premiums are thinner than usual. You may want to wait for an IV spike (often from market pullbacks or upcoming events) to sell at better premiums, or use a longer DTE to collect more time value.`,
        });
      }
    } else {
      out.push({
        id: "ke-iv", tone: "gray", title: "IV percentile — building history",
        text: "Needs ~20 daily snapshots before a percentile is meaningful.",
        tip: "The IV percentile compares today's implied volatility against the daily IV history this app collects for the symbol. Once ~20 daily snapshots are stored, this event shows where IV sits in that range (high percentile = richer premium for selling).",
      });
    }

    // ── Event 4 & 5 & 6: expiry-timing events ──────────────────────────────
    if (exp) {
      const dte = daysBetween(now, exp);
      const fed = FOMC_2026.map(parseISO).find((d) => d && d >= now && d <= exp);
      if (fed) {
        out.push({
          id: "ke-fed", tone: "gray", title: `Fed meeting ${fmtDate(fed)} within expiry window`,
          text: "Rate decision could move the whole market 1–3%.",
          tip: `The Federal Reserve's FOMC meeting on ${fmtDate(fed)} could cause market-wide volatility. Rate decisions and forward guidance can move stocks 1–3%. This affects all equities, not just ${symbol}. Usually a minor factor unless the stock is already near your strike.`,
        });
      }
      if (dte >= 0 && dte <= 7) {
        out.push({
          id: "ke-expweek", tone: "yellow", title: "Expiration week — gamma risk increases",
          text: `${dte}d to expiry; option value swings sharply near the strike.`,
          tip: `Your call expires in ${dte} days. During expiration week, option prices become highly sensitive to small stock moves (high gamma). If ${symbol} is near your $${strike} strike, the call value can swing sharply. To keep your shares, consider buying the call back before expiration rather than waiting. Pin risk (closing right at the strike) can cause unexpected assignment.`,
        });
      }
      if (!isThirdFriday(exp)) {
        out.push({
          id: "ke-weekly", tone: "gray", title: "Weekly expiry — watch spreads near close",
          text: "Not a standard third-Friday monthly; use limit orders.",
          tip: `This is a weekly options expiry, not a standard monthly (third Friday). Weeklies can have wider bid/ask spreads and lower volume than monthlies, especially for smaller names. Always use limit orders.`,
        });
      } else {
        out.push({
          id: "ke-monthly", tone: "gray", title: "Monthly expiration — deepest liquidity",
          text: "Standard third-Friday monthly; tightest spreads.",
          tip: `This is a standard third-Friday monthly expiration — these carry the deepest liquidity and tightest bid/ask spreads of any expiry.`,
        });
      }
    } else {
      out.push({ id: "ke-none", tone: "gray", title: "No expiration selected", text: "Pick a strike/expiration above to see timing notes.", tip: "Choose an expiration in the Contract Cost section to generate earnings, dividend, and expiry-timing notes for that cycle." });
    }

    return out.sort((a, b) => TONE_PRIORITY[a.tone] - TONE_PRIORITY[b.tone]);
  }, [expiration, strike, price, earningsDate, exDivDate, dividendRate, ivPct, symbol]);

  const toneColor = (tone) => ({ red: T.danger, yellow: T.warning || "#E6A23C", green: T.accent, gray: T.textDim }[tone] || T.textDim);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const font = T.fontMono, displayFont = T.fontDisplay;

  const Row = ({ e }) => {
    const c = toneColor(e.tone);
    const faded = e.tone === "gray";
    return (
      <div style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 7, background: faded ? "transparent" : `${c}12`, border: `1px solid ${faded ? T.border : `${c}33`}` }}>
        <span style={{ fontSize: 11, lineHeight: "18px" }}>{TONE_DOT[e.tone]}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: faded ? T.textDim : c, fontFamily: font, fontSize: 12, fontWeight: 700 }}>{e.title}</span>
            {InfoTip && e.tip && <InfoTip id={e.id} tip={e.tip} />}
          </div>
          <div style={{ color: T.text, fontFamily: font, fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}>{e.text}</div>
        </div>
      </div>
    );
  };

  const top = events[0];
  const moreCount = Math.max(0, events.length - 1);

  return (
    <div style={card} role="region" aria-label="Key events">
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ color: T.text, fontFamily: displayFont, fontSize: 16, margin: 0, fontWeight: 600 }}>Key Events</h3>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>market notes · {symbol}</span>
        </div>
        <span style={{ color: T.textDim, fontSize: 18, lineHeight: 1 }}>{open ? "−" : "+"}</span>
      </button>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {open ? (
          events.map((e) => <Row key={e.id} e={e} />)
        ) : top ? (
          <>
            <Row e={top} />
            {moreCount > 0 && (
              <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontFamily: font, fontSize: 11, textAlign: "left", padding: "2px 4px" }}>
                · {moreCount} more event{moreCount > 1 ? "s" : ""} ▼
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
