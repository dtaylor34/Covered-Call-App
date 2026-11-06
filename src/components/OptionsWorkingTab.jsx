// ─── src/components/OptionsWorkingTab.jsx ────────────────────────────────────
// Options Manager → Working: open single-leg option positions (long/short calls
// & puts, equity + futures/treasury options) with live P&L, per-position charts,
// and exit actions. Mirrors the Covered Calls Working tab for general options.

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionPositions } from "../hooks/useOptionPositions";
import { optionCalcs, moneyness, daysToExpiry, optType, isLong, freeRollPlan, closedOptionPnL } from "../lib/optionsMath";
import { useBrokerConnection } from "../hooks/useBrokerConnection";
import { schwabGetPositions } from "../services/schwabApi";
import { parseSchwabOptionPositions } from "../lib/schwabPositions";
import { useOptionLive } from "../hooks/useOptionLive";
import { groupIntoStrategies, strategyCalcs, profitTargets, sellTargets } from "../lib/optionStrategies";
import OptionPositionChart from "./OptionPositionChart";
import StrategyPositionChart from "./StrategyPositionChart";

// Comparable key for a leg (ignores account) — used to diff against Schwab's live set.
const legKey = (p) => `${String(p.sym || "").toUpperCase()}|${String(p.type || "").toUpperCase()}|${Number(p.strike) || 0}|${p.expiry}|${String(p.direction || "long").toLowerCase()}`;

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const usd0 = (n) => "$" + Math.round(Math.abs(n || 0)).toLocaleString("en-US"); // whole-dollar, for the "= $total" line
const FEE_PER_CONTRACT = 0.69; // sell/close estimate ($0.65 commission + ~$0.04 regulatory) — used by the Sell-N-now net gain

// Every fee that DEBITS the account over a round trip (open buy + close sell) of an
// equity-option position. Regulatory/exchange rates are approximate and change over
// time. `closePremium` drives the SEC fee (charged on the sale proceeds).
function optionFees(contracts, closePremium) {
  const n = Math.max(1, Math.round(contracts || 1));
  const sellProceeds = Math.max(0, Number(closePremium) || 0) * 100 * n;
  const items = [
    { label: "Commission — $0.65/ct, open + close", amount: 0.65 * n * 2 },
    { label: "Options reg. + clearing (ORF/OCC), both sides", amount: 0.04 * n * 2 },
    { label: "FINRA TAF — on close sale", amount: 0.00279 * n },
    { label: "SEC fee — on close sale", amount: 0.0000278 * sellProceeds },
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items };
}
function feeTooltipText(fees) {
  return [
    `Fees that debit your account, round trip — ${usd(fees.total)}:`,
    ...fees.items.map((it) => `• ${it.label}: ${usd(it.amount)}`),
    "Regulatory/exchange rates are estimates and change over time.",
  ].join("\n");
}

// Google Material "expand_more" chevron (inline SVG path) — rotates 180° when open.
function Chevron({ open, color, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color || "currentColor"} aria-hidden="true"
      style={{ transition: "transform 0.15s ease", transform: open ? "rotate(180deg)" : "none", display: "block" }}>
      <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
    </svg>
  );
}

