// ─── src/lib/sheetSync.js ────────────────────────────────────────────────────
// Client side of the Google Sheet ledger sync. Maps app events (open a call,
// close a call, buy a lot, live marks) to ledger rows and calls the Cloud
// Functions. Ported from handover/sheets-sync/src/lib/sheetSync.js.
//
// Functions are resolved via getApp() at call time so Vite's chunk order can't
// evaluate Functions before initializeApp() (matches src/services/schwabApi.js).

import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const call = (name, data) => httpsCallable(getFunctions(getApp()), name)(data).then((r) => r.data);

// Local time as 'YYYY-MM-DD HH:MM' / 'YYYY-MM-DD' so the sheet shows your clock.
const localStamp = () => new Date().toLocaleString("sv-SE").slice(0, 16);
const today = () => new Date().toLocaleDateString("sv-SE");

export const getServiceAccount = () => call("sheetServiceAccount").then((d) => d.serviceAccount);
export const connectSheet = (sheetId) => call("connectSheet", { sheetId, clientTime: localStamp() });
export const syncToSheet = ({ transactions = [], positions = [] }) =>
  call("syncSheet", { transactions, positions, clientTime: localStamp() });

// Same id the app + sheet use: pfe-28-2026-10-16
export const sheetPositionId = (p) => `${p.sym}-${p.strike}-${p.expiry}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const base = (p, extra) => ({ symbol: p.sym, positionId: p.id ?? sheetPositionId(p), lotId: p.lotId, date: today(), ...extra });

// Shares bought on their own (no call yet): a Lot ID and no position.
export function lotTransactions(lot) {
  return [{ id: `${lot.id}:buy`, action: "Buy shares", symbol: lot.sym, positionId: "", lotId: lot.id, qty: lot.shares, price: lot.cost, date: lot.bought ?? today() }];
}

// New covered call. includeShares:false when the call covers a lot you already hold.
export function openTransactions(p, { includeShares = true, date } = {}) {
  const pid = p.id ?? sheetPositionId(p);
  const rows = [];
  if (includeShares) rows.push(base(p, { id: `${pid}:open-shares`, action: "Buy shares", qty: p.contracts * 100, price: p.fillStock, date: date ?? today() }));
  rows.push(base(p, { id: `${pid}:open-call`, action: "Sell call", qty: -p.contracts, strike: p.strike, expiry: p.expiry, price: p.fillCall, date: date ?? today() }));
  return rows;
}

// how: 'bought' | 'expired' | 'called'
// delivered (called only): [{ lotId, shares }] in the app's chosen order.
export function closeTransactions(p, how, buybackPrice = 0, delivered = []) {
  const pid = p.id ?? sheetPositionId(p);
  const opt = { strike: p.strike, expiry: p.expiry, qty: p.contracts };
  if (how === "bought") return [base(p, { id: `${pid}:close`, action: "Buy to close", price: buybackPrice, ...opt })];
  if (how === "expired") return [base(p, { id: `${pid}:close`, action: "Expired", price: 0, ...opt })];
  const lots = delivered.length ? delivered : [{ lotId: p.lotId, shares: p.contracts * 100 }];
  return [
    base(p, { id: `${pid}:close`, action: "Assigned", price: 0, ...opt }),
    ...lots.map((d) => base(p, { id: `${pid}:assign-${d.lotId}`, action: "Sell shares", lotId: d.lotId, qty: -d.shares, price: p.strike })),
  ];
}

// Live marks for the Positions tab. light = stoplight key 'g'|'y'|'r' (optional).
export const positionMarks = (p, light) => ({
  positionId: p.id ?? sheetPositionId(p), liveStock: p.liveStock, liveCall: p.liveCall, gtc: p.gtc, light,
});

// Fire-and-forget so a sheet hiccup never blocks the UI.
export function syncQuietly(payload) {
  return syncToSheet(payload).catch((err) => console.warn("Sheet sync skipped:", err?.message || err));
}
