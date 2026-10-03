// ─── src/components/HistoricalDataTab.jsx ────────────────────────────────────
// Manage the symbols we collect daily covered-call history for: see start dates
// + point counts, add new symbols (collection starts that day forward), remove,
// and (owner/admin) trigger a collection pass now.

import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useTrackedSymbols } from "../hooks/useTrackedSymbols";
import { collectHistoryNow } from "../services/history";

const fmtDate = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  } catch { return "—"; }
};
const fmtWhen = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
  } catch { return "never"; }
};

export default function HistoricalDataTab() {
  const { T } = useTheme();
  const { symbols, loading, addSymbol, removeSymbol } = useTrackedSymbols();
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const inp = { minHeight: 42, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 14 };
  const btn = (primary) => ({ padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, border: `1px solid ${primary ? T.accent : T.border}`, background: primary ? T.accent : T.card, color: primary ? "#0A0A0A" : T.text });
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 };
  const td = { padding: "10px", color: T.text, fontFamily: T.fontMono, fontSize: 13, borderBottom: `1px solid ${T.border}22` };

  const add = async () => {
    const res = await addSymbol(input);
    if (res.ok) { setInput(""); setMsg({ ok: true, text: `Tracking ${res.sym} — collection starts today.` }); }
    else setMsg({ ok: false, text: res.error });
  };
  const collectNow = async () => {
    setBusy(true); setMsg(null);
    try { const r = await collectHistoryNow(); setMsg({ ok: true, text: `Collected ${r.collected}/${r.results.length} symbols.` }); }
    catch (e) { setMsg({ ok: false, text: e?.message?.includes("Admins") ? "Only an owner/admin can run collection." : (e?.message || "Collection failed.") }); }
    finally { setBusy(false); }
  };

  return (
    <div role="region" aria-label="Historical data">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Historical Data</h2>
        <span style={{ color: T.textDim, fontSize: 12 }}>daily IV30 + ATM call snapshots for covered-call analysis</span>
      </div>

      {/* Add + collect */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a ticker (e.g. AAPL)" style={{ ...inp, flex: 1, minWidth: 180 }} />
        <button onClick={add} style={btn(true)}>+ Add symbol</button>
        <button onClick={collectNow} disabled={busy} style={{ ...btn(false), opacity: busy ? 0.6 : 1 }}>{busy ? "Collecting…" : "Collect now"}</button>
      </div>
      {msg && <div style={{ ...card, color: msg.ok ? T.success : T.danger, fontSize: 13, marginTop: -8 }}>{msg.text}</div>}

      {/* Registry table */}
      <div style={{ ...card, padding: "18px 16px" }}>
        {loading ? (
          <div style={{ color: T.textDim }}>Loading…</div>
        ) : symbols.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 13 }}>No symbols tracked yet. Add one above — we’ll snapshot it daily from that date forward.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr>
                {["Symbol", "Type", "Start date", "Data points", "Last collected", ""].map((h, i) => (
                  <th key={i} style={{ ...th, textAlign: i >= 3 && i < 5 ? "right" : "left" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {symbols.map((s) => (
                  <tr key={s.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{s.symbol}</td>
                    <td style={{ ...td, color: T.textDim }}>{s.type || "equity"}</td>
                    <td style={td}>{fmtDate(s.startedAt)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{s.points || 0}</td>
                    <td style={{ ...td, textAlign: "right", color: T.textDim }}>{fmtWhen(s.lastCollectedAt)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button onClick={() => removeSymbol(s.symbol)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 12 }}>remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ color: T.textDim, fontSize: 11, marginTop: 12 }}>
          Automatic collection runs daily after US market close. A full 52-week IV percentile needs ~1 year of history; until then it’s computed over what we’ve collected so far.
        </div>
      </div>
    </div>
  );
}