// US equity-options regular session: 9:30am–4:00pm ET, Mon–Fri. Outside it,
// options don't trade, so marks are the last close — any P&L is "as of close,"
// not live, even while the underlying keeps printing after-hours.
function marketOpenNow(d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const wd = p.find((x) => x.type === "weekday")?.value;
    const mins = Number(p.find((x) => x.type === "hour")?.value) * 60 + Number(p.find((x) => x.type === "minute")?.value);
    if (wd === "Sat" || wd === "Sun") return false;
    return mins >= 570 && mins < 960; // 9:30 .. 16:00 ET
  } catch { return true; } // if we can't resolve the TZ, don't nag
}
const fmtClock = (ms) => { try { return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Compact free-roll status for a single-leg row (full detail lives in ManagePanel).
function manageChip(T, p, c) {
  const fr = freeRollPlan(p);
  if (fr.freeRunning) return { label: `Free · ${c.qty}`, color: T.success, bg: `${T.success}22`, title: "Cost fully recovered — these contracts are house money." };
  if (!fr.applicable) {
    if (!c.long) return { label: "short", color: T.textDim, bg: `${T.border}66`, title: "Short option — manage by buying it back to lock in the gain." };
    return { label: "1 lot", color: T.textDim, bg: `${T.border}66`, title: "Single contract — can't sell half; this is an all-or-nothing exit." };
  }
  if (fr.ready) return { label: "Sell ½ ✓", color: T.success, bg: `${T.success}22`, title: `Selling ${fr.sellQty} now recovers your full cost — the other ${fr.keepQty} run free.` };
  const pct = Math.max(0, Math.min(99, Math.round(fr.progressPct)));
  return { label: `⟳ ${pct}%`, color: T.warn, bg: `${T.warn}18`, title: `${pct}% of the way to free-roll — sell ${fr.sellQty} at ${usd(fr.freeRollPrice)} to get your cost back.` };
}
const csExp = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}` : ""; };
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);

export default function OptionsWorkingTab() {
  const { T } = useTheme();
  const { positions, closed, loading, savePosition, updateLive, closePosition, scaleOut, combineIntoStrategy, ungroupStrategy, deletePosition } = useOptionPositions();
  const { activeConnection, activeAccount, accounts } = useBrokerConnection();
  const schwabConnected = activeConnection?.status === "connected";
  const mktOpen = marketOpenNow();
  const [open, setOpen] = useState({});
  const [selected, setSelected] = useState({}); // id -> true, for combine / delete
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);

  // Live marks (Schwab-first, Yahoo fallback), merged over stored prices for display.
  const { live, status: liveStatus } = useOptionLive(positions);
  const livePositions = useMemo(() => positions.map((p) => {
    const lv = live[p.id];
    return lv ? { ...p, livePrice: lv.livePrice ?? p.livePrice, liveUnderlying: lv.liveUnderlying ?? p.liveUnderlying } : p;
  }), [positions, live]);
  const groups = useMemo(() => groupIntoStrategies(livePositions), [livePositions]);
  const multiGroups = useMemo(() => groups.filter((g) => g.multiLeg), [groups]);
  const singleLegs = useMemo(() => groups.filter((g) => !g.multiLeg).map((g) => g.legs[0]), [groups]);

  const acctShort = (p) => { if (!p?.acct && !p?.acctId) return null; const a = (accounts || []).find((x) => x.accountId === p?.acctId) || (accounts || []).find((x) => String(x.accountId || "").slice(-4) === p?.acct); return a?.label || (p.acct ? `··${p.acct}` : null); };

  // Sync = import new positions + refresh marks + archive anything Schwab no longer
  // shows (closed/expired/assigned at the broker) so working + history stay current.
  const syncFromSchwab = async () => {
    const accts = (accounts && accounts.length) ? accounts : (activeAccount ? [activeAccount] : []);
    if (!accts.some((a) => a?.hashValue)) { setImportMsg({ ok: false, text: "No linked Schwab account — reconnect in the APIs tab." }); return; }
    setImporting(true); setImportMsg({ ok: true, text: "Syncing with Schwab…" });
    try {
      let added = 0, acctsHit = 0, closedCt = 0, skippedCC = 0, removedCC = 0;
      const pulledByAcct = {};  // acctId -> Set(legKey) of standalone options at broker
      const coveredByAcct = {}; // acctId -> Set(legKey) of covered calls (kept in the CC tracker)
      for (const acct of accts) {
        if (!acct?.hashValue) continue;
        const acctTag = String(acct.accountId || "").slice(-4);
        const data = await schwabGetPositions({ accountHash: acct.hashValue }).then((r) => r.data).catch(() => null);
        if (!data) continue;
        acctsHit++;
        const keys = new Set(), ccKeys = new Set();
        for (const o of parseSchwabOptionPositions(data)) {
          if (o.coveredCall) { ccKeys.add(legKey(o)); skippedCC++; continue; } // lives in the Covered Calls tab
          keys.add(legKey(o));
          const r = await savePosition({ ...o, acct: acctTag, acctId: acct.accountId });
          if (r.ok) added++;
        }
        pulledByAcct[acct.accountId] = keys;
        coveredByAcct[acct.accountId] = ccKeys;
      }
      // Reconcile tracked positions against what's at the broker.
      for (const p of positions) {
        if (!p.acctId || !(p.acctId in pulledByAcct)) continue;                 // only accounts we reached
        if (coveredByAcct[p.acctId]?.has(legKey(p))) { await deletePosition(p.id); removedCC++; continue; } // now a covered call → remove (it's in the CC tracker)
        if (pulledByAcct[p.acctId].has(legKey(p))) continue;                    // still open standalone
        const dte = daysToExpiry(p.expiry);
        await closePosition(p.id, dte != null && dte < 0 ? "expired" : "sold", { exitPrice: Number(p.livePrice) || 0 });
        closedCt++;
      }
      const bits = [`${added} imported/updated`];
      if (closedCt) bits.push(`${closedCt} moved to history`);
      if (removedCC) bits.push(`${removedCC} covered call${removedCC === 1 ? "" : "s"} removed (tracked in Covered Calls)`);
      else if (skippedCC) bits.push(`${skippedCC} covered call${skippedCC === 1 ? "" : "s"} kept in the Covered Calls tab`);
      setImportMsg({ ok: true, text: acctsHit ? `Synced ${acctsHit} account${acctsHit === 1 ? "" : "s"}: ${bits.join(", ")}.` : "Couldn't reach Schwab." });
    } catch (e) { setImportMsg({ ok: false, text: e?.message || "Sync failed." }); }
    finally { setImporting(false); }
  };

  const rows = useMemo(() => singleLegs.map((p) => {
    const c = optionCalcs(p);
    const m = moneyness(p, p.liveUnderlying ?? p.fillUnderlying);
    const dte = daysToExpiry(p.expiry);
    return { p, c, m, dte };
  }).sort((a, b) => (a.dte ?? 1e9) - (b.dte ?? 1e9)), [singleLegs]);

  const toggleSel = (id) => setSelected((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => singleLegs.some((p) => p.id === id)), [selected, singleLegs]);
  const doCombine = async () => {
    if (selectedIds.length < 2) return;
    await combineIntoStrategy(selectedIds);
    setSelected({});
    setImportMsg({ ok: true, text: `Combined ${selectedIds.length} legs into a strategy. Expand the card for the combined chart; use “Ungroup” to split them back apart.` });
  };
  const doDeleteSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    for (const id of ids) await deletePosition(id); // hard delete — nothing recorded to history
    setSelected({}); setConfirmBulkDel(false);
    setImportMsg({ ok: true, text: `Deleted ${ids.length} position${ids.length === 1 ? "" : "s"} (no history record).` });
  };

  // Current value is split by calls vs puts and kept direction-aware: a long
  // option is an asset you'd sell (+value), a short is a liability you'd buy back
  // (−value). Total value = call + put = what the book is worth to close now.
  const totals = useMemo(() => livePositions.reduce((a, p) => {
    const c = optionCalcs(p);
    const v = c.long ? c.value : -c.value;       // net liq contribution
    const paid = c.long ? c.cost : 0;            // what you paid (longs only)
    return {
      cost: a.cost + paid,
      credit: a.credit + (c.long ? 0 : c.cost),
      callCost: a.callCost + (c.call ? paid : 0),
      putCost: a.putCost + (c.call ? 0 : paid),
      callValue: a.callValue + (c.call ? v : 0),
      putValue: a.putValue + (c.call ? 0 : v),
      value: a.value + v,
      pl: a.pl + c.pl,
    };
  }, { cost: 0, credit: 0, callCost: 0, putCost: 0, callValue: 0, putValue: 0, value: 0, pl: 0 }), [livePositions]);
  // Realized P&L banked from closed/scaled-out option trades (0 until you take one).
  const realizedPL = useMemo(() => (closed || []).reduce((s, r) => s + (closedOptionPnL(r).pl || 0), 0), [closed]);
  const hasShort = useMemo(() => livePositions.some((p) => !isLong(p)), [livePositions]);
  const hasCalls = useMemo(() => livePositions.some((p) => optType(p) === "CALL"), [livePositions]);
  const hasPuts = useMemo(() => livePositions.some((p) => optType(p) === "PUT"), [livePositions]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const h3 = { color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 };
  // Flexible (fr) columns so content spreads evenly across the full width instead
  // of bunching to the left; min widths keep each cell readable before scrolling.
  const COLS = "28px minmax(150px,2.1fr) minmax(92px,1fr) minmax(100px,1.15fr) minmax(78px,0.85fr) minmax(165px,1.9fr) minmax(74px,0.9fr) 32px";

  return (
    <div role="region" aria-label="Working options" style={{ fontVariantNumeric: "tabular-nums" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ ...h3, fontSize: 20 }}>Working Options</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {livePositions.length > 0 && (
            <span title={!mktOpen ? "Options stopped trading at 4:00pm ET. These marks (and P&L) are from the close and won't reflect after-hours moves in the underlying." : undefined}
              style={{ color: liveStatus.loading ? T.textDim : !mktOpen ? (T.warn || T.textDim) : liveStatus.source === "schwab" ? T.success : T.textDim, fontSize: 10, fontFamily: T.fontChart }}>
              {liveStatus.loading ? "updating…"
                : !mktOpen ? `⏸ marks as of close${liveStatus.at ? " · " + fmtClock(liveStatus.at) : ""}`
                : liveStatus.source === "schwab" ? "● Schwab live"
                : "Yahoo · 15-min delayed"}
            </span>
          )}
          {schwabConnected && (
            <button onClick={syncFromSchwab} disabled={importing} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: T.fontChart, fontSize: 13, fontWeight: 700, opacity: importing ? 0.6 : 1 }}>
              {importing ? "Syncing…" : "⟳ Sync from Schwab"}
            </button>
          )}
          <button onClick={() => setShowAdd((v) => !v)} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: showAdd ? "transparent" : T.accent, color: showAdd ? T.accent : "#0A0A0A", fontFamily: T.fontChart, fontSize: 13, fontWeight: 700 }}>{showAdd ? "Close" : "+ Add"}</button>
        </div>
      </div>

      {importMsg && <div style={{ marginBottom: 12, color: importMsg.ok ? T.textDim : T.danger, fontFamily: T.fontChart, fontSize: 12 }}>{importMsg.text}</div>}
      {showAdd && <AddOptionForm T={T} onSave={savePosition} onDone={() => setShowAdd(false)} />}

      {livePositions.length > 0 && !mktOpen && (
        <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 8, border: `1px solid ${(T.warn || T.textDim)}44`, background: `${(T.warn || T.textDim)}12`, color: T.textDim, fontFamily: T.fontChart, fontSize: 11.5, lineHeight: 1.5 }}>
          ⏸ <b style={{ color: T.text }}>Market closed.</b> Options don’t trade after hours, so every mark below — <b>current value, open P&amp;L, and the gain targets</b> — is <b>as of the 4:00pm close</b>. It won’t reflect the underlying’s after-hours move until the market reopens.
        </div>
      )}

      {livePositions.length > 0 && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          {totals.credit > 0 && <Tot T={T} label="Received (sold)" value={usd(totals.credit)} color={T.success} tip="Money IN — premium collected for options you SOLD (short). “Credit” in broker terms. Hidden when you hold no shorts." />}
          {hasCalls && <TotStack T={T} label="Call value" topLabel="Paid" topValue={usd(totals.callCost)}
            bottom={usd(totals.callValue)} bottomColor={totals.callValue >= totals.callCost ? T.success : T.danger}
            tip="Top: what you paid for your calls. Bottom: what they're worth now — green if up, red if down." />}
          {hasPuts && <TotStack T={T} label="Put value" topLabel="Paid" topValue={usd(totals.putCost)}
            bottom={usd(totals.putValue)} bottomColor={totals.putValue >= totals.putCost ? T.success : T.danger}
            tip="Top: what you paid for your puts. Bottom: what they're worth now — green if up, red if down." />}
          <TotStack T={T} label="Total value" topLabel="Paid" topValue={usd(totals.cost)}
            bottom={usd(totals.value)} bottomColor={totals.value >= totals.cost ? T.success : T.danger}
            tip={`Top: total you paid in. Bottom: what the whole book is worth to close now${hasShort ? " (long +, short −)" : ""} = Call value + Put value.`} />
          <TotStack T={T} label="Open P&L" topLabel="Realized" topValue={usd(realizedPL, true)}
            bottom={usd(totals.pl, true)} bottomColor={totals.pl >= 0 ? T.success : T.danger}
            tip="Top: profit already banked from closed / scaled-out trades. Bottom: the open (unrealized) gain or loss on what you still hold." />
        </div>
      )}

      {loading ? (
        <div style={{ ...card, color: T.textDim }}>Loading positions…</div>
      ) : livePositions.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧩</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, marginBottom: 6 }}>No working options yet</div>
          <div style={{ color: T.textDim, fontSize: 13, maxWidth: 440, margin: "0 auto" }}>
            {schwabConnected ? "Use “Sync from Schwab” to pull your open option positions, or add one by hand." : "Add an option by hand, or connect Schwab in the APIs tab to import your positions."}
          </div>
        </div>
      ) : (<>
        {multiGroups.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            {multiGroups.map((g) => (
              <StrategyCard key={g.key} T={T} group={g} onClose={closePosition} onUngroup={() => ungroupStrategy(g.legs.map((l) => l.id))} onDelete={() => g.legs.forEach((l) => deletePosition(l.id))} acctLabel={acctShort(g.legs[0])} />
            ))}
          </div>
        )}
        {rows.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: selectedIds.length ? `1px solid ${T.border}` : "none" }}>
            {multiGroups.length > 0 && <span style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontChart, letterSpacing: 0.5, textTransform: "uppercase" }}>Single-leg positions</span>}
            {selectedIds.length > 0 && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontChart }}>{selectedIds.length} selected</span>
                <button onClick={doCombine} disabled={selectedIds.length < 2} title={selectedIds.length < 2 ? "Select 2 or more legs to combine" : "Combine the selected legs into one strategy card"} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.accent}`, background: selectedIds.length < 2 ? "transparent" : T.accent, color: selectedIds.length < 2 ? T.accent : "#0A0A0A", opacity: selectedIds.length < 2 ? 0.6 : 1, fontFamily: T.fontChart, fontSize: 12, fontWeight: 700, cursor: selectedIds.length < 2 ? "default" : "pointer" }}>⧉ Combine into strategy</button>
                {confirmBulkDel ? (
                  <>
                    <span style={{ color: T.danger, fontSize: 11, fontFamily: T.fontChart }}>Delete {selectedIds.length}? (no history)</span>
                    <button onClick={doDeleteSelected} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.danger}`, background: T.danger, color: "#0A0A0A", fontFamily: T.fontChart, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                    <button onClick={() => setConfirmBulkDel(false)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: T.fontChart, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmBulkDel(true)} title="Permanently remove the selected positions (no history record) — e.g. sample or mistaken entries" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.danger}`, background: "transparent", color: T.danger, fontFamily: T.fontChart, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑 Delete</button>
                )}
                <button onClick={() => { setSelected({}); setConfirmBulkDel(false); }} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: T.fontChart, fontSize: 12, cursor: "pointer" }}>Clear</button>
              </span>
            )}
          </div>
          <div style={{ minWidth: 840 }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "9px 16px", borderBottom: `1px solid ${T.border}` }}>
              {["", "Contract", "Paid in", "Now", "Fees", "Sell to gain (vs paid)", "Manage", ""].map((h, i) => (
                <div key={i} style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontChart, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
              ))}
            </div>
            {rows.map(({ p, c, m, dte }) => {
              const isOpen = !!open[p.id];
              const isSel = !!selected[p.id];
              const chip = manageChip(T, p, c);
              const fees = optionFees(c.qty, c.live);
              const main = { fontFamily: T.fontChart, fontSize: 13, color: T.text, fontWeight: 700, whiteSpace: "nowrap" };
              const sub = { fontFamily: T.fontChart, fontSize: 10.5, color: T.textDim, whiteSpace: "nowrap", marginTop: 1 };
              return (
                <div key={p.id} style={{ borderBottom: `1px solid ${T.border}`, background: isOpen ? T.card : isSel ? T.accentDim : "transparent" }}>
                  <div onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} style={{ cursor: "pointer", padding: "11px 16px", display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleSel(p.id); }} title="Select to combine into a strategy" style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" readOnly checked={isSel} style={{ cursor: "pointer", accentColor: T.accent }} />
                    </div>

                    {/* Contract — strike / side / expiry / DTE / moneyness folded in */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...main, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.itm ? T.accent : T.border, flexShrink: 0 }} />
                        {p.sym} {optType(p)}
                        {acctShort(p) && <span title={`Schwab account ${acctShort(p)}`} style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4 }}>{acctShort(p)}</span>}
                      </div>
                      <div style={sub}><span style={{ fontWeight: 700, color: T.text }}>{c.qty}X</span> · {usd(p.strike)} · <span style={{ color: c.long ? T.success : T.danger, fontWeight: 700 }}>{c.long ? "LONG" : "SHORT"}</span></div>
                      <div style={sub}>{csExp(p.expiry)} · {dte != null ? `${dte}d` : "—"} · <span style={{ color: m.itm ? T.accent : T.textDim }}>{m.label}</span></div>
                    </div>

                    {/* Paid in — total cost to enter (credit received, for a short) + per-share */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...main, color: c.long ? T.text : T.success }}>{usd(c.cost)}</div>
                      <div style={sub}>{c.long ? "" : "credit "}{usd(c.fill)}/sh</div>
                    </div>

                    {/* Now — current value + per-share + % vs what you paid */}
                    <div style={{ minWidth: 0 }}>
                      <div style={main}>{usd(c.value)}</div>
                      <div style={sub}>{usd(c.live)}/sh · <span style={{ color: c.pl >= 0 ? T.success : T.danger, fontWeight: 700 }}>{c.plPct >= 0 ? "+" : ""}{c.plPct.toFixed(0)}%</span></div>
                    </div>

                    {/* Fees — every broker/regulatory fee that debits the account, round trip (open + close); itemized in the ⓘ */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...main, display: "inline-flex", alignItems: "baseline" }}>{usd(fees.total)}<InfoDot T={T} text={feeTooltipText(fees)} /></div>
                      <div style={sub}>in + out</div>
                    </div>

                    {/* Sell to gain — sell price for each TOTAL gain vs what you paid, + the $ profit */}
                    <div style={{ minWidth: 0 }} title={c.long
                      ? `Sell price to lock each total gain, measured against your ${usd(c.fill)}/sh entry. $ = profit on all ${c.qty} contract${c.qty === 1 ? "" : "s"}.`
                      : `Buy-back price to keep each % of the ${usd(c.cost)} credit you collected.`}>
                      {c.long ? (<>
                        <div style={{ ...main, fontSize: 12 }}>+50% <span style={{ color: T.textDim }}>→</span> {usd(c.fill * 1.5)} <span style={{ color: T.success }}>+{usd0(0.5 * c.cost)}</span></div>
                        <div style={{ ...sub, color: T.success }}>+100% → {usd(c.fill * 2)} +{usd0(c.cost)} · free-roll</div>
                      </>) : (<>
                        <div style={{ ...main, fontSize: 12 }}>keep 50% <span style={{ color: T.textDim }}>→</span> buy back {usd(c.fill * 0.5)}</div>
                        <div style={sub}>keep 75% → buy back {usd(c.fill * 0.25)}</div>
                      </>)}
                    </div>

                    <div style={{ minWidth: 0 }}>{chip && <span title={chip.title} style={{ fontSize: 10, fontWeight: 700, color: chip.color, background: chip.bg, padding: "2px 7px", borderRadius: 5, fontFamily: T.fontChart, whiteSpace: "nowrap" }}>{chip.label}</span>}</div>
                    <div style={{ display: "flex", justifyContent: "flex-end", color: T.textDim }}><Chevron open={isOpen} color={T.textDim} /></div>
                  </div>
                  {isOpen && <OptionDetail T={T} p={p} c={c} m={m} dte={dte} onUpdate={updateLive} onClose={closePosition} onScaleOut={scaleOut} onDelete={deletePosition} acctShort={acctShort(p)} />}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </>)}
    </div>
  );
}

