// ─── src/components/WorkingPositionsTab.jsx ──────────────────────────────────
// Working covered calls — the portfolio list. Totals strip, one row per open
// call with a health stoplight (hover legend) and an expandable detail panel
// (Position Summary, GTC fill estimate, and the four exit paths). Add/paste a
// position from the header. Dark-themed to match the app.
//
// Data: usePositions() (Firestore). Math: src/lib/coveredCallMath.js.
// Shares-by-lot lives in Phase 4; SVG time/price charts are a later polish.

import { useState, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { usePositions } from "../hooks/usePositions";
import { useLivePortfolio } from "../hooks/useLivePortfolio";
import { positionCalcs, stoplight, gtcFillEstimate } from "../lib/coveredCallMath";
import WorkingPositionChart from "./WorkingPositionChart";
import { parsePaste, positionId } from "../lib/positionParser";
import { parseSchwabOpenDates, parseSchwabClosedCycles, parseSchwabGtcOrders, isCoveredCallUnderlying } from "../lib/schwabPositions";
import { useBrokerConnection } from "../hooks/useBrokerConnection";
import { schwabGetOrders, schwabReauthorize } from "../services/schwabApi";
import { getPriceHistory } from "../services/priceHistory";
import SharesByLot from "./SharesByLot";
import ImportFromSchwab from "./ImportFromSchwab";
import TradeHistory from "./TradeHistory";

const DOT = { g: "#2F9E55", y: "#E3A91B", r: "#E0552A" };
const LEGEND = [
  { key: "g", label: "Good", text: "Under 35% chance the call ends above the strike, and the stock is above your breakeven." },
  { key: "y", label: "Watch", text: "35–60% chance of being called, or the stock has dropped below breakeven." },
  { key: "r", label: "Likely called", text: "At/over the strike or 60%+ chance. Shares will probably sell unless you buy back or roll." },
];

const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const expShort = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "—";
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const CLOSE_HOW = { bought: "bought back", expired: "expired", called: "called away" };
// A resting GTC buy-back order still live at Schwab (authoritative "not filled").
const GTC_ACTIVE = ["WORKING", "QUEUED", "ACCEPTED", "PENDING_ACTIVATION", "OPEN", "AWAITING_PARENT_ORDER"];
const gtcWorking = (p) => GTC_ACTIVE.includes(String(p?.gtcStatus || "").toUpperCase());
// A scaling error (option price stored per-contract ×100 instead of per-share)
// shows up as a call premium that's a large fraction of the STOCK's market price
// — not the cost basis (a legit low-cost-basis call can have a big premium vs its
// old basis, which is fine). Compare to the live/market price to avoid false flags.
const beSuspect = (p) => { const mkt = Math.max(Number(p?.liveStock) || 0, Number(p?.fillStock) || 0); return mkt > 0 && Number(p?.fillCall) > 0.5 * mkt; };
const BE_WARN = "The call premium is more than half the stock's price — that usually means the option price was imported per-contract (×100) instead of per-share. Open the row and edit \"Call sold at\" (often ÷100) to correct it.";
// Plain-English explanation of each Schwab-style column (hover the header).
const HEADER_TIPS = [
  "Order strategy. COVERED = covered call: sell one call against 100 shares you own.",
  "SELL = sell the call to open. BUY = buy the shares, or buy the call back to close.",
  "Quantity — contracts for the call (shown −), shares for the stock leg (+100 per contract).",
  "Position effect — whether the leg opens or closes (AUTO / TO CLOSE / DEBIT).",
  "Underlying ticker. The colored tag is the Schwab account (Stock / Roth).",
  "Option expiration date.",
  "Strike price of the call.",
  "Instrument type: CALL for the option, STOCK for the shares leg.",
  "Order price. The call leg shows your breakeven as a limit; the GTC leg shows the buy-back limit.",
  "Order type (LIMIT).",
  "Time in force. DAY = expires end of day; GTC = good-till-canceled (your standing buy-back).",
  "Routing / destination. BEST = best execution.",
  "Health stoplight + how soon your GTC buy-back is likely to fill.",
  "Click the row to expand full details and actions.",
];
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);
// Schwab-style expiration, e.g. "16 OCT 26"
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const csExp = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return "";
  return `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}`;
};
// Column grid matching the Schwab covered-call order row (see examples/Example CS Liste Item.png):
// Strategy | Side | Qty | Pos Effect | Symbol | Exp | Strike | Strike Type | Price | Order | TIF | Exch | Health | ▾
const CS_COLS = "104px 56px 56px 74px 62px 96px 58px 88px 108px 70px 50px 56px 132px 26px";

