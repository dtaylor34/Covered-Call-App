// ─── src/hooks/useBrokerConnection.js ────────────────────────────────────────
// Firestore-backed hook for managing broker API connections and accounts.
// Branch: feature/api-integration
//
// Collections:
//   users/{uid}/brokerConnections/{brokerId}  — credentials + token state
//   users/{uid}/brokerAccounts/{accountId}    — linked account metadata
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export function useBrokerConnection() {
  const { currentUser } = useAuth();
  const [connections, setConnections]       = useState([]);
  const [accounts, setAccounts]             = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [loading, setLoading]               = useState(true);

  // ── Subscribe to brokerConnections ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) { setLoading(false); return; }
    const db  = getFirestore();
    const ref = collection(db, "users", currentUser.uid, "brokerConnections");

    const unsub = onSnapshot(ref, (snap) => {
      setConnections(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("useBrokerConnection — connections snapshot error:", err);
      setLoading(false);
    });

    return unsub;
  }, [currentUser?.uid]);

  // ── Subscribe to brokerAccounts ─────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;
    const db  = getFirestore();
    const ref = collection(db, "users", currentUser.uid, "brokerAccounts");

    const unsub = onSnapshot(ref, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAccounts(docs);
      // Restore default account
      const def = docs.find((a) => a.isDefault);
      if (def) setActiveAccountId(def.id);
    }, (err) => {
      console.error("useBrokerConnection — accounts snapshot error:", err);
    });

    return unsub;
  }, [currentUser?.uid]);

  // ── Save connection credentials ─────────────────────────────────────────────
  // Called before initiating OAuth — stores appKey + appSecret in Firestore.
  // The Cloud Function reads these during token exchange.
  const saveConnection = useCallback(async (broker, appKey, appSecret) => {
    if (!currentUser?.uid) return;
    const db = getFirestore();
    await setDoc(
      doc(db, "users", currentUser.uid, "brokerConnections", broker),
      {
        broker,
        appKey,
        appSecret,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [currentUser?.uid]);

  // ── Delete a connection ─────────────────────────────────────────────────────
  const deleteConnection = useCallback(async (broker) => {
    if (!currentUser?.uid) return;
    const db = getFirestore();
    await deleteDoc(doc(db, "users", currentUser.uid, "brokerConnections", broker));
    // Also remove accounts for this broker
    const brokerAccounts = accounts.filter((a) => a.broker === broker);
    for (const account of brokerAccounts) {
      await deleteDoc(doc(db, "users", currentUser.uid, "brokerAccounts", account.id));
    }
  }, [currentUser?.uid, accounts]);

  // ── Set default account ─────────────────────────────────────────────────────
  const setDefaultAccount = useCallback(async (accountId) => {
    if (!currentUser?.uid) return;
    const db = getFirestore();
    // Update all accounts — only one can be default
    for (const account of accounts) {
      await setDoc(
        doc(db, "users", currentUser.uid, "brokerAccounts", account.id),
        { isDefault: account.id === accountId, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
    setActiveAccountId(accountId);
  }, [currentUser?.uid, accounts]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeAccount    = accounts.find((a) => a.id === activeAccountId)
                        || accounts.find((a) => a.isDefault)
                        || accounts[0]
                        || null;

  const activeConnection = connections.find((c) => c.status === "connected") || null;

  return {
    connections,
    accounts,
    activeConnection,
    activeAccount,
    loading,
    saveConnection,
    deleteConnection,
    setDefaultAccount,
    setActiveAccountId,
  };
}
