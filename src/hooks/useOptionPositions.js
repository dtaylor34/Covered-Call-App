// ─── src/hooks/useOptionPositions.js ─────────────────────────────────────────
// Firestore store for the Options Manager: open single-leg option positions and
// their closed history (expired / sold). Separate from covered calls.
//
//   users/{uid}/optionPositions/{id}   open options  (id = sym-type-strike-exp-dir[-acct])
//   users/{uid}/optionClosed/{id}      closed options (history)

import { useState, useEffect, useCallback } from "react";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { optionId } from "../lib/optionsMath";

const num = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };

function useCollection(uid, name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) { setItems([]); setLoading(false); return; }
    const ref = collection(getFirestore(), "users", uid, name);
    return onSnapshot(ref, (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error(`useOptionPositions — ${name} snapshot:`, err); setLoading(false); });
  }, [uid, name]);
  return [items, loading];
}

export function useOptionPositions() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;
  const [positions, posLoading] = useCollection(uid, "optionPositions");
  const [closed, closedLoading] = useCollection(uid, "optionClosed");

  const posRef = (id) => doc(getFirestore(), "users", uid, "optionPositions", id);
  const closedRef = (id) => doc(getFirestore(), "users", uid, "optionClosed", id);

  // form: { sym, type, direction, strike, expiry, contracts, fillPrice, livePrice,
  //         multiplier, underlyingType, fillUnderlying, liveUnderlying, iv, acct, acctId }
  const savePosition = useCallback(async (form) => {
    if (!uid) return { ok: false, missing: ["sign-in"] };
    const sym = String(form.sym || "").trim().toUpperCase();
    const type = String(form.type || "CALL").toUpperCase() === "PUT" ? "PUT" : "CALL";
    const direction = String(form.direction || "long").toLowerCase() === "short" ? "short" : "long";
    const strike = num(form.strike) || 0;
    const expiry = form.expiry;
    const acct = form.acct ? String(form.acct) : null;
    const id = form.id || optionId(sym, type, strike, expiry, direction, acct);
    const existing = positions.find((p) => p.id === id);

    const missing = [];
    if (!sym) missing.push("symbol");
    if (!(strike > 0)) missing.push("strike");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ""))) missing.push("expiration");
    if (!existing && !(num(form.fillPrice) > 0)) missing.push("entry price");
    if (missing.length) return { ok: false, missing };

    const base = existing || { id, sym, type, direction, strike, expiry, openedAt: serverTimestamp(), openedAtMs: Date.now() };
    const next = { ...base, updatedAt: serverTimestamp() };
    const setIf = (k, v, ok = (x) => x != null) => { const x = num(v); if (x != null && ok(x)) next[k] = x; };
    setIf("contracts", form.contracts, (v) => v >= 1);
    setIf("fillPrice", form.fillPrice, (v) => v >= 0);
    setIf("livePrice", form.livePrice, (v) => v >= 0);
    setIf("multiplier", form.multiplier, (v) => v > 0);
    setIf("fillUnderlying", form.fillUnderlying, (v) => v > 0);
    setIf("liveUnderlying", form.liveUnderlying, (v) => v > 0);
    setIf("iv", form.iv, (v) => v > 0);
    next.contracts = Math.max(1, Math.round(next.contracts || 1));
    if (!next.multiplier) next.multiplier = form.underlyingType === "future" ? 1000 : 100;
    if (form.underlyingType) next.underlyingType = form.underlyingType;
    if (Number.isFinite(Number(form.openedAtMs))) next.openedAtMs = Number(form.openedAtMs);
    if (next.livePrice == null) next.livePrice = next.fillPrice;
    if (acct) next.acct = acct;
    if (form.acctId) next.acctId = String(form.acctId);
    if (form.occSymbol) next.occSymbol = form.occSymbol;

    try { await setDoc(posRef(id), next, { merge: true }); }
    catch (e) { console.error("saveOptionPosition:", e); return { ok: false, error: e?.message }; }
    return { ok: true, id };
  }, [uid, positions]);

  const updateLive = useCallback(async (id, patch) => {
    if (!uid) return;
    await setDoc(posRef(id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  }, [uid]);

  // Close an option position. how: 'sold' (closing trade at exitPrice) | 'expired'
  // (worthless) | 'exercised' (long exercised / short assigned).
  const closePosition = useCallback(async (id, how, { exitPrice = 0, closedOnMs = null } = {}) => {
    if (!uid) return;
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    const rec = {
      sym: p.sym, type: p.type, direction: p.direction, strike: p.strike, expiry: p.expiry,
      contracts: p.contracts || 1, multiplier: p.multiplier || 100, underlyingType: p.underlyingType || "equity",
      fillPrice: p.fillPrice ?? null, exitPrice: how === "expired" ? 0 : (Number(exitPrice) || 0),
      how, openedAtMs: p.openedAtMs ?? null, fillUnderlying: p.fillUnderlying ?? null, exitUnderlying: p.liveUnderlying ?? null,
      closedOnMs: closedOnMs || Date.now(), closedOn: new Date(closedOnMs || Date.now()).toISOString().slice(0, 10),
      acct: p.acct ?? null, acctId: p.acctId ?? null, occSymbol: p.occSymbol ?? null, closedAt: serverTimestamp(),
    };
    await setDoc(closedRef(`${id}-${Date.now()}`), rec);
    await deleteDoc(posRef(id));
  }, [uid, positions]);

  const deletePosition = useCallback(async (id) => { if (uid) await deleteDoc(posRef(id)); }, [uid]);
  const addClosedRecord = useCallback(async (rec, id) => {
    if (!uid) return { ok: false };
    const docId = id || `oc-${Date.now().toString(36)}`;
    await setDoc(closedRef(docId), { ...rec, closedAt: rec.closedAt || serverTimestamp() }, { merge: true });
    return { ok: true, id: docId };
  }, [uid]);
  const updateClosed = useCallback(async (id, patch) => { if (uid) await setDoc(closedRef(id), { ...patch, updatedAt: serverTimestamp() }, { merge: true }); }, [uid]);
  const deleteClosed = useCallback(async (id) => { if (uid) await deleteDoc(closedRef(id)); }, [uid]);

  return {
    positions, closed, loading: posLoading || closedLoading,
    savePosition, updateLive, closePosition, deletePosition, addClosedRecord, updateClosed, deleteClosed,
  };
}
