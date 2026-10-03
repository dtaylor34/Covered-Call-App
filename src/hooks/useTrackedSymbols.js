// ─── src/hooks/useTrackedSymbols.js ──────────────────────────────────────────
// The global registry of symbols we collect daily history for. Any signed-in
// user can read; owner/admin can add/remove (Firestore rules enforce this).
// Adding a symbol starts its collection from that day forward.

import { useState, useEffect, useCallback } from "react";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
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

  return { symbols, loading, addSymbol, removeSymbol };
}
