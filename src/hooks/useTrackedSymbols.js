// ─── src/hooks/useTrackedSymbols.js ──────────────────────────────────────────
// The global registry of symbols we collect daily history for. Any signed-in
// user can read; owner/admin can add/remove (Firestore rules enforce this).
// Adding a symbol starts its collection from that day forward.

import { useState, useEffect, useCallback } from "react";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export function useTrackedSymbols() {
  const { currentUser } = useAuth();
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(getFirestore(), "trackedSymbols");
    return onSnapshot(ref, (snap) => {
      setSymbols(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
      setLoading(false);
    }, (err) => { console.error("useTrackedSymbols:", err); setLoading(false); });
  }, []);

  const addSymbol = useCallback(async (raw) => {
    const sym = String(raw || "").trim().toUpperCase();
    if (!/^[A-Z.]{1,6}$/.test(sym)) return { ok: false, error: "Enter a valid ticker (e.g. AAPL)." };
    try {
      await setDoc(doc(getFirestore(), "trackedSymbols", sym), {
        symbol: sym, type: "equity", startedAt: serverTimestamp(), addedBy: currentUser?.uid || null, points: 0,
      }, { merge: true });
      return { ok: true, sym };
    } catch (e) {
      return { ok: false, error: e?.code === "permission-denied" ? "Only an owner/admin can add symbols." : (e?.message || "Couldn't add.") };
    }
  }, [currentUser]);

  const removeSymbol = useCallback(async (sym) => {
    try { await deleteDoc(doc(getFirestore(), "trackedSymbols", sym)); return { ok: true }; }
    catch (e) { return { ok: false, error: e?.message }; }
  }, []);

  // Add many symbols at once (owner/admin). `list` items may be a string ticker
  // or { symbol, type, sector }. Already-tracked symbols are skipped (merge keeps
  // their original startedAt). Returns { ok, added, skipped }.
  const addMany = useCallback(async (list) => {
    const db = getFirestore();
    const existing = new Set(symbols.map((s) => s.symbol));
    const clean = [];
    const seen = new Set();
    for (const item of (list || [])) {
      const sym = String(item?.symbol ?? item ?? "").trim().toUpperCase();
      if (!/^[A-Z.]{1,6}$/.test(sym) || seen.has(sym)) continue;
      seen.add(sym);
      clean.push({ sym, type: item?.type || "equity", sector: item?.sector || null });
    }
    const fresh = clean.filter((c) => !existing.has(c.sym));
    if (fresh.length === 0) return { ok: true, added: 0, skipped: clean.length };
    try {
      // Firestore caps a batch at 500 writes — chunk to be safe.
      for (let i = 0; i < fresh.length; i += 450) {
        const batch = writeBatch(db);
        for (const c of fresh.slice(i, i + 450)) {
          batch.set(doc(db, "trackedSymbols", c.sym), {
            symbol: c.sym, type: c.type, sector: c.sector,
            startedAt: serverTimestamp(), addedBy: currentUser?.uid || null, points: 0,
          }, { merge: true });
        }
        await batch.commit();
      }
      return { ok: true, added: fresh.length, skipped: clean.length - fresh.length };
    } catch (e) {
      return { ok: false, error: e?.code === "permission-denied" ? "Only an owner/admin can add symbols." : (e?.message || "Couldn't add.") };
    }
  }, [symbols, currentUser]);

  return { symbols, loading, addSymbol, removeSymbol, addMany };
}
