// ─── src/components/HistoricalDataTab.jsx ────────────────────────────────────
// Manage the symbols we collect daily covered-call history for: see start dates
// + point counts, add new symbols (collection starts that day forward), remove,
// and (owner/admin) trigger a collection pass now.

import { useState } from "react";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useTrackedSymbols } from "../hooks/useTrackedSymbols";
import { usePositions } from "../hooks/usePositions";
import { collectHistoryNow, backfillHistory } from "../services/history";
import { COVERED_CALL_UNIVERSE } from "../data/coveredCallUniverse";

// Roll daily OHLC samples up into week/month buckets (first open, max high,
// min low, last close). Input is newest-first; output is newest-first too.
const num = (v) => (Number.isFinite(v) && v !== null ? Number(v) : null);
const weekKey = (iso) => { const d = new Date(iso + "T00:00:00"); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); };
function rollup(samples, gran) {
  if (gran === "day") return samples;
  const asc = [...samples].reverse();
  const groups = new Map();
  for (const s of asc) {
    const key = gran === "week" ? weekKey(s.d) : s.d.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const [key, arr] of groups) {
    const closes = arr.map((x) => num(x.c) ?? num(x.price)).filter((v) => v != null);
    const highs = arr.map((x) => num(x.h)).filter((v) => v != null);
    const lows = arr.map((x) => num(x.l)).filter((v) => v != null);
    out.push({
      d: key, label: gran === "month" ? key : `wk ${key}`,
      o: num(arr[0].o) ?? num(arr[0].c) ?? num(arr[0].price),
      h: highs.length ? Math.max(...highs) : (closes.length ? Math.max(...closes) : null),
      l: lows.length ? Math.min(...lows) : (closes.length ? Math.min(...closes) : null),
      c: num(arr[arr.length - 1].c) ?? num(arr[arr.length - 1].price),
    });
  }
  return out.reverse();
}

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
const money = (n) => (Number.isFinite(n) && n !== null ? `$${Number(n).toFixed(2)}` : "—");
const pct = (n) => (Number.isFinite(n) && n ? `${(Number(n) * 100).toFixed(1)}%` : "—");

