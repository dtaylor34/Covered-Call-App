// ─── src/hooks/useBrokerConnection.js ────────────────────────────────────────
// Firestore-backed hook for managing broker API connections and accounts.
// Branch: feature/api-integration
//
// Collections (this hook only ever touches NON-SENSITIVE docs):
//   users/{uid}/brokerConnections/{brokerId}  — status only (read-only here)
//   users/{uid}/brokerAccounts/{accountId}    — linked account metadata
//
// SECURITY: credentials and tokens live encrypted in users/{uid}/private and
// are handled exclusively by Cloud Functions. The browser never reads or writes
// them. See docs/BROKER_CONNECTIONS.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { schwabDisconnect } from "../services/schwabApi";

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

  // ── Disconnect ──────────────────────────────────────────────────────────────
  // Credentials are wiped server-side (they live in the sealed /private doc the
  // client cannot touch). The Cloud Function deletes the encrypted secret, the
  // status doc, and all linked accounts for this broker.
  const deleteConnection = useCallback(async (broker) => {
    if (!currentUser?.uid) return;
    if (broker === "schwab") {
      await schwabDisconnect({});
    }
  }, [currentUser?.uid]);

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
    deleteConnection,
    setDefaultAccount,
    setActiveAccountId,
  };
}
