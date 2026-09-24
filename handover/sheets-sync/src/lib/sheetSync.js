// Client side of the Google Sheets sync. Maps app events to ledger rows and calls the functions.
import { getFunctions, httpsCallable } from 'firebase/functions';

const fns = getFunctions();
const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

// Local time as 'YYYY-MM-DD HH:MM' so the sheet shows your clock, not UTC.
const localStamp = () => new Date().toLocaleString('sv-SE').slice(0, 16);
const today = () => new Date().toLocaleDateString('sv-SE');

export const getServiceAccount = () => call('sheetServiceAccount').then((d) => d.serviceAccount);
export const connectSheet = (sheetId) => call('connectSheet', { sheetId, clientTime: localStamp() });
export const syncToSheet = ({ transactions = [], positions = [] }) =>
  call('syncSheet', { transactions, positions, clientTime: localStamp() });

// Same ID format the app already uses: pfe-28-2026-10-16
export const positionId = (p) => `${p.sym}-${p.strike}-${p.expiry}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const base = (p, extra) => ({ symbol: p.sym, positionId: p.id ?? positionId(p), lotId: p.lotId, date: today(), ...extra });

// Shares bought on their own (no call yet). They get a Lot ID and no position.
export function lotTransactions(lot) {
  return [{ id: `${lot.id}:buy`, action: 'Buy shares', symbol: lot.sym, positionId: '', lotId: lot.id, qty: lot.shares, price: lot.cost, date: lot.bought ?? today() }];
}

// New covered call. Pass includeShares: false when the call covers a lot you already hold (p.lotId).
export function openTransactions(p, { includeShares = true, date } = {}) {
  const pid = p.id ?? positionId(p);
  const rows = [];
  if (includeShares) {
    rows.push(base(p, { id: `${pid}:open-shares`, action: 'Buy shares', qty: p.contracts * 100, price: p.fillStock, date: date ?? today() }));
  }
  rows.push(base(p, { id: `${pid}:open-call`, action: 'Sell call', qty: -p.contracts, strike: p.strike, expiry: p.expiry, price: p.fillCall, date: date ?? today() }));
  return rows;
}

// how: 'bought' | 'expired' | 'called'
// delivered (called only): [{ lotId, shares }] in the order the app chose, highest cost at or under the strike first.
export function closeTransactions(p, how, buybackPrice = 0, delivered = []) {
  const pid = p.id ?? positionId(p);
  const opt = { strike: p.strike, expiry: p.expiry, qty: p.contracts };
  if (how === 'bought') return [base(p, { id: `${pid}:close`, action: 'Buy to close', price: buybackPrice, ...opt })];
  if (how === 'expired') return [base(p, { id: `${pid}:close`, action: 'Expired', price: 0, ...opt })];
  const lots = delivered.length ? delivered : [{ lotId: p.lotId, shares: p.contracts * 100 }];
  return [
    base(p, { id: `${pid}:close`, action: 'Assigned', price: 0, ...opt }),
    ...lots.map((d) => base(p, { id: `${pid}:assign-${d.lotId}`, action: 'Sell shares', lotId: d.lotId, qty: -d.shares, price: p.strike })),
  ];
}

// Live marks for the Positions tab. light is the row's stoplight key: 'g' | 'y' | 'r'.
export const positionMarks = (p, light) => ({
  positionId: p.id ?? positionId(p), liveStock: p.liveStock, liveCall: p.liveCall, gtc: p.gtc, light,
});

// Fire-and-forget wrapper so a sheet hiccup never blocks the UI.
export function syncQuietly(payload) {
  return syncToSheet(payload).catch((err) => console.warn('Sheet sync failed', err));
}
