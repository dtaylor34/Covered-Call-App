// ─── src/hooks/useSchwabQuote.js ─────────────────────────────────────────────
// Real-time quote for a single symbol from Schwab (when the broker is connected).
// Lets views that otherwise rely on the 15-min-delayed Yahoo quote show a truly
// live price. Returns null when not connected / no quote (caller falls back).
//
// Returns { price, change, changePct, source: "schwab" } | null.

import { useState, useEffect } from "react";
import { useBrokerConnection } from "./useBrokerConnection";
import { schwabGetQuotes } from "../services/schwabApi";

export function useSchwabQuote(symbol, { refreshMs = 45000 } = {}) {
  const { activeConnection } = useBrokerConnection();
  const on = activeConnection?.status === "connected";
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!on || !symbol) { setQuote(null); return; }
    let alive = true;
    const run = async () => {
      try {
        const res = await schwabGetQuotes({ symbols: [symbol] });
        const rows = res?.data?.quotes || [];
        const row = rows.find((x) => x.symbol === symbol) || rows[0];
        if (!alive) return;
        if (row && row.lastPrice > 0) setQuote({ price: row.lastPrice, change: row.netChange || 0, changePct: row.netChangePct || 0, source: "schwab" });
        else setQuote(null);
      } catch { if (alive) setQuote(null); }
    };
    run();
    const t = setInterval(run, refreshMs);
    return () => { alive = false; clearInterval(t); };
  }, [on, symbol, refreshMs]);

  return quote;
}
