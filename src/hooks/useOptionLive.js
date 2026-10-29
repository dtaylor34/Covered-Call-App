// ─── src/hooks/useOptionLive.js ──────────────────────────────────────────────
// Live marks for arbitrary option legs (calls + puts, long + short) in the
// Options Manager. Groups positions by (symbol, expiry), pulls each chain once
// — Schwab real-time when connected, Yahoo (15-min delayed) otherwise — and maps
// the bid/ask mid to each leg by (type, strike). Marks are held in memory for
// display; they are persisted to Firestore only on an explicit Sync.
//
// Returns { live: { [positionId]: { livePrice?, liveUnderlying?, source } }, status }.

import { useState, useEffect, useMemo } from "react";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useBrokerConnection } from "./useBrokerConnection";
import { schwabGetOptionChain } from "../services/schwabApi";
import { normalizeSchwabChain } from "./useMarketData";

const yahooChain = (data) => httpsCallable(getFunctions(getApp()), "getOptionsChain")(data).then((r) => r.data);
const mid = (o) => (o?.bid > 0 && o?.ask > 0 ? (o.bid + o.ask) / 2 : o?.lastPrice || o?.ask || o?.bid || 0);

export function useOptionLive(positions, { refreshMs = 60000 } = {}) {
  const { activeConnection } = useBrokerConnection();
  const schwabOn = activeConnection?.status === "connected";

  const [live, setLive] = useState({});
  const [status, setStatus] = useState({ source: "yahoo", loading: false, error: null, at: null });

  // Unique (symbol, expiry) pairs — one chain fetch covers every leg that shares them.
  const chainKey = useMemo(
    () => [...new Set((positions || []).map((p) => `${p.sym}|${p.expiry}`))].sort().join(";"),
    [positions]
  );

  useEffect(() => {
    if (!positions?.length) { setLive({}); return; }
    let cancelled = false;
    const pairs = chainKey ? chainKey.split(";") : [];

    async function run() {
      setStatus((s) => ({ ...s, loading: true, error: null }));
      const chains = {}; // "sym|expiry" -> { norm, source }
      let anySchwab = false;

      for (const key of pairs) {
        const [sym, expiry] = key.split("|");
        if (!sym || !expiry) continue;
        let norm = null, source = "yahoo";
        if (schwabOn) {
          try {
            const res = await schwabGetOptionChain({ symbol: sym, expiration: expiry, strikeCount: 50 });
            const n = normalizeSchwabChain(res?.data);
            if (Object.keys(n.chain).length) { norm = n; source = "schwab"; anySchwab = true; }
          } catch { /* fall back to Yahoo */ }
        }
        if (!norm) { try { norm = await yahooChain({ symbol: sym, expiration: expiry }); source = "yahoo"; } catch { /* leave missing */ } }
        if (norm) chains[key] = { norm, source };
      }

      if (cancelled) return;
      const next = {};
      for (const p of positions) {
        const entry = chains[`${p.sym}|${p.expiry}`];
        if (!entry) continue;
        const { norm, source } = entry;
        const bucket = norm.chain?.[p.expiry] || (norm.chain ? Object.values(norm.chain)[0] : null);
        if (!bucket) continue;
        const side = String(p.type).toUpperCase() === "PUT" ? bucket.puts : bucket.calls;
        const hit = (side || []).find((o) => Number(o.strike) === Number(p.strike));
        const px = hit ? mid(hit) : 0;
        const o = {};
        if (px > 0) o.livePrice = px;
        if (norm.underlyingPrice > 0) o.liveUnderlying = norm.underlyingPrice;
        if (Object.keys(o).length) { o.source = source; next[p.id] = o; }
      }
      setLive(next);
      setStatus({ source: anySchwab ? "schwab" : "yahoo", loading: false, error: null, at: Date.now() });
    }

    run();
    const t = refreshMs > 0 ? setInterval(run, refreshMs) : null;
    return () => { cancelled = true; if (t) clearInterval(t); };
  }, [chainKey, schwabOn, refreshMs, positions]);

  return { live, status };
}
