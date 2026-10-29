// ─── src/components/OptionsWorkingTab.jsx ────────────────────────────────────
// Options Manager → Working: open single-leg option positions (long/short calls
// & puts, equity + futures/treasury options) with live P&L, per-position charts,
// and exit actions. Mirrors the Covered Calls Working tab for general options.

import { useState, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useOptionPositions } from "../hooks/useOptionPositions";
import { optionCalcs, moneyness, daysToExpiry, optType, isLong } from "../lib/optionsMath";
import { useBrokerConnection } from "../hooks/useBrokerConnection";
import { schwabGetPositions } from "../services/schwabApi";
import { parseSchwabOptionPositions } from "../lib/schwabPositions";
import { useOptionLive } from "../hooks/useOptionLive";
import { groupIntoStrategies, strategyCalcs, profitTargets } from "../lib/optionStrategies";
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
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const csExp = (iso) => { const [y, m, d] = String(iso || "").split("-").map(Number); return y ? `${d} ${MON3[(m || 1) - 1]} ${String(y).slice(-2)}` : ""; };
const msToDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "");
const dateToMs = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00").getTime() : null);

export default function OptionsWorkingTab() {
  const { T } = useTheme();
  const { positions, loading, savePosition, updateLive, closePosition, deletePosition } = useOptionPositions();
  const { activeConnection, activeAccount, accounts } = useBrokerConnection();
  const schwabConnected = activeConnection?.status === "connected";
  const [open, setOpen] = useState({});
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
      let added = 0, acctsHit = 0, closedCt = 0;
      const pulledByAcct = {}; // acctId -> Set(legKey) of what Schwab currently holds
      for (const acct of accts) {
        if (!acct?.hashValue) continue;
        const acctTag = String(acct.accountId || "").slice(-4);
        const data = await schwabGetPositions({ accountHash: acct.hashValue }).then((r) => r.data).catch(() => null);
        if (!data) continue;
        acctsHit++;
        const keys = new Set();
        for (const o of parseSchwabOptionPositions(data)) {
          keys.add(legKey(o));
          const r = await savePosition({ ...o, acct: acctTag, acctId: acct.accountId });
          if (r.ok) added++;
        }
        pulledByAcct[acct.accountId] = keys;
      }
      // Archive tracked positions that are no longer open at an account we pulled.
      for (const p of positions) {
        if (!p.acctId || !(p.acctId in pulledByAcct)) continue; // only reconcile accounts we reached
        if (pulledByAcct[p.acctId].has(legKey(p))) continue;     // still open at the broker
        const dte = daysToExpiry(p.expiry);
        await closePosition(p.id, dte != null && dte < 0 ? "expired" : "sold", { exitPrice: Number(p.livePrice) || 0 });
        closedCt++;
      }
      setImportMsg({ ok: true, text: acctsHit ? `Synced ${acctsHit} account${acctsHit === 1 ? "" : "s"}: ${added} imported/updated${closedCt ? `, ${closedCt} moved to history` : ""}.` : "Couldn't reach Schwab." });
    } catch (e) { setImportMsg({ ok: false, text: e?.message || "Sync failed." }); }
    finally { setImporting(false); }
  };

  // Seed a sample TLT long straddle (two legs, same strike/expiry) so the
  // strategy card + chart can be previewed without a live multi-leg position.
  const addSampleStraddle = async () => {
    const d = new Date(); d.setDate(d.getDate() + 45);
    const expiry = d.toISOString().slice(0, 10);
    const base = { sym: "TLT", strike: "90", expiry, contracts: "1", multiplier: "100", underlyingType: "equity", fillUnderlying: "90", liveUnderlying: "90" };
    await savePosition({ ...base, type: "CALL", direction: "long", fillPrice: "1.80", livePrice: "2.40" });
    await savePosition({ ...base, type: "PUT", direction: "long", fillPrice: "1.70", livePrice: "0.90" });
    setImportMsg({ ok: true, text: "Added a sample TLT long straddle — expand the card to see the chart. Delete the legs when you're done." });
  };

  const rows = useMemo(() => singleLegs.map((p) => {
    const c = optionCalcs(p);
    const m = moneyness(p, p.liveUnderlying ?? p.fillUnderlying);
    const dte = daysToExpiry(p.expiry);
    return { p, c, m, dte };
  }).sort((a, b) => (a.dte ?? 1e9) - (b.dte ?? 1e9)), [singleLegs]);

  const totals = useMemo(() => livePositions.reduce((a, p) => { const c = optionCalcs(p); return {
    cost: a.cost + (c.long ? c.cost : 0), credit: a.credit + (c.long ? 0 : c.cost),
    value: a.value + c.value, pl: a.pl + c.pl,
  }; }, { cost: 0, credit: 0, value: 0, pl: 0 }), [livePositions]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };
  const h3 = { color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 };
  const COLS = "118px 70px 72px 104px 64px 120px 120px 26px";

  return (
    <div role="region" aria-label="Working options">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ ...h3, fontSize: 20 }}>Working Options</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {livePositions.length > 0 && (
            <span style={{ color: liveStatus.source === "schwab" ? T.success : T.textDim, fontSize: 10, fontFamily: T.fontMono }}>
              {liveStatus.loading ? "updating…" : liveStatus.source === "schwab" ? "● Schwab live" : "Yahoo · delayed"}
            </span>
          )}
          {schwabConnected && (
            <button onClick={syncFromSchwab} disabled={importing} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, opacity: importing ? 0.6 : 1 }}>
              {importing ? "Syncing…" : "⟳ Sync from Schwab"}
            </button>
          )}
          <button onClick={() => setShowAdd((v) => !v)} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, cursor: "pointer", background: showAdd ? "transparent" : T.accent, color: showAdd ? T.accent : "#0A0A0A", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700 }}>{showAdd ? "Close" : "+ Add"}</button>
        </div>
      </div>

      {importMsg && <div style={{ marginBottom: 12, color: importMsg.ok ? T.textDim : T.danger, fontFamily: T.fontMono, fontSize: 12 }}>{importMsg.text}</div>}
      {showAdd && <AddOptionForm T={T} onSave={savePosition} onDone={() => setShowAdd(false)} />}

      {livePositions.length > 0 && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          <Tot T={T} label="Debit (paid)" value={usd(totals.cost)} tip="Total premium paid for your long options (price × multiplier × contracts)." />
          <Tot T={T} label="Credit (received)" value={usd(totals.credit)} color={T.success} tip="Total premium received for options you sold (short positions)." />
          <Tot T={T} label="Current value" value={usd(totals.value)} tip="Current market value of all the option contracts." />
          <Tot T={T} label="Open P&L" value={usd(totals.pl, true)} color={totals.pl >= 0 ? T.success : T.danger} tip="Unrealized profit/loss right now — long options gain as they rise, short options gain as they decay." />
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
          <button onClick={addSampleStraddle} style={{ marginTop: 18, padding: "9px 16px", borderRadius: 8, border: `1px dashed ${T.accent}`, background: "transparent", color: T.accent, fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            + Add a sample straddle (to try the chart)
          </button>
        </div>
      ) : (<>
        {multiGroups.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            {multiGroups.map((g) => (
              <StrategyCard key={g.key} T={T} group={g} onClose={closePosition} acctLabel={acctShort(g.legs[0])} />
            ))}
          </div>
        )}
        {rows.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          {multiGroups.length > 0 && <div style={{ padding: "12px 16px 0", color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 0.5, textTransform: "uppercase" }}>Single-leg positions</div>}
          <div style={{ minWidth: 760 }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "9px 16px", borderBottom: `1px solid ${T.border}` }}>
              {["Contract", "Side", "Strike", "Expiry", "DTE", "Entry → Live", "Open P&L", ""].map((h, i) => (
                <div key={i} style={{ color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
              ))}
            </div>
            {rows.map(({ p, c, m, dte }) => {
              const isOpen = !!open[p.id];
              const cell = { fontFamily: T.fontMono, fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 };
              const sideColor = c.long ? T.success : T.danger;
              return (
                <div key={p.id} style={{ borderBottom: `1px solid ${T.border}`, background: isOpen ? T.card : "transparent" }}>
                  <div onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} style={{ cursor: "pointer", padding: "10px 16px", display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                    <div style={{ ...cell, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.itm ? T.accent : T.border, flexShrink: 0 }} />
                      {p.sym} {optType(p)}
                      {acctShort(p) && <span title={`Schwab account ${acctShort(p)}`} style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4 }}>{acctShort(p)}</span>}
                    </div>
                    <div style={{ ...cell, color: sideColor, fontWeight: 700 }}>{c.long ? "LONG" : "SHORT"} ×{c.qty}</div>
                    <div style={cell}>{usd(p.strike)}</div>
                    <div style={cell}>{csExp(p.expiry)}</div>
                    <div style={cell}>{dte != null ? `${dte}d` : "—"} <span style={{ color: m.itm ? T.accent : T.textDim, fontSize: 10 }}>{m.label}</span></div>
                    <div style={cell}>{usd(c.fill)} → {usd(c.live)}</div>
                    <div style={{ ...cell, color: c.pl >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(c.pl, true)} <span style={{ fontSize: 10 }}>({c.plPct >= 0 ? "+" : ""}{c.plPct.toFixed(0)}%)</span></div>
                    <div style={{ ...cell, textAlign: "right", color: T.textDim, transform: isOpen ? "rotate(180deg)" : "none" }}>▾</div>
                  </div>
                  {isOpen && <OptionDetail T={T} p={p} c={c} m={m} dte={dte} onUpdate={updateLive} onClose={closePosition} onDelete={deletePosition} acctShort={acctShort(p)} />}
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

function StrategyCard({ T, group, onClose, acctLabel }) {
  const [open, setOpen] = useState(false);
  const calc = strategyCalcs(group, {});
  const tgt = profitTargets(calc);
  const { kind, openPL, credit, debit, dte } = calc;
  const hc = ({ good: T.success, warn: T.warn, bad: T.danger, neutral: T.textDim })[tgt.health.color] || T.textDim;
  const netStr = kind === "credit" ? `Credit ${usd(credit)}` : `Debit ${usd(debit)}`;
  const pct = (kind === "credit" ? credit : debit) > 0 ? Math.round((openPL / (kind === "credit" ? credit : debit)) * 100) : 0;
  const cell = { fontFamily: T.fontMono, fontSize: 12.5, color: T.text, whiteSpace: "nowrap" };
  const closeAll = () => group.legs.forEach((l) => onClose(l.id, "sold", { exitPrice: Number(l.livePrice ?? l.fillPrice) || 0 }));

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setOpen((v) => !v)} style={{ cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
          <span style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 600 }}>{group.sym} {group.strategy}</span>
          {acctLabel && <span style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 5px", borderRadius: 4, fontFamily: T.fontMono }}>{acctLabel}</span>}
        </div>
        <span style={{ ...cell, color: T.textDim }}>{group.legs.length} legs · {csExp(group.expiry)}</span>
        <span style={{ ...cell }}>{netStr}</span>
        <span style={{ ...cell, color: dte <= tgt.manageDte ? T.warn : T.textDim }}>{dte}d</span>
        <span style={{ ...cell, color: openPL >= 0 ? T.success : T.danger, fontWeight: 700 }}>{usd(openPL, true)} <span style={{ fontSize: 10 }}>({pct >= 0 ? "+" : ""}{pct}%)</span></span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: hc, background: `${hc}22`, padding: "2px 8px", borderRadius: 5, fontFamily: T.fontMono }}>{tgt.health.label}</span>
          <span style={{ color: T.textDim, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
        </span>
      </div>

      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ background: `${hc}12`, border: `1px solid ${hc}44`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12.5, fontFamily: T.fontMono, margin: "14px 0 6px" }}>
            {tgt.recommendation}
          </div>

          <StrategyPositionChart calc={calc} targets={tgt} T={T} />

          <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", margin: "6px 0 6px" }}>Legs</div>
          {group.legs.map((l) => {
            const c = optionCalcs(l);
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${T.border}55` }}>
                <span style={{ ...cell, color: c.long ? T.success : T.danger, fontWeight: 700, minWidth: 92 }}>{c.long ? "LONG" : "SHORT"} ×{c.qty}</span>
                <span style={{ ...cell, minWidth: 120 }}>{usd(l.strike)} {optType(l)}</span>
                <span style={{ ...cell, color: T.textDim }}>{usd(c.fill)} → {usd(c.live)}</span>
                <span style={{ ...cell, color: c.pl >= 0 ? T.success : T.danger }}>{usd(c.pl, true)}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => onClose(l.id, "sold", { exitPrice: Number(l.livePrice ?? l.fillPrice) || 0 })} style={legBtn(T)}>Close</button>
                  <button onClick={() => onClose(l.id, "expired")} style={legBtn(T)}>Expire</button>
                </span>
              </div>
            );
          })}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={closeAll} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, background: "transparent", color: T.accent, fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Close entire strategy (record at live marks)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const legBtn = (T) => ({ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontMono, fontSize: 11, cursor: "pointer" });

function OptionDetail({ T, p, c, m, dte, onUpdate, onClose, onDelete, acctShort }) {
  const [exit, setExit] = useState(String(p.livePrice ?? p.fillPrice ?? ""));
  const [confirmDel, setConfirmDel] = useState(false);
  const box = { textAlign: "center", padding: "10px 8px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}` };
  const lbl = { color: T.textDim, fontSize: 9, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" };
  const val = { fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 };
  const editStyle = { width: 110, minHeight: 36, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13 };
  const closeVerb = c.long ? "Sell to close" : "Buy to close";

  return (
    <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${T.border}` }}>
      {acctShort && <div style={{ marginTop: 8 }}><span style={{ fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "2px 8px", borderRadius: 5, fontFamily: T.fontMono }}>Schwab account {acctShort}</span></div>}
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
      />

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
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Close this option</div>
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
            <span style={{ color: T.danger, fontSize: 11, fontFamily: T.fontMono }}>Delete this position (not a close)?</span>
            <button onClick={() => onDelete(p.id)} style={{ ...btn(T), width: "auto", marginTop: 0, color: T.danger, borderColor: T.danger }}>Delete</button>
            <button onClick={() => setConfirmDel(false)} style={{ ...btn(T), width: "auto", marginTop: 0 }}>Cancel</button>
          </span>
        ) : <button onClick={() => setConfirmDel(true)} style={{ ...btn(T), width: "auto", marginTop: 0, color: T.textDim }}>Delete</button>}
      </div>
    </div>
  );
}

const btn = (T) => ({ marginTop: 8, width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontMono, fontSize: 12, cursor: "pointer" });

function AddOptionForm({ T, onSave, onDone }) {
  const empty = { sym: "", type: "CALL", direction: "long", strike: "", expiry: "", contracts: "1", fillPrice: "", livePrice: "", underlyingType: "equity", fillUnderlying: "", liveUnderlying: "" };
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = { width: "100%", boxSizing: "border-box", minHeight: 42, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 14 };
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
      {msg && <div style={{ color: T.danger, fontSize: 12, marginTop: 10, fontFamily: T.fontMono }}>{msg}</div>}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button onClick={submit} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add option</button>
        <button onClick={onDone} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, fontFamily: T.fontMono, fontSize: 13, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function Tot({ T, label, value, color, tip }) {
  return (
    <div title={tip} style={tip ? { cursor: "help" } : undefined}>
      <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase" }}>{label}{tip && <span style={{ marginLeft: 4, opacity: 0.6 }}>ⓘ</span>}</div>
      <div style={{ color: color || T.text, fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
    </div>
  );
}
