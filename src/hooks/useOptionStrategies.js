// ─── src/hooks/useOptionStrategies.js ────────────────────────────────────────
// Firestore store for custom multi-leg option strategies (the Strategies tab).
//   users/{uid}/optionStrategies/{id}
// A strategy is fully user-editable: a name, symbol, and a list of legs
// ({ dir: buy|sell, type: CALL|PUT, strike, premium, contracts }), plus the
// assumptions used to estimate premiums (underlying price, IV, DTE, multiplier).

import { useState, useEffect, useCallback } from "react";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export function useOptionStrategies() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || null;
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setStrategies([]); setLoading(false); return; }
    const ref = collection(getFirestore(), "users", uid, "optionStrategies");
    return onSnapshot(ref, (snap) => { setStrategies(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error("useOptionStrategies snapshot:", err); setLoading(false); });
  }, [uid]);

  const sref = (id) => doc(getFirestore(), "users", uid, "optionStrategies", id);

  const saveStrategy = useCallback(async (s) => {
    if (!uid) return { ok: false };
    const id = s.id || `strat-${Date.now().toString(36)}`;
    const rec = {
      name: String(s.name || "Untitled").slice(0, 60),
      sym: String(s.sym || "").trim().toUpperCase(),
      underlying: Number(s.underlying) || 0,
      iv: Number(s.iv) || 25,
      dte: Math.max(1, Math.round(Number(s.dte) || 30)),
      mult: Number(s.mult) || 100,
      legs: (s.legs || []).map((l) => ({
        dir: l.dir === "sell" ? "sell" : "buy",
        type: String(l.type || "CALL").toUpperCase() === "PUT" ? "PUT" : "CALL",
        strike: Number(l.strike) || 0,
        premium: Number(l.premium) || 0,
        contracts: Math.max(1, Math.round(Number(l.contracts) || 1)),
      })),
      updatedAt: serverTimestamp(),
    };
    await setDoc(sref(id), rec, { merge: true });
    return { ok: true, id };
  }, [uid]);

  const deleteStrategy = useCallback(async (id) => { if (uid) await deleteDoc(sref(id)); }, [uid]);

  return { strategies, loading, saveStrategy, deleteStrategy };
}
