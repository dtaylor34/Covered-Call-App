// ─── src/hooks/useSavedQuotes.js ─────────────────────────────────────────────
// Staged covered-call "quotes" — listings you've built but NOT sent to a broker.
// Stored per-user at users/{uid}/savedQuotes. Separate from Working positions
// (which are real/filled). You can copy a TOS order from one, or promote it to
// Working once you've actually placed it.

import { useState, useEffect, useCallback } from "react";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export function useSavedQuotes() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setQuotes([]); setLoading(false); return; }
    const ref = collection(getFirestore(), "users", uid, "savedQuotes");
    return onSnapshot(ref, (snap) => {
      setQuotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)));
      setLoading(false);
    }, (err) => { console.error("useSavedQuotes:", err); setLoading(false); });
  }, [uid]);

  const addQuote = useCallback(async (q) => {
    if (!uid) return { ok: false, error: "Sign in first." };
    const sym = String(q.sym || "").trim().toUpperCase();
    const strike = Number(q.strike) || 0;
    const expiry = q.expiry;
    const missing = [];
    if (!sym) missing.push("symbol");
    if (!(strike > 0)) missing.push("strike");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ""))) missing.push("expiration");
    if (!(Number(q.premium) > 0)) missing.push("premium");
    if (missing.length) return { ok: false, missing };
    const id = `${sym}-${strike}-${expiry}-${Date.now().toString(36)}`;
    try {
      await setDoc(doc(getFirestore(), "users", uid, "savedQuotes", id), {
        sym, strike, expiry,
        contracts: Math.max(1, Math.round(Number(q.contracts) || 1)),
        premium: Number(q.premium) || 0,
        stockPrice: Number(q.stockPrice) || 0,
        gtc: Number(q.gtc) || 0,
        iv: Number(q.iv) || 0,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: e?.message || "Could not save the quote." };
    }
  }, [uid]);

  const removeQuote = useCallback(async (id) => {
    if (!uid) return { ok: false };
    try { await deleteDoc(doc(getFirestore(), "users", uid, "savedQuotes", id)); return { ok: true }; }
    catch (e) { return { ok: false, error: e?.message }; }
  }, [uid]);

  return { quotes, loading, addQuote, removeQuote };
}
