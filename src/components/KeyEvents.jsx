// ─── src/components/KeyEvents.jsx ────────────────────────────────────────────
// Market notes for the current selection: what's happening between now and the
// chosen expiration that could move premium or raise assignment risk. Events we
// can compute today (expiration-week, weekly-vs-monthly, FOMC, days-to-expiry)
// are shown live; those needing data we don't collect yet (earnings, dividend,
// IV percentile) are listed as "pending data" so nothing is silently dropped.

import { useState, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";

// Scheduled 2026 FOMC decision days (second day of each two-day meeting).
const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];

const parseISO = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return y ? new Date(y, m - 1, d) : null;
};
const isThirdFriday = (d) => d.getDay() === 5 && d.getDate() >= 15 && d.getDate() <= 21;
const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function KeyEvents({ symbol, expiration }) {
  const { T } = useTheme();
  const [open, setOpen] = useState(true);

  const events = useMemo(() => {
    const out = [];
    const exp = parseISO(expiration);
    const now = new Date(); now.setHours(0, 0, 0, 0);

    if (exp) {
      const dte = Math.round((exp - now) / 86400000);
      const monthly = isThirdFriday(exp);
      out.push({
        tone: "info", icon: "📅", title: monthly ? "Monthly expiration" : "Weekly expiration",
        text: monthly
          ? `This is a standard third-Friday monthly — deepest liquidity and tightest spreads.`
          : `This is a weekly expiration — fine for income, but spreads can be wider than the monthly.`,
      });
      if (dte >= 0 && dte <= 7) {
        out.push({
          tone: "warn", icon: "⏳", title: "Expiration week",
          text: `${dte}d to expiry — gamma/time-decay is fastest now. Watch assignment risk if the stock is near your strike.`,
        });
      }
      const fed = FOMC_2026.map(parseISO).find((d) => d && d >= now && d <= exp);
      if (fed) {
        out.push({
          tone: "warn", icon: "🏛️", title: "FOMC decision before expiry",
          text: `A Fed rate decision lands ${fmtDate(fed)} — expect an IV bump into it and a drop after.`,
        });
      }
    } else {
      out.push({ tone: "muted", icon: "📅", title: "No expiration selected", text: "Pick a strike/expiration above to see timing notes." });
    }

    // Data we don't collect yet — flagged, not hidden.
    out.push({ tone: "pending", icon: "📊", title: "Earnings date", text: "Pending data — not wired yet. Selling calls through an earnings report raises both premium and the chance of a big move." });
    out.push({ tone: "pending", icon: "💵", title: "Ex-dividend date", text: "Pending data — not wired yet. ITM calls can be assigned early right before an ex-dividend date." });
    out.push({ tone: "pending", icon: "📈", title: "IV percentile (52-wk)", text: "Building history — needs ~1 year of daily snapshots. High IV percentile = richer premium for selling." });
    return out;
  }, [expiration]);

  const toneColor = (tone) => ({
    info: T.accent, warn: T.warning || "#E6A23C", muted: T.textDim, pending: T.textDim,
  }[tone] || T.textDim);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "16px 18px", marginBottom: 16 };
  const font = T.fontMono, displayFont = T.fontDisplay;

  return (
    <div style={card} role="region" aria-label="Key events">
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ color: T.text, fontFamily: displayFont, fontSize: 16, margin: 0, fontWeight: 600 }}>Key Events</h3>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: font }}>market notes · {symbol}</span>
        </div>
        <span style={{ color: T.textDim, fontSize: 18, lineHeight: 1 }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((e, i) => {
            const c = toneColor(e.tone);
            const faded = e.tone === "pending" || e.tone === "muted";
            return (
              <div key={i} style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 7, background: faded ? "transparent" : `${c}12`, border: `1px solid ${faded ? T.border : `${c}33`}`, opacity: faded ? 0.7 : 1 }}>
                <span style={{ fontSize: 14, lineHeight: "18px" }}>{e.icon}</span>
                <div>
                  <div style={{ color: faded ? T.textDim : c, fontFamily: font, fontSize: 12, fontWeight: 700 }}>{e.title}</div>
                  <div style={{ color: T.text, fontFamily: font, fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}>{e.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
