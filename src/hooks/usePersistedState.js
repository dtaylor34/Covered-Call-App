// ─── src/hooks/usePersistedState.js ──────────────────────────────────────────
// Drop-in replacement for useState that persists to localStorage.
// On mount, instantly restores the last saved value before any network call.
// Prefix all keys with "cc:" to namespace and avoid collisions.
//
// Usage:
//   const [tab, setTab] = usePersistedState("cc:tab", "dashboard");
//   const [symbol, setSymbol] = usePersistedState("cc:symbol", "");
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";

export function usePersistedState(key, defaultValue) {
  // Initialize from localStorage if available
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // Corrupted or non-JSON value — fall back to default
      console.warn(`usePersistedState: failed to parse "${key}"`, e);
    }
    return defaultValue;
  });

  // Sync to localStorage whenever value changes
  useEffect(() => {
    try {
      if (value === undefined || value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
      console.warn(`usePersistedState: failed to save "${key}"`, e);
    }
  }, [key, value]);

  return [value, setValue];
}

// ── Bulk clear all cc: keys (useful for logout) ──
export function clearPersistedState() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("cc:")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