export default function WorkingPositionsTab() {
  const { T } = useTheme();
  const { positions, lots, closed, loading, savePosition, updateLive, closePosition, saveLot, deleteLot, addClosedRecord, updateClosed, deleteClosed } = usePositions();
  const { live, status } = useLivePortfolio(positions);
  const { activeConnection, activeAccount, accounts } = useBrokerConnection();
  const schwabConnected = activeConnection?.status === "connected";
  // Resolve a position's Schwab account to its nickname (set in the APIs tab).
  const acctRec = (p) => (accounts || []).find((x) => x.accountId === p?.acctId) || (accounts || []).find((x) => String(x.accountId || "").slice(-4) === p?.acct);
  const accountLabel = (p) => {
    if (!p?.acct && !p?.acctId) return null;
    const a = acctRec(p);
    return a?.label ? `${a.label} · ··${p.acct || ""}` : `··${p.acct || ""}`;
  };
  const acctShort = (p) => { if (!p?.acct && !p?.acctId) return null; const a = acctRec(p); return a?.label || (p.acct ? `··${p.acct}` : null); };
  const recentClosed = useMemo(() => [...(closed || [])].sort((a, b) => (b.closedOnMs || 0) - (a.closedOnMs || 0)).slice(0, 4), [closed]);
  const [open, setOpen] = useState({});
  const [hover, setHover] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // One-click Schwab reconnect using the saved key (weekly refresh-token renewal).
  const reconnect = async () => {
    setReconnecting(true);
    try {
      const r = await schwabReauthorize({ redirectUri: `${window.location.origin}/api/schwab/callback` });
      window.open(r.data.authUrl, "_blank", "width=600,height=700,noopener");
    } catch (e) { setSyncMsg({ ok: false, text: e?.message || "Couldn't start reconnect — try the APIs tab." }); }
    finally { setReconnecting(false); }
  };

  // Pull entry dates + buy-backs from EVERY linked Schwab account and apply them
  // to the matching positions (each position is matched within its own account).
  const syncEntryDates = async () => {
    const accts = (accounts && accounts.length) ? accounts : (activeAccount ? [activeAccount] : []);
    if (!accts.some((a) => a?.hashValue)) { setSyncMsg({ ok: false, text: "No linked Schwab account — connect in the APIs tab." }); return; }
    setSyncing(true); setSyncMsg({ ok: true, text: "Pulling from Schwab…" });
    try {
      let dated = 0, closedN = 0, importedN = 0, acctsHit = 0, ordersN = 0, buybacksSeen = 0, skipped = 0, expiredN = 0, calledN = 0;
      const checkedMs = Date.now();
      const closedIds = new Set();
      const DAY = 86400000;
      // Existing closed records, so we don't re-import the same buy-back.
      const haveClosed = new Set((closed || []).map((c) => `${c.sym}|${c.strike}|${c.expiry}`));
      for (const acct of accts) {
        if (!acct?.hashValue) continue;
        const acctTag = String(acct.accountId || "").slice(-4);
        const orders = await schwabGetOrders({ accountHash: acct.hashValue }).then((r) => r.data).catch(() => null);
        if (!orders) continue;
        acctsHit++;
        ordersN += (Array.isArray(orders) ? orders : (orders?.orders || [])).length;
        const openByKey = parseSchwabOpenDates(orders);
        const gtcOrders = parseSchwabGtcOrders(orders); // resting buy-back orders + their status
        // Entry (sell-to-open) dates + live GTC order status for existing positions.
        for (const p of positions) {
          if (p.acct && p.acct !== acctTag) continue;
          const k = `${p.sym}|${p.strike}|${p.expiry}`;
          if (openByKey[k] != null && openByKey[k] !== p.openedAtMs) { await updateLive(p.id, { openedAtMs: openByKey[k] }); dated++; }
          // Authoritative "is my buy-back still working at Schwab" flag.
          const g = gtcOrders[k];
          if (g && (p.gtcStatus !== g.status)) { await updateLive(p.id, { gtcStatus: g.status, gtcCheckedMs: checkedMs }); }
        }
        // Every buy-back (buy-to-close) in the window → close the matching open
        // position if we have one, otherwise import it as a closed trade.
        for (const cyc of parseSchwabClosedCycles(orders)) {
          buybacksSeen++;
          const k = `${cyc.sym}|${cyc.strike}|${cyc.expiry}`;
          const match = positions.find((p) => `${p.sym}|${p.strike}|${p.expiry}` === k && (!p.acct || p.acct === acctTag) && !closedIds.has(p.id));
          if (match) {
            await closePosition(match.id, "bought", { buyback: Number(cyc.buyback) || 0, closedOnMs: cyc.closeMs || undefined });
            closedIds.add(match.id); closedN++; haveClosed.add(k);
            continue;
          }
          if (haveClosed.has(k)) { skipped++; continue; } // already recorded
          const rec = {
            sym: cyc.sym, contracts: cyc.contracts, strike: cyc.strike, expiry: cyc.expiry,
            fillStock: null, fillCall: cyc.fillCall, buyback: cyc.buyback, how: "bought",
            stockGain: 0, delivered: [],
            openedAtMs: cyc.openMs ?? null, closedOnMs: cyc.closeMs ?? null,
            closedOn: cyc.closeMs ? new Date(cyc.closeMs).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            exitStock: null, exitCall: cyc.buyback,
            acct: acctTag, source: "schwab-import",
          };
          await addClosedRecord(rec, `cs-${cyc.sym}-${cyc.strike}-${cyc.expiry}-${cyc.closeMs || 0}`);
          haveClosed.add(k); importedN++;
        }
      }
      // Settle any working position whose expiry has PASSED and that wasn't
      // bought back: ITM at expiry → called away (shares sold at the strike),
      // OTM → expired worthless (premium kept). Uses the stock's close on the
      // expiry date vs the strike — how options actually settle.
      const today0 = new Date(); today0.setHours(0, 0, 0, 0);
      const toSettle = positions.filter((p) => !closedIds.has(p.id) && isCoveredCallUnderlying(p.sym) && (dateToMs(p.expiry) ?? Infinity) < today0.getTime());
      const histBySym = {};
      for (const p of toSettle) {
        const expMs = dateToMs(p.expiry);
        let closeAtExp = Number(p.liveStock) || null;
        try {
          if (!histBySym[p.sym]) histBySym[p.sym] = (await getPriceHistory(p.sym, "3M").then((r) => r.points).catch(() => [])) || [];
          const pts = histBySym[p.sym].filter((x) => x.t <= expMs + 2 * DAY);
          if (pts.length) closeAtExp = pts[pts.length - 1].c;
        } catch { /* fall back to liveStock */ }
        const itm = Number.isFinite(closeAtExp) && closeAtExp >= Number(p.strike);
        await closePosition(p.id, itm ? "called" : "expired", { closedOnMs: expMs || undefined });
        closedIds.add(p.id);
        if (itm) calledN++; else expiredN++;
      }

      console.log("[Schwab sync]", { acctsHit, ordersN, buybacksSeen, dated, closedN, importedN, skipped, expiredN, calledN });
      const parts = [];
      if (dated) parts.push(`set ${dated} entry date${dated === 1 ? "" : "s"}`);
      if (closedN) parts.push(`bought back ${closedN} position${closedN === 1 ? "" : "s"}`);
      if (calledN) parts.push(`${calledN} called away (shares sold)`);
      if (expiredN) parts.push(`${expiredN} expired worthless`);
      if (importedN) parts.push(`imported ${importedN} buy-back${importedN === 1 ? "" : "s"} → Trade History`);
      setSyncMsg({ ok: true, text: parts.length
        ? `Synced ${acctsHit} account${acctsHit === 1 ? "" : "s"}: ${parts.join(", ")}.`
        : `Checked ${acctsHit} account${acctsHit === 1 ? "" : "s"} · ${ordersN} orders · ${buybacksSeen} buy-back${buybacksSeen === 1 ? "" : "s"} found — ${buybacksSeen ? `all already recorded${skipped ? ` (${skipped})` : ""}` : "none in Schwab's last ~60 days"}.` });
    } catch (e) { setSyncMsg({ ok: false, text: e?.message || "Couldn't sync from Schwab." }); }
    finally { setSyncing(false); }
  };

  // Overlay live Yahoo/Schwab marks onto the stored positions for all math.
  const livePositions = useMemo(() => positions.map((p) => ({ ...p, ...(live[p.id] || {}) })), [positions, live]);

  const rows = useMemo(() => livePositions.map((p) => {
    const c = positionCalcs(p);
    const iv = (p.iv || 25) / 100;
    const light = stoplight({ liveStock: p.liveStock, strike: p.strike, daysToExpiry: p.daysToExpiry, iv, breakeven: c.breakeven });
    const expMsP = dateToMs(p.expiry); // days-to-expiry from the real date (robust to a stale prop)
    const dteP = expMsP ? Math.max(1, Math.round((expMsP - Date.now()) / 86400000)) : Math.max(1, Math.round(p.daysToExpiry || 1));
    const fill = gtcFillEstimate({ S: p.liveStock, strike: p.strike, daysLeft: dteP, iv, gtc: p.gtc ?? 0.1, fillCall: p.fillCall, contracts: p.contracts || 1, liveCall: p.liveCall });
    // Entry = when the covered call was SOLD/opened (not the share-lot purchase).
    const entryMs = Number.isFinite(p.openedAtMs) ? p.openedAtMs : null;
    return { p, c, light, fill, liveSource: live[p.id]?.source, entryMs };
  }), [livePositions, live]);

  const totals = useMemo(() => rows.reduce((a, { c }) => ({
    shareCost: a.shareCost + c.shareCost, premium: a.premium + c.premium, buyback: a.buyback + c.buyback,
    kept: a.kept + c.kept, close: a.close + c.close, maxProfit: a.maxProfit + c.maxProfit,
  }), { shareCost: 0, premium: 0, buyback: 0, kept: 0, close: 0, maxProfit: 0 }), [rows]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const h3 = { color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 };

  return (
    <div role="region" aria-label="Working covered calls">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ ...h3, fontSize: 20 }}>Working Covered Calls</h2>
          {positions.length > 0 && (
            <span title={status.at ? `Updated ${new Date(status.at).toLocaleTimeString()}` : "Fetching…"} style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, fontFamily: T.fontMono,
              color: status.source === "schwab" ? T.success : T.textDim,
              background: `${status.source === "schwab" ? T.success : T.textDim}1e`,
            }}>
              {status.loading ? "◌ updating" : status.source === "schwab" ? "● Schwab live" : "● Yahoo · 15-min delayed"}
            </span>
          )}
        </div>
        <button onClick={() => setShowAdd((v) => !v)} style={{
          padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer",
          background: showAdd ? "transparent" : T.accent, color: showAdd ? T.accent : "#0A0A0A",
          fontFamily: T.fontMono, fontSize: 13, fontWeight: 700,
        }}>{showAdd ? "Close" : "+ Add / Paste"}</button>
      </div>

      {/* Schwab lapsed? One-click reconnect with the saved key (no re-typing). */}
      {!schwabConnected && (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderColor: `${T.warn || T.warning}55`, background: `${T.warn || T.warning}10` }}>
          <span style={{ color: T.warn || T.warning, fontFamily: T.fontMono, fontSize: 12, fontWeight: 700 }}>Schwab not connected</span>
          <span style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Schwab expires the link every ~7 days.</span>
          <button onClick={reconnect} disabled={reconnecting} style={{ padding: "7px 13px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, opacity: reconnecting ? 0.6 : 1, marginLeft: "auto" }}>{reconnecting ? "Opening Schwab…" : "↻ Reconnect (saved key)"}</button>
        </div>
      )}

      {/* One-click import of open covered calls from the connected Schwab account */}
      <ImportFromSchwab onAdd={savePosition} />

      {/* Pull entry dates + buy-backs + closed trades from Schwab */}
      {schwabConnected && (
        <div style={{ margin: "8px 0 4px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={syncEntryDates} disabled={syncing} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, opacity: syncing ? 0.6 : 1 }}>
            {syncing ? "Syncing…" : "⬇ Sync from Schwab (entry dates + buy-backs + closed trades)"}
          </button>
          {syncMsg && <span style={{ color: syncMsg.ok ? T.textDim : T.danger, fontFamily: T.fontMono, fontSize: 12 }}>{syncMsg.text}</span>}
        </div>
      )}

      {showAdd && <AddForm T={T} lots={lots} positions={positions} onSave={savePosition} onDone={() => setShowAdd(false)} />}

      {/* Recently closed — know when a call sold/closed */}
      {recentClosed.length > 0 && (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 16px" }}>
          <span style={{ color: T.success, fontWeight: 700, fontFamily: T.fontMono, fontSize: 12 }}>✓ Recently closed</span>
          {recentClosed.map((cl, i) => (
            <span key={i} title={`${cl.sym} $${cl.strike} call — ${CLOSE_HOW[cl.how] || cl.how}${cl.how === "bought" ? ` by buying it back at ${usd(cl.buyback)}` : ""} on ${cl.closedOn}. This covered call is closed; open Trades → Closed for the full lifecycle chart.`} style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, cursor: "help" }}>
              <b style={{ color: T.text }}>{cl.sym} ${cl.strike}</b> {CLOSE_HOW[cl.how] || cl.how}{cl.how === "bought" ? ` @ ${usd(cl.buyback)}` : ""} · {cl.closedOn}
            </span>
          ))}
          <span style={{ color: T.textMuted || T.textDim, fontSize: 11, marginLeft: "auto" }}>full history + charts in Trades → Closed</span>
        </div>
      )}

      {/* Totals strip */}
      {rows.length > 0 && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          <Tot T={T} label="Money in trade" value={usd(totals.shareCost - totals.premium)}
            tip="Cash currently tied up in these trades — what you paid for the shares minus the premium you've already collected. This is your true cost basis." />
          <Tot T={T} label="Premium" value={usd(totals.premium)} color={T.success}
            tip="Total option premium collected across all open covered calls (fill price × 100 × contracts)." />
          <Tot T={T} label="Kept so far" value={usd(totals.kept, true)} color={totals.kept >= 0 ? T.success : T.danger}
            tip="Premium kept so far — what you collected minus what it would cost to buy the calls back right now. You keep all of it if the calls expire worthless." />
          <Tot T={T} label="If closed now" value={usd(totals.close, true)} color={totals.close >= 0 ? T.success : T.danger}
            tip="Total profit/loss if you closed everything at current prices — the shares' gain or loss plus the premium kept." />
          <Tot T={T} label="Best case" value={usd(totals.maxProfit, true)} color={T.accent}
            tip="Maximum profit if the shares get called away at the strike — the gain up to the strike plus all the premium collected." />
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <div style={{ ...card, color: T.textDim }}>Loading positions…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <div style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, marginBottom: 6 }}>No working calls yet</div>
          <div style={{ color: T.textDim, fontSize: 13, maxWidth: 420, margin: "0 auto" }}>
            Use “+ Add / Paste” to enter a covered call — or paste a thinkorswim fill and it fills the form for you.
          </div>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <div style={{ minWidth: 1040 }}>
            {/* Column header — Schwab covered-call order-row columns */}
            <div style={{ display: "grid", gridTemplateColumns: CS_COLS, padding: "9px 16px", borderBottom: `1px solid ${T.border}` }}>
              {["Strategy", "Side", "Qty", "Pos Effect", "Symbol", "Exp", "Strike", "Strike Type", "Price", "Order", "TIF", "Exch", "", ""].map((h, i) => (
                <div key={i} title={HEADER_TIPS[i]} style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, cursor: "help" }}>{h}</div>
              ))}
            </div>
            {rows.map(({ p, c, light, fill, entryMs }) => {
              const isOpen = !!open[p.id];
              const n = p.contracts || 1;
              const cellBase = { fontFamily: T.fontMono, fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 };
              const dim = { ...cellBase, color: T.textDim };
              const leg = { display: "grid", gridTemplateColumns: CS_COLS, alignItems: "center" };
              return (
                <div key={p.id} style={{ borderBottom: `1px solid ${T.border}`, background: isOpen ? T.card : "transparent" }}>
                  <div onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} style={{ cursor: "pointer", padding: "10px 16px" }}>
                    {/* Leg 1 — SELL the call */}
                    <div style={leg}>
                      <div style={{ ...cellBase, display: "flex", alignItems: "center", gap: 7, fontWeight: 700, position: "relative" }}
                        onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}>
                        <span style={{ width: 11, height: 11, borderRadius: "50%", background: DOT[light.key], flexShrink: 0, boxShadow: hover === p.id ? `0 0 0 4px ${DOT[light.key]}33` : "none" }} />
                        COVERED
                        {hover === p.id && (
                          <div role="tooltip" style={{ position: "absolute", zIndex: 30, top: 20, left: 0, width: 250, whiteSpace: "normal", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                            {LEGEND.map((l) => (
                              <div key={l.key} style={{ display: "flex", gap: 8, padding: "4px 0", opacity: l.key === light.key ? 1 : 0.6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: "50%", background: DOT[l.key], marginTop: 3, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: T.textDim, lineHeight: 1.4 }}><b style={{ color: T.text }}>{l.label}.</b> {l.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ ...cellBase, color: T.danger, fontWeight: 700 }}>SELL</div>
                      <div style={cellBase}>−{n}</div>
                      <div style={dim}>AUTO</div>
                      <div style={{ ...cellBase, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                        {p.sym}
                        {acctShort(p) && <span title={`Schwab account ${accountLabel(p)}`} style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4, cursor: "help" }}>{acctShort(p)}</span>}
                      </div>
                      <div style={cellBase}>{csExp(p.expiry)}</div>
                      <div style={cellBase}>{p.strike}</div>
                      <div style={cellBase}>CALL</div>
                      <div style={cellBase}>{c.breakeven.toFixed(2)} <span style={{ color: T.textDim }}>LMT</span>{beSuspect(p) && <span title={BE_WARN} style={{ color: T.warn || T.warning, cursor: "help", marginLeft: 3 }}>⚠</span>}</div>
                      <div style={dim}>LIMIT</div>
                      <div style={dim}>DAY</div>
                      <div style={dim}>BEST</div>
                      <div style={{ ...cellBase, color: DOT[light.key], fontSize: 11, whiteSpace: "normal", lineHeight: 1.3, cursor: "help" }}
                        title={`${light.label} — ${LEGEND.find((l) => l.key === light.key)?.text || ""} (~${Math.round(light.delta * 100)}% chance the call finishes in the money).${Number(p.gtc) > 0 ? ` GTC buy-back at ${usd(p.gtc)} — call ${fill.usingLiveMark ? "mark" : "(modeled)"} ${fill.markNow != null ? usd(fill.markNow) : "—"}${fill.filledNow ? " ≤ limit, should be filling now" : " > limit, not filled"}${!fill.filledNow && fill.fillDays != null ? `; ~${Math.round(fill.fillDays)}d est. to reach it at current IV` : ""}.` : ""}`}>
                        {light.label} · {Math.round(light.delta * 100)}%
                        {Number(p.gtc) > 0 && (
                          <div style={{ color: fill.filledNow ? T.success : T.textDim, fontSize: 10, fontWeight: 700 }}>
                            {fill.filledNow ? `↓GTC ${usd(p.gtc)} hit` : `GTC ${usd(p.gtc)}${fill.markNow != null ? ` · mk ${usd(fill.markNow)}` : ""}`}
                          </div>
                        )}
                      </div>
                      <div style={{ ...cellBase, textAlign: "right", color: T.textDim, transform: isOpen ? "rotate(180deg)" : "none" }}>▾</div>
                    </div>
                    {/* Leg 2 — BUY the shares */}
                    <div style={{ ...leg, marginTop: 2 }}>
                      <div />
                      <div style={{ ...cellBase, color: T.success, fontWeight: 700 }}>BUY</div>
                      <div style={cellBase}>+{n * 100}</div>
                      <div style={dim}>AUTO</div>
                      <div style={{ ...cellBase, fontWeight: 700 }}>{p.sym}</div>
                      <div />
                      <div />
                      <div style={cellBase}>STOCK</div>
                      <div style={dim}>DEBIT</div>
                      <div />
                      <div />
                      <div />
                      {c.hasCostBasis ? (
                        <div style={{ ...cellBase, fontSize: 11, color: c.close >= 0 ? T.success : T.danger, cursor: "help" }}
                          title={`If you closed this position now — buying the call back at its current price — you'd net ${usd(c.close, true)}. The ${(c.health * 100).toFixed(1)}% is the position's health: current share value plus premium kept, divided by what you paid for the shares (over 100% = ahead).`}>if closed {usd(c.close, true)} · {(c.health * 100).toFixed(1)}%</div>
                      ) : (
                        <div style={{ ...cellBase, fontSize: 11, color: c.kept >= 0 ? T.success : T.danger, cursor: "help" }}
                          title={`Premium kept so far on the call: what you collected (${usd(c.premium)}) minus the cost to buy it back now (${usd(c.buyback)}). Add a share cost basis to see whole-position P&L.`}>call kept {usd(c.kept, true)}</div>
                      )}
                      <div />
                    </div>
                    {/* Leg 3 — working GTC buy-to-close order (the buy-back), if set */}
                    {Number(p.gtc) > 0 && (
                      <div style={{ ...leg, marginTop: 2 }}>
                        <div />
                        <div style={{ ...cellBase, color: T.success, fontWeight: 700 }}>BUY</div>
                        <div style={cellBase}>+{n}</div>
                        <div style={dim}>TO CLOSE</div>
                        <div style={{ ...cellBase, fontWeight: 700 }}>{p.sym}</div>
                        <div style={cellBase}>{csExp(p.expiry)}</div>
                        <div style={cellBase}>{p.strike}</div>
                        <div style={cellBase}>CALL</div>
                        <div style={cellBase}>{Number(p.gtc).toFixed(2)} <span style={{ color: T.textDim }}>LMT</span></div>
                        <div style={gtcWorking(p) ? { ...cellBase, color: T.success, fontWeight: 700 } : dim} title={gtcWorking(p) ? `Confirmed at Schwab: this buy-back order is ${p.gtcStatus} (not filled)${p.gtcCheckedMs ? ` as of ${new Date(p.gtcCheckedMs).toLocaleDateString()}` : ""}.` : undefined}>{gtcWorking(p) ? p.gtcStatus : "LIMIT"}</div>
                        <div style={{ ...cellBase, color: T.warn, fontWeight: 700 }}>GTC</div>
                        <div style={dim}>BEST</div>
                        <div style={{ ...cellBase, color: T.success, fontSize: 11, cursor: "help" }}
                          title={`Standing GTC buy-to-close at ${usd(p.gtc)}. If it fills you keep ${usd(fill.gtcKeep)} of the premium you collected — the rest pays to close the call early and free up the shares.`}>buy-back · keeps {usd(fill.gtcKeep)}</div>
                        <div />
                      </div>
                    )}
                  </div>
                  {isOpen && <Detail T={T} p={p} c={c} fill={fill} entryMs={entryMs} acctLabel={accountLabel(p)} onUpdateLive={updateLive} onClose={closePosition} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shares by lot — fed by the same live marks */}
      <SharesByLot positions={livePositions} lots={lots} onSaveLot={saveLot} onDeleteLot={deleteLot} />

      {/* Trade History — every closed covered call, with lifecycle charts + edits */}
      <TradeHistory closed={closed} accounts={accounts} onUpdate={updateClosed} onDelete={deleteClosed}
        onSync={syncEntryDates} syncing={syncing} syncMsg={syncMsg} schwabConnected={schwabConnected} />
    </div>
  );
}

// ── Totals cell ───────────────────────────────────────────────────────────────
function Tot({ T, label, value, color, tip }) {
  return (
    <div title={tip} style={tip ? { cursor: "help" } : undefined}>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}{tip && <span style={{ marginLeft: 4, opacity: 0.6 }}>ⓘ</span>}
      </div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ── Expanded detail ───────────────────────────────────────────────────────────
function Detail({ T, p, c, fill, entryMs, acctLabel, onUpdateLive, onClose }) {
  const [bb, setBb] = useState(String(p.gtc ?? 0.1));
  const box = { textAlign: "center", padding: "10px 8px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` };
  const lbl = { color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" };
  const val = { fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 };
  const editStyle = { width: 90, minHeight: 38, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13 };
  // Fill status. The resting Schwab order status (if synced) is authoritative;
  // otherwise fall back to the call's live mark; the model is the last resort.
  const markTxt = fill.markNow != null ? usd(fill.markNow) : "—";
  const fillMsg = gtcWorking(p)
    ? `✓ Confirmed at Schwab — your buy-back order is ${p.gtcStatus} (NOT filled). Call mark ${markTxt} vs your ${usd(p.gtc ?? 0.1)} limit.${p.gtcCheckedMs ? ` As of last sync ${new Date(p.gtcCheckedMs).toLocaleDateString()}.` : ""}`
    : fill.filledNow
      ? `Call ${fill.usingLiveMark ? "mark" : "(modeled)"} ${markTxt} is at/under your ${usd(p.gtc ?? 0.1)} limit — the buy-back should be filling.`
      : fill.usingLiveMark
        ? `Not filled: call mark ${markTxt} is above your ${usd(p.gtc ?? 0.1)} limit.${fill.fillDays != null ? ` At today's price it decays to ${usd(p.gtc ?? 0.1)} with ~${Math.round(fill.fillDays)} day${Math.round(fill.fillDays) === 1 ? "" : "s"} left to expiry (estimate, current IV).` : " It stays above the limit through expiration at this price."}`
        : `No live call quote — modeled value ${markTxt} vs your ${usd(p.gtc ?? 0.1)} limit. Connect Schwab for the real mark.`;

  return (
    <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${T.border}` }}>
      {(p.acct || acctLabel) && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "2px 8px", borderRadius: 5, fontFamily: T.fontMono }}>Schwab account {acctLabel || `··${p.acct}`}</span>
        </div>
      )}
      {beSuspect(p) && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${(T.warn || T.warning)}55`, background: `${T.warn || T.warning}12`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: T.warn || T.warning, fontFamily: T.fontMono, fontSize: 12, lineHeight: 1.5, flex: 1, minWidth: 220 }}>⚠ Breakeven looks off ({usd(c.breakeven)}). The call price ({usd(p.fillCall)}) is over 25% of the share price — likely imported per-contract (×100) instead of per-share.</span>
          <button onClick={() => onUpdateLive(p.id, { fillCall: Number(p.fillCall) / 100 })} style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${T.accent}`, cursor: "pointer", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontSize: 12, fontWeight: 700 }}>Fix: ÷100 → {usd(Number(p.fillCall) / 100)}</button>
        </div>
      )}
      {/* Position summary. Stock-leg metrics need a real share cost basis; the
          premium/buy-back figures below never do. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, margin: "14px 0" }}>
        <div style={box}><div style={lbl}>Premium kept</div><div style={{ ...val, color: c.kept >= 0 ? T.success : T.danger }}>{usd(c.kept, true)}</div></div>
        <div style={box}><div style={lbl}>Buy-back now</div><div style={{ ...val, color: T.text }}>{usd(c.buyback)}</div></div>
        <div style={box}><div style={lbl}>Money in</div><div style={{ ...val, color: T.text }}>{c.hasCostBasis ? usd(c.basis) : "—"}</div></div>
        <div style={box}><div style={lbl}>If closed now</div><div style={{ ...val, color: c.hasCostBasis ? (c.close >= 0 ? T.success : T.danger) : T.textDim }}>{c.hasCostBasis ? usd(c.close, true) : "—"}</div></div>
        <div style={box}><div style={lbl}>Max profit</div><div style={{ ...val, color: c.hasCostBasis ? T.accent : T.textDim }}>{c.hasCostBasis ? usd(c.maxProfit, true) : "—"}</div></div>
        <div style={box} title={beSuspect(p) ? BE_WARN : undefined}><div style={lbl}>Breakeven{beSuspect(p) && c.hasCostBasis ? " ⚠" : ""}</div><div style={{ ...val, color: c.hasCostBasis ? T.warn : T.textDim }}>{c.hasCostBasis ? usd(c.breakeven) : "—"}</div></div>
        <div style={box}><div style={lbl}>Health</div><div style={{ ...val, color: c.hasCostBasis ? T.text : T.textDim }}>{c.hasCostBasis ? `${(c.health * 100).toFixed(1)}%` : "—"}</div></div>
      </div>
      {!c.hasCostBasis && (
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 11, marginTop: -4, marginBottom: 6, lineHeight: 1.5 }}>
          Stock-leg metrics (money in, if-closed, max profit, breakeven, health) are hidden — no share cost basis entered. The covered-call figures above (premium kept, buy-back) don't need it. Add “Share price paid” below to see the whole-position P&L.
        </div>
      )}

      {/* GTC fill estimate */}
      <div style={{ padding: "12px 14px", background: T.accentDim, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>GTC buy back {usd(p.gtc ?? 0.1)} → locks in {usd(fill.gtcKeep)}</div>
        <div style={{ color: T.textDim, fontSize: 12, marginTop: 3 }}>{fillMsg}</div>
      </div>

      {/* Price chart — stock vs strike / breakeven / entry / exit */}
      <WorkingPositionChart
        symbol={p.sym}
        strike={p.strike}
        breakeven={c.breakeven}
        currentPrice={p.liveStock}
        entryStock={p.fillStock}
        expiry={p.expiry}
        openedAtMs={entryMs ?? p.openedAtMs}
        gtc={p.gtc ?? 0.1}
        keeps={fill.gtcKeep}
        contracts={p.contracts || 1}
        entryCall={p.fillCall}
        currentCall={p.liveCall}
        iv={(p.iv || 25) / 100}
        daysToExpiry={p.daysToExpiry}
        onSetEntry={(ms) => onUpdateLive(p.id, { openedAtMs: ms })}
      />

      {/* Live marks — editable */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: beSuspect(p) ? (T.warn || T.warning) : T.textDim }}>Call sold at (entry)<br />
          <input defaultValue={p.fillCall} onBlur={(e) => onUpdateLive(p.id, { fillCall: Number(e.target.value) || p.fillCall })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Share price paid<br />
          <input defaultValue={p.fillStock} onBlur={(e) => onUpdateLive(p.id, { fillStock: Number(e.target.value) || p.fillStock })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Live stock<br />
          <input defaultValue={p.liveStock} onBlur={(e) => onUpdateLive(p.id, { liveStock: Number(e.target.value) || p.liveStock })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Live call<br />
          <input defaultValue={p.liveCall} onBlur={(e) => onUpdateLive(p.id, { liveCall: Number(e.target.value) || 0 })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>GTC<br />
          <input defaultValue={p.gtc ?? 0.1} onBlur={(e) => onUpdateLive(p.id, { gtc: Number(e.target.value) || 0 })} style={editStyle} /></label>
        <label style={{ fontSize: 11, color: T.textDim }}>Entry date (call sold)<br />
          <input type="date" defaultValue={msToDate(entryMs)}
            onChange={(e) => { const ms = dateToMs(e.target.value); if (ms) onUpdateLive(p.id, { openedAtMs: ms }); }}
            style={{ ...editStyle, width: 160 }} /></label>
      </div>
      {!Number.isFinite(entryMs) && (
        <div style={{ color: T.warn || T.warning, fontSize: 11, fontFamily: T.fontMono, marginTop: -6, marginBottom: 12 }}>
          ⬆ Set the entry date (e.g. Oct 2) to mark where you sold this call — then tap <b>Range</b> on the chart to see it from entry to expiration.
        </div>
      )}

      {/* Four exit paths */}
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Exit paths</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Buy back</div>
          <input value={bb} onChange={(e) => setBb(e.target.value)} style={{ ...editStyle, width: "100%" }} />
          <button onClick={() => onClose(p.id, "bought", { buyback: Number(bb) || 0 })} style={btn(T)}>Record buy back</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Expired</div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>Keeps all {usd(c.premium)} premium.</div>
          <button onClick={() => onClose(p.id, "expired")} style={btn(T)}>Mark expired</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Called away</div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>Sells shares at ${p.strike}. Lot-aware.</div>
          <button onClick={() => onClose(p.id, "called")} style={btn(T)}>Mark called</button>
        </div>
        <div style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Roll</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>Buy back, then add a new later/higher call from the header.</div>
        </div>
      </div>
    </div>
  );
}

const btn = (T) => ({ marginTop: 8, width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontMono, fontSize: 12, cursor: "pointer" });

// ── Add / paste form ──────────────────────────────────────────────────────────
function AddForm({ T, lots = [], positions = [], onSave, onDone }) {
  const empty = { sym: "", contracts: "1", fillStock: "", fillCall: "", strike: "", expiry: "", gtc: "0.10", iv: "", liveStock: "", liveCall: "", lotId: "new" };
  const [f, setF] = useState(empty);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const symU = String(f.sym || "").trim().toUpperCase();
  const coveredLotIds = new Set(positions.map((p) => p.lotId).filter(Boolean));
  const freeLots = lots.filter((l) => l.sym === symU && !coveredLotIds.has(l.id));
  const match = symU && f.strike && f.expiry ? positions.find((p) => p.id === positionId(symU, Number(f.strike), f.expiry)) : null;

  const inp = { width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 14 };
  const lbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: T.textDim, fontWeight: 500 };

  const doParse = () => {
    const { out, found } = parsePaste(paste);
    const merged = { ...f, ...Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== "")) };
    setF(merged);
    const need = [];
    if (!String(merged.sym || "").trim()) need.push("symbol");
    if (!(Number(merged.strike) > 0)) need.push("strike");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(merged.expiry || "")) need.push("expiration");
    if (!(Number(merged.fillStock) > 0)) need.push("share price paid");
    if (!(Number(merged.fillCall) > 0)) need.push("call sold at");
    if (found.length && need.length) setMsg(`Read ${found.join(", ")}. Still need: ${need.join(", ")} — type it in, or paste your opening BOT shares + SOLD call.`);
    else if (found.length) setMsg(`Read ${found.join(", ")}. Looks complete — hit Add position.`);
    else setMsg("Couldn't read that. Type the fields on the right, or paste your opening BOT shares + SOLD call lines.");
  };
  const submit = async () => {
    // Auto-parse any pasted text first, so "paste → Add position" works without
    // needing the separate Read-paste click.
    let data = f;
    if (paste.trim()) {
      const { out } = parsePaste(paste);
      data = { ...f, ...Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== "")) };
      setF(data);
    }
    const res = await onSave(data);
    if (res.ok) { setF(empty); setPaste(""); setMsg(""); onDone(); }
    else if (res.error) setMsg(`Couldn't save: ${res.error}`);
    else setMsg("Still need: " + (res.missing || []).join(", ") + " — type it in, or also paste your opening BOT shares + SOLD call.");
  };

  const field = (k, label, ph, type = "text", span = 1) => (
    <label style={{ ...lbl, gridColumn: `span ${span}` }}>{label}
      <input type={type} value={f[k]} onChange={set(k)} placeholder={ph} style={inp} /></label>
  );
  const Code = ({ children }) => <code style={{ color: T.text, fontFamily: T.fontMono }}>{children}</code>;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 12, padding: 22, marginBottom: 16 }}>
      <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 18, margin: "0 0 14px" }}>Add or update a covered call</h3>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Left — paste, with the exact formats shown */}
        <div style={{ flex: "1 1 260px", minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Paste from thinkorswim, or a quick note</label>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} onBlur={() => { if (paste.trim()) doParse(); }} rows={6} placeholder="Paste fill notifications or order rows here"
            style={{ ...inp, minHeight: 120, padding: 12, resize: "vertical", lineHeight: 1.5 }} />
          <button onClick={doParse} style={{ ...btn(T), width: "auto", alignSelf: "flex-start", padding: "10px 18px" }}>Read paste</button>
          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7 }}>
            <b style={{ color: T.text }}>Best:</b> in thinkorswim <b style={{ color: T.text }}>Monitor → Position Statement</b>, select your stock + call rows and paste — it captures your cost basis and live prices automatically. Also reads order lines (<Code>SOLD -1 PFE 100 16 OCT 26 28 CALL @.55</Code>), a quick note (<Code>PFE, 1, 27.80, .55, 28, 10/16/26, .10</Code>), or plain English (<Code>100 shares of PFE, sold 1 call at $0.55, hits $28 by Oct 16, breakeven $27.25</Code>).
          </div>
        </div>
        {/* Right — fields */}
        <div style={{ flex: "1.4 1 320px", minWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            {field("sym", "Symbol", "PFE")}
            {field("contracts", "Contracts", "1")}
            {field("fillStock", "Share price paid", "27.80")}
            {field("fillCall", "Call sold at", "0.55")}
            {field("strike", "Strike", "28")}
            {field("expiry", "Expiration", "", "date")}
            {field("gtc", "GTC buy back", "0.10")}
            {field("iv", "IV % (optional)", "25")}
            {field("liveStock", "Current stock price (optional)", "", "text", 2)}
            {field("liveCall", "Current call price (optional)", "", "text", 2)}
          </div>
          {symU && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: T.textDim, fontWeight: 500 }}>Shares for this call</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ id: "new", label: "New purchase" }, ...freeLots.map((l) => ({ id: l.id, label: `${l.shares} sh @ $${Number(l.cost).toFixed(2)}` }))].map((o) => {
                  const on = f.lotId === o.id;
                  return (
                    <button key={o.id} onClick={() => setF((s) => ({ ...s, lotId: o.id }))}
                      style={{ minHeight: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontFamily: T.fontMono, fontSize: 13,
                        border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accentDim : T.card, color: on ? T.accent : T.textDim }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: T.textDim }}>
                {f.lotId === "new" ? "Creates a new lot at the share price above." : "Covers a lot you already hold — no new shares bought."}
              </span>
            </div>
          )}
          {msg && <div style={{ fontSize: 13, lineHeight: 1.5, padding: "10px 12px", borderRadius: 8, background: T.card, color: T.text }}>{msg}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onDone} style={{ ...btn(T), width: "auto", padding: "10px 18px" }}>Cancel</button>
            <button onClick={submit} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontWeight: 700, cursor: "pointer" }}>
              {match ? "Update position" : "Add position"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
