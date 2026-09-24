// ─── src/hooks/usePositions.js ───────────────────────────────────────────────
// Firestore-backed store for covered-call positions, tax lots, and closed calls.
// Ports the prototype's saveForm / closePos / saveLot (Portfolio.dc.html) onto
// per-user subcollections.
//
//   users/{uid}/positions/{id}   open covered calls   (id = sym-strike-expiry)
//   users/{uid}/lots/{id}        share tax lots
//   users/{uid}/closed/{id}      closed calls (history / tax)
//
// Live prices/marks are just fields on a position; the Working tab (Phase 3)
// renders these through src/lib/coveredCallMath.js.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { positionId } from "../lib/positionParser";
import { deliveryOrder } from "../lib/coveredCallMath";
import { syncQuietly, openTransactions, closeTransactions, lotTransactions } from "../lib/sheetSync";

const todayISO = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, local

function useCollection(uid, name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) { setItems([]); setLoading(false); return; }
    const ref = collection(getFirestore(), "users", uid, name);
    return onSnapshot(ref, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => { console.error(`usePositions — ${name} snapshot error:`, err); setLoading(false); });
  }, [uid, name]);
  return [items, loading];
}

export function usePositions() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;

  const [positions, posLoading] = useCollection(uid, "positions");
  const [lots, lotsLoading] = useCollection(uid, "lots");
  const [closed, closedLoading] = useCollection(uid, "closed");

  // Is a Google Sheet connected? Gates the fire-and-forget ledger sync.
  const [sheetOn, setSheetOn] = useState(false);
  useEffect(() => {
    if (!uid) { setSheetOn(false); return; }
    return onSnapshot(doc(getFirestore(), "users", uid), (d) => setSheetOn(!!d.data()?.sheetId), () => {});
  }, [uid]);
  const trySync = useCallback((payload) => { if (sheetOn) syncQuietly(payload); }, [sheetOn]);

  const posRef = (id) => doc(getFirestore(), "users", uid, "positions", id);
  const lotRef = (id) => doc(getFirestore(), "users", uid, "lots", id);
  const closedRef = (id) => doc(getFirestore(), "users", uid, "closed", id);

  // ── Add or edit a position ──────────────────────────────────────────────────
  // form: { sym, contracts, fillStock, fillCall, strike, expiry, gtc, iv, liveStock, liveCall, lotId }
  // Returns { ok, missing } — missing lists required fields when incomplete.
  const savePosition = useCallback(async (form) => {
    if (!uid) return { ok: false, missing: ["sign-in"] };
    const sym = String(form.sym || "").trim().toUpperCase();
    const strike = Number(form.strike);
    const expiry = form.expiry;
    const id = positionId(sym, strike, expiry);
    const existing = positions.find((p) => p.id === id);
    const chosenLot = !existing && form.lotId && form.lotId !== "new" ? lots.find((l) => l.id === form.lotId) : null;

    const missing = [];
    if (!sym) missing.push("symbol");
    if (!(strike > 0)) missing.push("strike");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ""))) missing.push("expiration");
    if (!existing && !chosenLot && !(Number(form.fillStock) > 0)) missing.push("share price paid");
    if (!existing && !(Number(form.fillCall) > 0)) missing.push("call sold at");
    if (missing.length) return { ok: false, missing };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dte = Math.max(1, Math.round((new Date(expiry) - today) / 86400000));

    const base = existing || { id, sym, strike, expiry, iv: 25, gtc: 0.1 };
    const next = { ...base, daysToExpiry: dte, updatedAt: serverTimestamp() };
    const setIf = (k, v, ok) => { const n = Number(v); if (v != null && v !== "" && !isNaN(n) && ok(n)) next[k] = n; };
    setIf("contracts", form.contracts, (v) => v >= 1);
    setIf("fillStock", form.fillStock, (v) => v > 0);
    setIf("fillCall", form.fillCall, (v) => v > 0);
    setIf("gtc", form.gtc, (v) => v >= 0);
    setIf("iv", form.iv, (v) => v > 0);
    setIf("liveStock", form.liveStock, (v) => v > 0);
    setIf("liveCall", form.liveCall, (v) => v >= 0);
    next.contracts = Math.round(next.contracts || 1);

    const batch = writeBatch(getFirestore());
    if (!existing) {
      if (chosenLot) {
        next.lotId = chosenLot.id;
        if (!(Number(form.fillStock) > 0)) next.fillStock = chosenLot.cost;
      } else {
        const lot = { sym, shares: next.contracts * 100, cost: next.fillStock, bought: todayISO(), premiumKept: 0 };
        const newLotId = `${id}-lot`;
        next.lotId = newLotId;
        batch.set(lotRef(newLotId), lot, { merge: true });
      }
    }
    // Default live values from a sibling position of the same symbol, else the fill.
    const sameSym = positions.find((p) => p.sym === sym && p.id !== id);
    if (next.liveStock == null) next.liveStock = sameSym ? sameSym.liveStock : next.fillStock;
    if (next.liveCall == null) next.liveCall = next.fillCall;
    if (!existing && next.iv == null && sameSym) next.iv = sameSym.iv;

    batch.set(posRef(id), next, { merge: true });
    await batch.commit();

    // Sync a newly opened call to the ledger (edits are idempotent-skipped there).
    if (!existing) trySync({ transactions: openTransactions(next, { includeShares: !chosenLot }) });
    return { ok: true, id };
  }, [uid, positions, lots, trySync]);

  // ── Update live marks (price/call/gtc) on a position ────────────────────────
  const updateLive = useCallback(async (id, patch) => {
    if (!uid) return;
    await setDoc(posRef(id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  }, [uid]);

  // ── Close a position ────────────────────────────────────────────────────────
  // how: 'bought' (buyback price) | 'expired' | 'called' (assigns lots by delivery order)
  const closePosition = useCallback(async (id, how, { buyback = 0 } = {}) => {
    if (!uid) return;
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    const q = (p.contracts || 1) * 100;
    const batch = writeBatch(getFirestore());
    let stockGain = 0;
    const delivered = [];
    const deliveredDetail = [];

    if (how === "called") {
      let need = q;
      for (const l of deliveryOrder(p.sym, p.strike, lots)) {
        if (need <= 0) break;
        const take = Math.min(need, l.shares);
        stockGain += (p.strike - l.cost) * take;
        const remaining = l.shares - take;
        need -= take;
        delivered.push(l.id);
        deliveredDetail.push({ lotId: l.id, shares: take });
        if (remaining > 0) batch.set(lotRef(l.id), { shares: remaining }, { merge: true });
        else batch.delete(lotRef(l.id));
      }
      if (need > 0) stockGain += (p.strike - p.fillStock) * need;
    } else if (how === "bought" && p.lotId) {
      const lot = lots.find((l) => l.id === p.lotId);
      if (lot) batch.set(lotRef(p.lotId), { premiumKept: (lot.premiumKept || 0) + (p.fillCall - buyback) * q }, { merge: true });
    }

    const rec = {
      sym: p.sym, contracts: p.contracts || 1, strike: p.strike, expiry: p.expiry,
      fillStock: p.fillStock, fillCall: p.fillCall, buyback: how === "bought" ? buyback : 0,
      how, stockGain, delivered, closedOn: todayISO(), closedAt: serverTimestamp(),
    };
    batch.set(closedRef(`${id}-${Date.now()}`), rec);
    batch.delete(posRef(id));
    await batch.commit();

    trySync({ transactions: closeTransactions(p, how, how === "bought" ? buyback : 0, deliveredDetail) });
  }, [uid, positions, lots, trySync]);

  // ── Lots ────────────────────────────────────────────────────────────────────
  const saveLot = useCallback(async (form) => {
    if (!uid) return { ok: false };
    const sym = String(form.sym || "").trim().toUpperCase();
    const shares = Math.round(Number(form.shares) || 0);
    const cost = Number(form.cost);
    if (!sym || shares <= 0 || !(cost > 0)) return { ok: false, missing: ["symbol, shares, price"] };
    const id = `${sym.toLowerCase()}-${Date.now().toString(36)}`;
    const bought = form.bought || todayISO();
    await setDoc(lotRef(id), { sym, shares, cost, bought, premiumKept: 0, lastPrice: cost });
    trySync({ transactions: lotTransactions({ id, sym, shares, cost, bought }) });
    return { ok: true, id };
  }, [uid, trySync]);

  const deletePosition = useCallback(async (id) => { if (uid) await deleteDoc(posRef(id)); }, [uid]);
  const deleteLot = useCallback(async (id) => { if (uid) await deleteDoc(lotRef(id)); }, [uid]);

  return {
    positions, lots, closed,
    loading: posLoading || lotsLoading || closedLoading,
    savePosition, updateLive, closePosition, saveLot, deletePosition, deleteLot,
  };
}
