// ─── src/components/ImportFromSchwab.jsx ─────────────────────────────────────
// Pulls open covered calls from the connected Schwab account and lets the user
// add them to the Working tab in one click — no pasting. Shows a raw-positions
// fallback so any unmapped data is visible (and we can calibrate the parser).

import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useBrokerConnection } from "../hooks/useBrokerConnection";
import { schwabGetPositions } from "../services/schwabApi";
import { parseSchwabPositions } from "../lib/schwabPositions";

const usd = (n) => "$" + (Math.abs(n || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportFromSchwab({ onAdd }) {
  const { T } = useTheme();
  const { activeConnection, activeAccount, accounts } = useBrokerConnection();
  const connected = activeConnection?.status === "connected";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [added, setAdded] = useState({});
  const [showRaw, setShowRaw] = useState(false);

  if (!connected) return null;

  const load = async () => {
    setOpen(true); setLoading(true); setError(null); setResult(null); setAdded({});
    try {
      const acct = activeAccount || accounts[0];
      if (!acct?.hashValue) throw new Error("No linked Schwab account found — reconnect in the APIs tab.");
      const data = await schwabGetPositions({ accountHash: acct.hashValue }).then((r) => r.data);
      setResult({ ...parseSchwabPositions(data), raw: data });
    } catch (e) {
      setError(e?.message || "Couldn't load positions from Schwab.");
    } finally { setLoading(false); }
  };

  const add = async (c, i) => {
    const res = await onAdd({
      sym: c.sym, contracts: String(c.contracts), fillStock: String(c.fillStock), fillCall: String(c.fillCall),
      strike: String(c.strike), expiry: c.expiry,
      liveStock: c.liveStock != null ? String(c.liveStock) : "", liveCall: c.liveCall != null ? String(c.liveCall) : "",
      lotId: "new",
    });
    if (res?.ok) setAdded((a) => ({ ...a, [i]: true }));
    else setError(res?.error || "Couldn't add: " + (res?.missing || []).join(", "));
  };

  const btn = { padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: T.fontMono, fontSize: 13, fontWeight: 700 };

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={open ? () => setOpen(false) : load} style={btn}>
        {open ? "Hide Schwab import" : "⬇ Import from Schwab"}
      </button>

      {open && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: 18, marginTop: 12 }}>
          {loading && <div style={{ color: T.textDim }}>Loading your Schwab positions…</div>}
          {error && <div style={{ color: T.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {result && (
            <>
              {result.candidates.length === 0 && !error && (
                <div style={{ color: T.textDim, fontSize: 13 }}>
                  No covered calls detected in this account. If you have some, open “raw positions” below and send it to me — I’ll map it.
                </div>
              )}
              {result.candidates.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 700, fontFamily: T.fontMono }}>
                      {c.sym} · {c.contracts}× ${c.strike} CALL · {c.expiry}
                    </div>
                    <div style={{ color: T.textDim, fontSize: 12 }}>
                      shares cost {usd(c.fillStock)} · call sold {usd(c.fillCall)} · now {usd(c.liveStock)}/{usd(c.liveCall)}
                      {!c.covered && <span style={{ color: T.warn }}> · ⚠ only {c.shares} shares (not fully covered)</span>}
                    </div>
                  </div>
                  {added[i]
                    ? <span style={{ color: T.success, fontSize: 13, fontWeight: 700 }}>✓ Added</span>
                    : <button onClick={() => add(c, i)} style={{ ...btn, background: T.accent, color: "#0A0A0A" }}>Add</button>}
                </div>
              ))}
              {result.unmatchedCalls?.length > 0 && (
                <div style={{ color: T.textDim, fontSize: 12, marginTop: 10 }}>
                  {result.unmatchedCalls.length} call(s) couldn’t be matched to shares (no underlying stock position found).
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setShowRaw((v) => !v)} style={{ background: "none", border: "none", color: T.textDim, fontSize: 12, cursor: "pointer", padding: 0 }}>
                  {showRaw ? "Hide" : "Show"} raw positions (for debugging)
                </button>
                {showRaw && (
                  <pre style={{ marginTop: 8, maxHeight: 280, overflow: "auto", background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 11, color: T.textDim, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(result.raw, null, 2)}
                  </pre>
                )}
              </div>
              <div style={{ color: T.textDim, fontSize: 11, marginTop: 10 }}>
                Note: Schwab reports <b>average</b> cost, so imported shares land as one lot at your average price. Split into real tax lots afterward if you’ve held them across different dates/prices.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