export default function HistoricalDataTab() {
  const { T } = useTheme();
  const { role } = useAuth();
  const canSeed = role === "owner" || role === "admin";
  const { symbols, loading, addSymbol, removeSymbol, addMany } = useTrackedSymbols();
  const { positions, lots } = usePositions();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [expandList, setExpandList] = useState(true);
  const [menu, setMenu] = useState(null);        // { sym, x, y } — open row menu
  const [dataModal, setDataModal] = useState(null); // { sym, loading, samples, error }
  const [gran, setGran] = useState("day");        // day | week | month (View data)
  const [testing, setTesting] = useState(false);  // ad-hoc "Get data" in progress
  const q = search.trim().toUpperCase();
  const filtered = q ? symbols.filter((s) => s.symbol.includes(q)) : symbols;
  const alreadyTracked = !!input.trim() && symbols.some((s) => s.symbol === input.trim().toUpperCase());

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const inp = { minHeight: 42, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 14 };
  const btn = (primary) => ({ padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, border: `1px solid ${primary ? T.accent : T.border}`, background: primary ? T.accent : T.card, color: primary ? "#0A0A0A" : T.text });
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 };
  const td = { padding: "10px", color: T.text, fontFamily: T.fontMono, fontSize: 13, borderBottom: `1px solid ${T.border}22` };

  const add = async () => {
    const res = await addSymbol(input);
    if (res.ok) { setInput(""); setExpandList(true); setMsg({ ok: true, text: `Tracking ${res.sym} — collection starts today.` }); }
    else setMsg({ ok: false, text: res.error });
  };
  const collectNow = async () => {
    setBusy(true); setMsg(null);
    try { const r = await collectHistoryNow(); setMsg({ ok: true, text: `Collected ${r.collected}/${r.results.length} symbols.` }); }
    catch (e) { setMsg({ ok: false, text: e?.message?.includes("Admins") ? "Only an owner/admin can run collection." : (e?.message || "Collection failed.") }); }
    finally { setBusy(false); }
  };
  // Ad-hoc: pull 2 years for whatever ticker is in the input and show it, WITHOUT
  // adding it to daily tracking — for quickly testing a stock you're eyeing.
  const getData = async () => {
    const sym = input.trim().toUpperCase();
    if (!/^[A-Z.]{1,6}$/.test(sym)) { setMsg({ ok: false, text: "Enter a valid ticker to test (e.g. AAPL)." }); return; }
    setTesting(true); setMsg({ ok: true, text: `Pulling 2 years of history for ${sym}…` });
    try {
      const r = await backfillHistory({ symbol: sym, years: 2, track: false });
      const res = r.results?.[0];
      if (res?.error) { setMsg({ ok: false, text: `Couldn't get ${sym}: ${res.error}` }); }
      else { setMsg({ ok: true, text: `Loaded ${res?.total || 0} days for ${sym} — opening…` }); setGran("day"); openData(sym); }
    } catch (e) {
      setMsg({ ok: false, text: e?.message?.includes("Admins") ? "Only an owner/admin can pull data." : (e?.message || "Could not get data.") });
    } finally { setTesting(false); }
  };
  const backfill = async () => {
    setBusy(true); setMsg({ ok: true, text: "Backfilling ~2 years of daily history… this can take a minute." });
    try { const r = await backfillHistory({ years: 2 }); setMsg({ ok: true, text: `Backfilled daily OHLC for ${r.count}/${r.total} symbols (2 years).` }); }
    catch (e) { setMsg({ ok: false, text: e?.message?.includes("Admins") ? "Only an owner/admin can backfill." : (e?.message || "Backfill failed.") }); }
    finally { setBusy(false); }
  };
  const seedUniverse = async () => {
    setSeeding(true); setMsg(null);
    const res = await addMany(COVERED_CALL_UNIVERSE);
    if (res.ok) { setExpandList(true); setSearch(""); setMsg({ ok: true, text: `Seeded ${res.added} new symbol${res.added === 1 ? "" : "s"} (${res.skipped} already tracked). Collection starts today.` }); }
    else setMsg({ ok: false, text: res.error });
    setSeeding(false);
  };
  const claimOwner = async () => {
    setSeeding(true); setMsg(null);
    try {
      await httpsCallable(getFunctions(getApp()), "claimOwnership")();
      setMsg({ ok: true, text: "You're now the owner. Reloading…" });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMsg({ ok: false, text: e?.message || "Could not claim ownership." });
      setSeeding(false);
    }
  };
  const openData = async (sym) => {
    setMenu(null); setGran("day");
    setDataModal({ sym, loading: true, samples: [], error: null });
    try {
      const snap = await getDoc(doc(getFirestore(), "history", sym));
      const samples = snap.exists() ? (snap.data().samples || []) : [];
      setDataModal({ sym, loading: false, samples: [...samples].reverse(), error: null }); // newest first
    } catch (e) {
      setDataModal({ sym, loading: false, samples: [], error: e?.message || "Could not load data." });
    }
  };
  const seedHoldings = async () => {
    const held = [...new Set([...(positions || []), ...(lots || [])].map((p) => p?.sym).filter(Boolean))];
    if (held.length === 0) { setMsg({ ok: false, text: "No holdings found yet — add positions (or import from Schwab) first." }); return; }
    setSeeding(true); setMsg(null);
    const res = await addMany(held);
    if (res.ok) { setExpandList(true); setSearch(""); setMsg({ ok: true, text: `Added ${res.added} of your held symbol${res.added === 1 ? "" : "s"} (${res.skipped} already tracked).` }); }
    else setMsg({ ok: false, text: res.error });
    setSeeding(false);
  };

  return (
    <div role="region" aria-label="Historical data">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 20, margin: 0 }}>Historical Data</h2>
        <span style={{ color: T.textDim, fontSize: 12 }}>daily IV30 + ATM call snapshots for covered-call analysis</span>
      </div>

      {/* Status strip — access level + live tracked count (also diagnostic) */}
      <div style={{ ...card, marginBottom: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontFamily: T.fontMono, fontSize: 12 }}>
        <span style={{ color: T.text }}>
          <span style={{ color: T.textDim }}>Tracked:</span> <b style={{ color: T.accent }}>{loading ? "…" : symbols.length}</b>
        </span>
        <span style={{ color: T.border }}>|</span>
        <span style={{ color: T.text }}>
          <span style={{ color: T.textDim }}>Your access:</span> <b style={{ color: canSeed ? T.success : T.warning || T.textDim }}>{role || "viewer"}</b>
        </span>
        <span style={{ color: T.textDim }}>
          {canSeed ? "— you can add & seed symbols" : "— view-only: an owner/admin must seed (your writes are blocked)"}
        </span>
        {!canSeed && (
          <button onClick={claimOwner} disabled={seeding} style={{ ...btn(true), padding: "6px 12px", fontSize: 12, marginLeft: "auto", opacity: seeding ? 0.6 : 1 }}>
            {seeding ? "Working…" : "Claim owner access"}
          </button>
        )}
      </div>

      {/* Add + collect */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a ticker (e.g. AAPL)" style={{ ...inp, flex: 1, minWidth: 180 }} />
        <button onClick={add} disabled={alreadyTracked} style={{ ...btn(true), opacity: alreadyTracked ? 0.5 : 1 }}>{alreadyTracked ? "Already tracked" : "+ Add symbol"}</button>
        <button onClick={getData} disabled={testing || !input.trim()} title="Pull 2 years of history for this ticker and view it — without adding it to daily tracking" style={{ ...btn(true), opacity: (testing || !input.trim()) ? 0.6 : 1 }}>{testing ? "Getting…" : "Get data ↗"}</button>
        <button onClick={collectNow} disabled={busy} style={{ ...btn(false), opacity: busy ? 0.6 : 1 }}>{busy ? "Working…" : "Collect now"}</button>
        <button onClick={backfill} disabled={busy} title="Load ~2 years of real daily open/high/low/close so you can test trends now" style={{ ...btn(false), opacity: busy ? 0.6 : 1 }}>{busy ? "Working…" : "Backfill 2yr"}</button>
      </div>

      {/* Bulk seed */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: -8 }}>
        <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono, flex: 1, minWidth: 180 }}>
          Seed the tracked list in one click — indexes + Technology & Healthcare ({COVERED_CALL_UNIVERSE.length} names), or just the tickers you hold.
        </span>
        <button onClick={seedUniverse} disabled={seeding} style={{ ...btn(true), opacity: seeding ? 0.6 : 1 }}>{seeding ? "Seeding…" : `+ Seed covered-call universe (${COVERED_CALL_UNIVERSE.length})`}</button>
        <button onClick={seedHoldings} disabled={seeding} style={{ ...btn(false), opacity: seeding ? 0.6 : 1 }}>+ Add my holdings</button>
      </div>
      {msg && <div style={{ ...card, color: msg.ok ? T.success : T.danger, fontSize: 13, marginTop: -8 }}>{msg.text}</div>}

      {/* Registry table (collapsible) */}
      <div style={{ ...card, padding: "18px 16px" }}>
        {/* Header with open/close toggle on the right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button onClick={() => setExpandList(!expandList)} style={{ display: "flex", alignItems: "baseline", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
            <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0, fontWeight: 600 }}>Tracked symbols</h3>
            <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>{symbols.length} tracked</span>
          </button>
          <button onClick={() => setExpandList(!expandList)} aria-label={expandList ? "Collapse" : "Expand"} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", width: 30, height: 30, borderRadius: 7, fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{expandList ? "−" : "+"}</button>
        </div>

        {expandList && (<>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "14px 0 12px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 160, display: "flex" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tracked symbols…" style={{ ...inp, flex: 1, paddingRight: search ? 32 : 12 }} />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search" title="Clear search"
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 4 }}>✕</button>
              )}
            </div>
            <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>
              {filtered.length} of {symbols.length} shown
              {search && <> · <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, padding: 0, textDecoration: "underline" }}>show all</button></>}
            </span>
          </div>
          {loading ? (
            <div style={{ color: T.textDim }}>Loading…</div>
          ) : symbols.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: 13 }}>No symbols tracked yet. Add one above — we’ll snapshot it daily from that date forward.</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: 13 }}>No tracked symbols match “{search}”.</div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead><tr>
                  {["Symbol", "Type", "Start date", "Data points", "Last collected", ""].map((h, i) => (
                    <th key={i} style={{ ...th, textAlign: i >= 3 && i < 5 ? "right" : "left", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 700 }}>{s.symbol}</td>
                      <td style={{ ...td, color: T.textDim }}>{s.type || "equity"}</td>
                      <td style={td}>{fmtDate(s.startedAt)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{s.points || 0}</td>
                      <td style={{ ...td, textAlign: "right", color: T.textDim }}>{fmtWhen(s.lastCollectedAt)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenu(menu?.sym === s.symbol ? null : { sym: s.symbol, x: r.right, y: r.bottom });
                        }} aria-label={`Menu for ${s.symbol}`} title="Options" style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 8px", borderRadius: 6 }}>⋮</button>
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
        </>)}
      </div>

      {/* Row actions menu (⋮) — anchored to the clicked button, closes on outside click */}
      {menu && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
          <div style={{ position: "fixed", top: menu.y + 4, left: Math.max(8, menu.x - 160), width: 160, zIndex: 201, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 10px 30px #00000066", overflow: "hidden" }}>
            {[
              { label: "📊 View data", onClick: () => openData(menu.sym), color: T.text },
              { label: "🗑  Remove", onClick: () => { const sym = menu.sym; setMenu(null); removeSymbol(sym); }, color: T.danger },
            ].map((item, i) => (
              <button key={i} onClick={item.onClick}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: i ? `1px solid ${T.border}` : "none", color: item.color, cursor: "pointer", fontFamily: T.fontMono, fontSize: 13, padding: "11px 14px" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.inputBg || T.surface)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* View data modal — the collected daily samples for one symbol */}
      {dataModal && (
        <div onClick={() => setDataModal(null)} style={{ position: "fixed", inset: 0, background: "#000000b0", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, width: "min(820px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: 0 }}>{dataModal.sym}</h3>
                <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>
                  {!dataModal.loading && !dataModal.error ? `${dataModal.samples.length} day${dataModal.samples.length === 1 ? "" : "s"} of history` : "collected history"}
                </span>
              </div>
              <button onClick={() => setDataModal(null)} aria-label="Close" style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            {!dataModal.loading && !dataModal.error && dataModal.samples.length > 0 && (
              <div style={{ display: "flex", gap: 6, padding: "12px 16px 0", alignItems: "center", flexWrap: "wrap" }}>
                {["day", "week", "month"].map((g) => (
                  <button key={g} onClick={() => setGran(g)} style={{ padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, textTransform: "capitalize", border: `1px solid ${gran === g ? T.accent : T.border}`, background: gran === g ? T.accent : "transparent", color: gran === g ? "#0A0A0A" : T.textDim }}>{g}</button>
                ))}
                <span style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, marginLeft: 6 }}>Open = start of {gran} · Close = end · Chg% vs prior {gran}</span>
              </div>
            )}
            <div style={{ overflow: "auto", padding: "8px 16px 16px" }}>
              {dataModal.loading ? (
                <div style={{ color: T.textDim, fontSize: 13, padding: 20 }}>Loading…</div>
              ) : dataModal.error ? (
                <div style={{ color: T.danger, fontSize: 13, padding: 20 }}>{dataModal.error}</div>
              ) : dataModal.samples.length === 0 ? (
                <div style={{ color: T.textDim, fontSize: 13, padding: 20 }}>
                  No data stored yet for {dataModal.sym}. Hit “Backfill 2yr” to load real daily history, or “Collect now” for today’s point.
                </div>
              ) : (() => {
                const rows = rollup(dataModal.samples, gran);
                const showOpts = gran === "day";
                const cols = showOpts ? ["Date", "Open", "High", "Low", "Close", "Chg%", "IV30", "Call bid"] : ["Period", "Open", "High", "Low", "Close", "Chg%"];
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showOpts ? 680 : 520 }}>
                    <thead><tr>
                      {cols.map((h, i) => (
                        <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "right", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {rows.map((s, i) => {
                        const prevC = num(rows[i + 1]?.c);
                        const c = num(s.c) ?? num(s.price);
                        const chg = prevC && c != null ? ((c - prevC) / prevC) * 100 : null;
                        return (
                          <tr key={i}>
                            <td style={td}>{s.label || s.d}</td>
                            <td style={{ ...td, textAlign: "right" }}>{money(s.o)}</td>
                            <td style={{ ...td, textAlign: "right" }}>{money(s.h)}</td>
                            <td style={{ ...td, textAlign: "right" }}>{money(s.l)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(c)}</td>
                            <td style={{ ...td, textAlign: "right", color: chg == null ? T.textDim : chg >= 0 ? T.success : T.danger }}>{chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}</td>
                            {showOpts && <td style={{ ...td, textAlign: "right" }}>{pct(s.iv)}</td>}
                            {showOpts && <td style={{ ...td, textAlign: "right" }}>{money(s.callBid)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