function StrategyCard({ T, group, onClose, onUngroup, onDelete, acctLabel }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const calc = strategyCalcs(group, {});
  const tgt = profitTargets(calc);
  const { kind, openPL, credit, debit, dte } = calc;
  const hc = ({ good: T.success, warn: T.warn, bad: T.danger, neutral: T.textDim })[tgt.health.color] || T.textDim;
  const netStr = kind === "credit" ? `Credit ${usd(credit)}` : `Debit ${usd(debit)}`;
  const pct = (kind === "credit" ? credit : debit) > 0 ? Math.round((openPL / (kind === "credit" ? credit : debit)) * 100) : 0;
  const cell = { fontFamily: T.fontChart, fontSize: 12.5, color: T.text, whiteSpace: "nowrap" };
  const closeAll = () => group.legs.forEach((l) => onClose(l.id, "sold", { exitPrice: Number(l.livePrice ?? l.fillPrice) || 0 }));

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setOpen((v) => !v)} style={{ cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
          <span style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 600 }}>{group.sym} {group.strategy}</span>
          {acctLabel && <span style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4, fontFamily: T.fontChart }}>{acctLabel}</span>}
        </div>
        <span style={{ ...cell, color: T.textDim }}>{group.legs.length} legs · {csExp(group.expiry)}</span>
        <span style={{ ...cell }}>{netStr}</span>
        <span style={{ ...cell, color: dte <= tgt.manageDte ? T.warn : T.textDim }}>{dte}d</span>
        <span style={{ ...cell, color: openPL >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(openPL, true)} <span style={{ fontSize: 10 }}>({pct >= 0 ? "+" : ""}{pct}%)</span></span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {onUngroup && <button onClick={(e) => { e.stopPropagation(); onUngroup(); }} title="Split this strategy back into individual positions" style={{ padding: "4px 9px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: T.fontChart, fontSize: 11, cursor: "pointer" }}>⤢ Ungroup</button>}
          <span style={{ fontSize: 10, fontWeight: 700, color: hc, background: `${hc}22`, padding: "2px 8px", borderRadius: 5, fontFamily: T.fontChart }}>{tgt.health.label}</span>
          <span style={{ color: T.textDim, display: "inline-flex" }}><Chevron open={open} color={T.textDim} /></span>
        </span>
      </div>

      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ background: `${hc}12`, border: `1px solid ${hc}44`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12.5, fontFamily: T.fontChart, margin: "14px 0 6px" }}>
            {tgt.recommendation}
          </div>

          <StrategyPositionChart calc={calc} targets={tgt} T={T} />

          <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontChart, letterSpacing: 1, textTransform: "uppercase", margin: "6px 0 6px" }}>Legs</div>
          {group.legs.map((l) => {
            const c = optionCalcs(l);
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${T.border}55` }}>
                <span style={{ ...cell, color: c.long ? T.success : T.danger, fontWeight: 700, minWidth: 92 }}>{c.long ? "LONG" : "SHORT"} ×{c.qty}</span>
                <span style={{ ...cell, minWidth: 120 }}>{usd(l.strike)} {optType(l)}</span>
                <span style={{ ...cell, color: T.textDim }}>{usd(c.fill)} → {usd(c.live)} <span style={{ fontSize: 10.5 }}>({usd0(c.cost)}→{usd0(c.value)})</span></span>
                <span style={{ ...cell, color: c.pl >= 0 ? T.success : T.danger }}>{usd(c.pl, true)}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => onClose(l.id, "sold", { exitPrice: Number(l.livePrice ?? l.fillPrice) || 0 })} style={legBtn(T)}>Close</button>
                  <button onClick={() => onClose(l.id, "expired")} style={legBtn(T)}>Expire</button>
                </span>
              </div>
            );
          })}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {confirmDel ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: T.danger, fontSize: 11, fontFamily: T.fontChart }}>Delete all {group.legs.length} legs (not a close — nothing recorded)?</span>
                <button onClick={() => onDelete && onDelete()} style={{ ...legBtn(T), color: T.danger, borderColor: T.danger }}>Delete</button>
                <button onClick={() => setConfirmDel(false)} style={legBtn(T)}>Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDel(true)} title="Remove these legs entirely (no history record) — e.g. a sample or a mistaken entry" style={{ ...legBtn(T), color: T.textDim }}>Delete strategy</button>
            )}
            <button onClick={closeAll} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, background: "transparent", color: T.accent, fontFamily: T.fontChart, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Close entire strategy (record at live marks)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const legBtn = (T) => ({ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontChart, fontSize: 11, cursor: "pointer" });

const panelWrap = (T) => ({ margin: "4px 0 16px", padding: "12px 14px", border: `1px solid ${T.accent}44`, background: `${T.accent}0D`, borderRadius: 10 });
const panelTitle = (T) => ({ color: T.text, fontSize: 11, fontFamily: T.fontChart, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 });
const mInput = (T, w) => ({ width: w, minHeight: 34, boxSizing: "border-box", padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontChart, fontSize: 13, marginTop: 4 });

// Hover-to-reveal info dot with an immediate custom tooltip (native `title` is
// slow/unreliable). Placed on labels, so it resets inherited uppercase/spacing.
function InfoDot({ T, text }) {
  const [pos, setPos] = useState(null); // viewport coords while hovering, else null
  if (!text) return null;
  // Render through a portal with fixed positioning so the table's overflow:auto
  // can't clip it. Width = max-content (capped) so short lists don't wrap but long
  // sentences still wrap inside the cap.
  const open = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const maxW = Math.min(window.innerWidth * 0.92, 460);
    const estH = 170;
    const top = (r.bottom + estH > window.innerHeight - 8) ? Math.max(8, r.top - estH) : r.bottom + 6;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - maxW - 8));
    setPos({ top, left, maxW });
  };
  return (
    <span style={{ display: "inline-flex" }} onMouseEnter={open} onMouseLeave={() => setPos(null)}>
      <span style={{ marginLeft: 3, opacity: 0.65, cursor: "help" }}>ⓘ</span>
      {pos && createPortal(
        <span role="tooltip" style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
          width: "max-content", maxWidth: pos.maxW, padding: "9px 12px", borderRadius: 8,
          background: T.surface, color: T.text, border: `1px solid ${T.border}`,
          fontFamily: T.fontChart, fontSize: 11, fontWeight: 400, lineHeight: 1.55,
          letterSpacing: "normal", textTransform: "none", whiteSpace: "pre-line", textAlign: "left",
          boxShadow: "0 12px 34px rgba(0,0,0,0.5)", pointerEvents: "none",
        }}>{text}</span>,
        document.body,
      )}
    </span>
  );
}

function MStat({ T, label, value, sub, color, tip }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` }}>
      <div style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontChart, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}{tip && <InfoDot T={T} text={tip} />}</div>
      <div style={{ color: color || T.text, fontSize: 15, fontWeight: 700, fontFamily: T.fontChart, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontChart, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// Per-position management: the "sell half, run the rest free" plan + a one-tap
// scale-out. Long lots get the free-roll math; shorts get a short-management note.
function ManagePanel({ T, p, c, onScaleOut }) {
  const fr = freeRollPlan(p);
  const [qty, setQty] = useState(String(fr.sellQty || 1));
  const [px, setPx] = useState(String(c.live ?? c.fill ?? ""));
  const [busy, setBusy] = useState(false);

  if (!c.long && !fr.freeRunning) {
    return (
      <div style={panelWrap(T)}>
        <div style={panelTitle(T)}>Managing a short</div>
        <div style={{ color: T.textDim, fontSize: 12.5, fontFamily: T.fontChart }}>
          You collected {usd(c.cost)} in credit. Standard rule: buy it back near ~50% of max (≈ {usd(c.cost * 0.5)} to close) to lock the gain, or manage inside 21 DTE. Free-roll doesn’t apply to a short.
        </div>
      </div>
    );
  }

  const sellNow = Math.max(1, Math.min(Math.round(Number(qty) || 0), c.qty));
  const barPct = Math.max(0, Math.min(100, Math.round(fr.progressPct)));
  const ladder = sellTargets(p, [25, 50, 75, 100]); // premium + proceeds + stock-needed per gain rung
  const sell = async () => { setBusy(true); try { await onScaleOut(p.id, sellNow, Number(px) || 0); } finally { setBusy(false); } };

  return (
    <div style={panelWrap(T)}>
      <div style={panelTitle(T)}>Free-roll plan</div>
      {fr.freeRunning ? (
        <div style={{ color: T.success, fontSize: 12.5, fontFamily: T.fontChart, marginBottom: 12 }}>
          ✓ Running free — you’ve pulled {usd(fr.recovered)} back out (your full {usd(fr.origCost)} cost). These {c.qty} contract{c.qty === 1 ? "" : "s"} are house money; anything from here is pure profit.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12, alignItems: "stretch" }}>
            <MStat T={T} label="Cost at risk" value={usd(fr.remainingCost)} sub={`${c.qty} × ${usd(c.fill)}`}
              tip={`What you'd lose if these expired worthless — contracts you still hold × your ${usd(c.fill)}/sh entry. Fixed at entry; it only drops as you sell/scale out, not as the price moves.`} />
            {(() => {
              const sold = fr.sellQty;
              const proceeds = sold * c.live * c.mult;             // total cash if you sell them now
              const costOfSold = sold * c.fill * c.mult;            // what those contracts cost you
              const grossGain = proceeds - costOfSold;             // profit before fees
              const netGain = grossGain - sold * FEE_PER_CONTRACT; // profit after broker fees
              const gc = (v) => (v >= 0 ? T.success : T.danger);
              const info = (txt) => <InfoDot T={T} text={txt} />;
              const row = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, fontFamily: T.fontChart, fontSize: 12, marginTop: 3, flexWrap: "wrap" };
              return (
                <div style={{ padding: "8px 10px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` }}>
                  <div style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontChart, letterSpacing: 0.5, textTransform: "uppercase" }}>Sell {sold} now{info(`If you sell ${sold} contract${sold === 1 ? "" : "s"} at the current ${usd(c.live)}/sh mark right now: the cash you'd collect (Total), what they cost you (Cost), and the profit — gross, and after ~${usd(FEE_PER_CONTRACT)}/contract broker fees.`)}</div>
                  <div style={row}><span style={{ color: T.textDim }}>Total <span style={{ color: T.text, fontWeight: 700 }}>{usd(proceeds)}</span>{info(`Gross cash you'd receive: ${sold} × ${usd(c.live)}/sh × 100. Rises with a higher sell price. The green figure is the profit (Total − Cost).`)}</span><span style={{ color: gc(grossGain), fontWeight: 700 }}>{usd(grossGain, true)}</span></div>
                  <div style={row}><span style={{ color: T.textDim }}>Cost <span style={{ color: T.text, fontWeight: 700 }}>{usd(costOfSold)}</span>{info(`What these ${sold} contract${sold === 1 ? "" : "s"} cost you to buy — ${sold} × ${usd(c.fill)}/sh × 100. FIXED at your entry: it stays ${usd(costOfSold)} no matter how high the return goes; only Total and your gain rise. Green = profit after fees.`)}</span><span style={{ color: gc(netGain), fontWeight: 700 }}>{usd(netGain, true)} <span style={{ color: T.textDim, fontWeight: 400 }}>net</span></span></div>
                  <div style={{ color: T.textDim, fontSize: 10.5, marginTop: 4 }}>@ {usd(c.live)}/sh · after fees</div>
                </div>
              );
            })()}
            <MStat T={T} label="Free-roll at" value={fr.freeRollPrice != null ? usd(fr.freeRollPrice) : "—"} sub={`sell ${fr.sellQty}, keep ${fr.keepQty}`} color={T.accent}
              tip={`The sell price where ${fr.sellQty} contract${fr.sellQty === 1 ? "" : "s"} returns your whole cost — so the ${fr.keepQty} you keep run free (house money, $0 cost left).`} />
          </div>
          <div style={{ height: 7, borderRadius: 4, background: T.border, overflow: "hidden", marginBottom: 5 }}>
            <div style={{ width: `${barPct}%`, height: "100%", background: fr.ready ? T.success : T.accent }} />
          </div>
          <div style={{ color: fr.ready ? T.success : T.textDim, fontSize: 11.5, fontFamily: T.fontChart, marginBottom: 12 }}>
            {fr.ready
              ? `Ready — selling ${fr.sellQty} at ${usd(c.live)} returns your cost; the other ${fr.keepQty} run free.`
              : `${barPct}% to free-roll — needs ${fr.freeRollPrice != null ? usd(fr.freeRollPrice) : "—"} (now ${usd(c.live)}).`}
          </div>
        </>
      )}

      {ladder.length > 0 && (
        <div style={{ margin: "2px 0 14px" }}>
          <div style={{ color: T.textDim, fontSize: 9.5, fontFamily: T.fontChart, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Sell price to gain</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(156px, 1fr))", gap: 6 }}>
            {ladder.map((t) => (
              <div key={t.pct} style={{ padding: "6px 9px", borderRadius: 7, background: t.free ? `${T.accent}18` : T.card, border: `1px solid ${t.free ? T.accent + "66" : T.border}` }}>
                <div style={{ fontFamily: T.fontChart, fontSize: 12, color: t.free ? T.accent : T.text, fontWeight: 700, whiteSpace: "nowrap" }}>+{t.pct}% → {usd(t.premium)} <span style={{ color: T.success, fontWeight: 700 }}>+{usd0((t.premium - c.fill) * c.mult * c.qty)}</span></div>
                <div style={{ fontFamily: T.fontChart, fontSize: 10, color: T.textDim }}>{t.underlying ? `${p.sym} ≈ ${usd(t.underlying)}` : "—"}{t.free ? " · free-roll" : ""}</div>
              </div>
            ))}
          </div>
          {ladder[0] && ladder[0].ivReliable === false && (
            <div style={{ color: T.warn || T.textDim, fontSize: 10, fontFamily: T.fontChart, marginTop: 6, lineHeight: 1.45 }}>Stock-price targets hidden — the option mark and the stock price are out of sync (stale / after-hours), so the model can’t place them reliably. The premium targets above are exact.</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontChart }}>Sell qty<br />
          <input value={qty} onChange={(e) => setQty(e.target.value)} style={mInput(T, 64)} /></label>
        <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontChart }}>At price / sh<br />
          <input value={px} onChange={(e) => setPx(e.target.value)} style={mInput(T, 92)} /></label>
        <button onClick={sell} disabled={busy} style={{ padding: "9px 16px", minHeight: 34, borderRadius: 8, border: `1px solid ${T.accent}`, background: fr.ready ? T.accent : "transparent", color: fr.ready ? "#0A0A0A" : T.accent, fontFamily: T.fontChart, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Selling…" : `Sell ${sellNow} now`}
        </button>
        <span style={{ color: T.textDim, fontSize: 10.5, fontFamily: T.fontChart, maxWidth: 220 }}>Records {sellNow} to history; the rest stays open, flagged free-running once your cost is back.</span>
      </div>
    </div>
  );
}

function OptionDetail({ T, p, c, m, dte, onUpdate, onClose, onScaleOut, onDelete, acctShort }) {
  const [exit, setExit] = useState(String(p.livePrice ?? p.fillPrice ?? ""));
  const [confirmDel, setConfirmDel] = useState(false);
  // Gain targets translated to the underlying price needed (via BS) → chart lines.
  const chartTargets = c.long
    ? sellTargets(p, [50, 100]).filter((t) => t.underlying).map((t) => ({ price: t.underlying, label: t.free ? "Free-roll" : `+${t.pct}%`, color: t.free ? T.accent : T.success, free: t.free }))
    : [];
  const box = { textAlign: "center", padding: "10px 8px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` };
  const lbl = { color: T.textDim, fontSize: 9, fontFamily: T.fontChart, letterSpacing: 1, textTransform: "uppercase" };
  const val = { fontSize: 16, fontWeight: 700, fontFamily: T.fontChart, marginTop: 4 };
  const editStyle = { width: 110, minHeight: 36, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontChart, fontSize: 13 };
  const closeVerb = c.long ? "Sell to close" : "Buy to close";

  return (
    <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${T.border}` }}>
      {acctShort && <div style={{ marginTop: 8 }}><span style={{ fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "2px 8px", borderRadius: 5, fontFamily: T.fontChart }}>Schwab account {acctShort}</span></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, margin: "14px 0" }}>
        <div style={box}><div style={lbl}>{c.long ? "Paid" : "Received"}</div><div style={{ ...val, color: T.text }}>{usd(c.cost)}</div></div>
        <div style={box}><div style={lbl}>Current value</div><div style={{ ...val, color: T.text }}>{usd(c.value)}</div></div>
        <div style={box}><div style={lbl}>Open P&L</div><div style={{ ...val, color: c.pl >= 0 ? T.success : T.danger }}>{usd(c.pl, true)}</div></div>
        <div style={box}><div style={lbl}>Breakeven</div><div style={{ ...val, color: T.warn }}>{c.breakeven != null ? usd(c.breakeven) : "—"}</div></div>
        <div style={box}><div style={lbl}>Status</div><div style={{ ...val, color: m.itm ? T.accent : T.textDim }}>{m.label}{dte != null ? ` · ${dte}d` : ""}</div></div>
      </div>

      <OptionPositionChart
        symbol={p.sym} strike={p.strike} breakeven={c.breakeven}
        currentUnderlying={p.liveUnderlying} entryUnderlying={p.fillUnderlying}
        expiry={p.expiry} openedAtMs={p.openedAtMs} type={optType(p)}
        onSetEntry={(ms) => onUpdate(p.id, { openedAtMs: ms })}
        targetLevels={chartTargets}
      />

      <ManagePanel T={T} p={p} c={c} onScaleOut={onScaleOut} />

      {/* Editable live marks */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: T.textDim }}>Live option price<br />
          <input defaultValue={p.livePrice ?? p.fillPrice} onBlur={(e) => onUpdate(p.id, { livePrice: Number(e.target.value) || 0 })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Underlying now<br />
          <input defaultValue={p.liveUnderlying ?? ""} placeholder="—" onBlur={(e) => onUpdate(p.id, { liveUnderlying: Number(e.target.value) || null })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Entry date<br />
          <input type="date" defaultValue={msToDate(p.openedAtMs)} onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) onUpdate(p.id, { openedAtMs: ms }); }} style={{ ...editStyle, width: 150 }} /></label>
      </div>

      {/* Exit paths */}
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontChart, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Close this option</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{closeVerb}</div>
          <input value={exit} onChange={(e) => setExit(e.target.value)} placeholder="price / sh" style={{ ...editStyle, width: "100%" }} />
          <button onClick={() => onClose(p.id, "sold", { exitPrice: Number(exit) || 0 })} style={btn(T)}>Record {closeVerb.toLowerCase()}</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Expired worthless</div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>{c.long ? "Lose the premium paid." : "Keep the full premium."}</div>
          <button onClick={() => onClose(p.id, "expired")} style={btn(T)}>Mark expired</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{c.long ? "Exercised" : "Assigned"}</div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>Settled into shares/futures at the strike.</div>
          <button onClick={() => onClose(p.id, "exercised", { exitPrice: Number(exit) || 0 })} style={btn(T)}>Mark {c.long ? "exercised" : "assigned"}</button>
        </div>
      </div>

      <div style={{ marginTop: 12, textAlign: "right" }}>
        {confirmDel ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={{ color: T.danger, fontSize: 11, fontFamily: T.fontChart }}>Delete this position (not a close)?</span>
            <button onClick={() => onDelete(p.id)} style={{ ...btn(T), width: "auto", marginTop: 0, color: T.danger, borderColor: T.danger }}>Delete</button>
            <button onClick={() => setConfirmDel(false)} style={{ ...btn(T), width: "auto", marginTop: 0 }}>Cancel</button>
          </span>
        ) : <button onClick={() => setConfirmDel(true)} style={{ ...btn(T), width: "auto", marginTop: 0, color: T.textDim }}>Delete</button>}
      </div>
    </div>
  );
}

const btn = (T) => ({ marginTop: 8, width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontChart, fontSize: 12, cursor: "pointer" });

function AddOptionForm({ T, onSave, onDone }) {
  const empty = { sym: "", type: "CALL", direction: "long", strike: "", expiry: "", contracts: "1", fillPrice: "", livePrice: "", underlyingType: "equity", fillUnderlying: "", liveUnderlying: "" };
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = { width: "100%", boxSizing: "border-box", minHeight: 42, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontChart, fontSize: 14 };
  const lbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: T.textDim, fontWeight: 500 };

  const submit = async () => {
    const r = await onSave(f);
    if (r.ok) { setF(empty); setMsg(""); onDone?.(); }
    else setMsg(`Need: ${(r.missing || [r.error]).join(", ")}`);
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <label style={lbl}>Symbol<input value={f.sym} onChange={set("sym")} placeholder="TLT" style={inp} /></label>
        <label style={lbl}>Type<select value={f.type} onChange={set("type")} style={inp}><option value="CALL">Call</option><option value="PUT">Put</option></select></label>
        <label style={lbl}>Side<select value={f.direction} onChange={set("direction")} style={inp}><option value="long">Long (bought)</option><option value="short">Short (sold)</option></select></label>
        <label style={lbl}>Strike<input value={f.strike} onChange={set("strike")} placeholder="90" style={inp} /></label>
        <label style={lbl}>Expiry<input type="date" value={f.expiry} onChange={set("expiry")} style={inp} /></label>
        <label style={lbl}>Contracts<input value={f.contracts} onChange={set("contracts")} style={inp} /></label>
        <label style={lbl}>Entry price / sh<input value={f.fillPrice} onChange={set("fillPrice")} placeholder="1.25" style={inp} /></label>
        <label style={lbl}>Live price / sh<input value={f.livePrice} onChange={set("livePrice")} placeholder="1.40" style={inp} /></label>
        <label style={lbl}>Underlying<select value={f.underlyingType} onChange={set("underlyingType")} style={inp}><option value="equity">Stock/ETF (×100)</option><option value="future">Futures (×1000)</option></select></label>
        <label style={lbl}>Underlying @ entry<input value={f.fillUnderlying} onChange={set("fillUnderlying")} placeholder="optional" style={inp} /></label>
      </div>
      {msg && <div style={{ color: T.danger, fontSize: 12, marginTop: 10, fontFamily: T.fontChart }}>{msg}</div>}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button onClick={submit} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#0A0A0A", fontFamily: T.fontChart, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add option</button>
        <button onClick={onDone} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: T.fontChart, fontSize: 13, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function Tot({ T, label, value, color, tip }) {
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontChart, letterSpacing: 1, textTransform: "uppercase" }}>{label}{tip && <InfoDot T={T} text={tip} />}</div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontChart, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// Stacked tile: a muted top line (e.g. Paid / Realized) over a big colored
// bottom number (current value / open P&L, green up or red down).
function TotStack({ T, label, topLabel, topValue, bottom, bottomColor, tip }) {
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontChart, letterSpacing: 1, textTransform: "uppercase" }}>{label}{tip && <InfoDot T={T} text={tip} />}</div>
      <div style={{ fontSize: 11, fontFamily: T.fontChart, marginTop: 5, color: T.textDim }}>{topLabel} <span style={{ color: T.text, fontWeight: 600 }}>{topValue}</span></div>
      <div style={{ color: bottomColor || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontChart, marginTop: 1 }}>{bottom}</div>
    </div>
  );
}
