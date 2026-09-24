// ─── src/hooks/useLivePortfolio.js ───────────────────────────────────────────
// Feeds the Working portfolio with LIVE stock + call prices from two sources:
//   • Schwab (real-time) when the user has connected their broker key, else
//   • Yahoo (15-min delayed) — always available, no key required.
//
// Schwab is preferred when connected; any value it doesn't return falls back to
// Yahoo, and anything still missing falls back to the position's stored mark.
// Both data sets work; the UI shows which one is live.
//
// Returns { live: { [positionId]: { liveStock?, liveCall?, source } }, status }.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useBrokerConnection } from "./useBrokerConnection";
import { schwabGetQuotes, schwabGetOptionChain } from "../services/schwabApi";

// Resolve callables at call time (Vite chunk-order safe).
const yahoo = (name) => (data) => httpsCallable(getFunctions(getApp()), name)(data).then((r) => r.data);

// Schwab's callExpDateMap: { "YYYY-MM-DD:dte": { "28.0": [{ mark, last, bid, ask }] } }
function eachSchwabCall(chain, expiry, cb) {
  const map = chain?.callExpDateMap || {};
  for (const expKey of Object.keys(map)) {
    if (!expKey.startsWith(expiry)) continue;
    const strikes = map[expKey];
    for (const kStr of Object.keys(strikes)) {
      const c = (strikes[kStr] || [])[0];
      if (!c) continue;
      const mark = c.mark || c.last || ((c.bid + c.ask) / 2) || 0;
      if (mark > 0) cb(parseFloat(kStr), mark);
    }
  }
}

export function useLivePortfolio(positions, { refreshMs = 60000 } = {}) {
  const { activeConnection } = useBrokerConnection();
  const schwabOn = activeConnection?.status === "connected";

  const [live, setLive] = useState({});
  const [status, setStatus] = useState({ source: "yahoo", loading: false, error: null, at: null });

  const symKey = useMemo(() => [...new Set(positions.map((p) => p.sym))].sort().join(","), [positions]);
  const chainKey = useMemo(() => [...new Set(positions.map((p) => `${p.sym}|${p.expiry}`))].sort().join(";"), [positions]);

  useEffect(() => {
    if (!positions.length) { setLive({}); return; }
    let cancelled = false;
    const symbols = symKey ? symKey.split(",") : [];
    const chains = chainKey ? chainKey.split(";") : [];

    async function run() {
      setStatus((s) => ({ ...s, loading: true, error: null }));
      const stock = {};      // sym -> price
      const callMark = {};   // "sym|expiry|strike" -> price

      // 1) Stock quotes — Schwab first (if connected), Yahoo for the rest.
      if (schwabOn) {
        try { const r = await schwabGetQuotes({ symbols }); (r?.quotes || []).forEach((q) => { if (q.lastPrice > 0) stock[q.symbol] = q.lastPrice; }); } catch { /* fall through */ }
      }
      const missing = symbols.filter((s) => !(stock[s] > 0));
      if (missing.length) {
        try { const r = await yahoo("getWatchlistData")({ symbols: missing }); (r?.quotes || []).forEach((q) => { if (q.price > 0) stock[q.symbol] = q.price; }); } catch { /* leave missing */ }
      }

      // 2) Call marks per (symbol, expiry).
      for (const key of chains) {
        const [sym, expiry] = key.split("|");
        let got = false;
        if (schwabOn) {
          try {
            const chain = await schwabGetOptionChain({ symbol: sym, expiration: expiry });
            eachSchwabCall(chain, expiry, (strike, mark) => { callMark[`${sym}|${expiry}|${strike}`] = mark; });
            got = Object.keys(callMark).some((k) => k.startsWith(`${sym}|${expiry}|`));
          } catch { /* fall through to Yahoo */ }
        }
        if (!got) {
          try {
            const chain = await yahoo("getOptionsChain")({ symbol: sym, expiration: expiry });
            const calls = chain?.chain?.[expiry]?.calls || (chain?.chain ? Object.values(chain.chain)[0]?.calls : null) || [];
            calls.forEach((c) => { const m = c.lastPrice || ((c.bid + c.ask) / 2) || 0; if (m > 0) callMark[`${sym}|${expiry}|${c.strike}`] = m; });
          } catch { /* leave missing */ }
        }
      }

      if (cancelled) return;
      const next = {};
      for (const p of positions) {
        const s = stock[p.sym];
        const cm = callMark[`${p.sym}|${p.expiry}|${p.strike}`];
        const entry = {};
        if (s > 0) entry.liveStock = s;
        if (cm > 0) entry.liveCall = cm;
        if (Object.keys(entry).length) { entry.source = schwabOn ? "schwab" : "yahoo"; next[p.id] = entry; }
      }
      setLive(next);
      setStatus({ source: schwabOn ? "schwab" : "yahoo", loading: false, error: null, at: Date.now() });
    }

    run();
    const t = refreshMs > 0 ? setInterval(run, refreshMs) : null;
    return () => { cancelled = true; if (t) clearInterval(t); };
  }, [symKey, chainKey, schwabOn, refreshMs, positions]);

  return { live, status };
}
