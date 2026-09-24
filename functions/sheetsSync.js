// Google Sheets sync for Covered Call Manager.
// Setup:
//   1. In Google Cloud console for this Firebase project, enable "Google Sheets API".
//   2. cd functions && npm i googleapis
//   3. In functions/index.js (after admin.initializeApp()):
//        Object.assign(exports, require('./sheetsSync'));
// The user shares their sheet with the functions' service account (shown in app Settings)
// and pastes the Sheet ID. Nothing else to configure per user.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

const TABS = { txn: 'Transactions', pos: 'Positions', lots: 'Lots', setup: 'Setup' };
const ACTIONS = ['Buy shares', 'Sell shares', 'Sell call', 'Buy to close', 'Expired', 'Assigned'];
const LIGHTS = { g: 'Green', y: 'Yellow', r: 'Red' };

function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth.uid;
}

// Accepts a bare ID or a full Sheets URL.
function parseSheetId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : s;
}

async function serviceAccountEmail() {
  const creds = await auth.getCredentials();
  return creds.client_email || null;
}

async function readColumn(spreadsheetId, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values || []).map((r) => (r[0] ?? '').toString());
}

function lastFilled(col) {
  let i = col.length;
  while (i > 0 && col[i - 1].trim() === '') i--;
  return i;
}

// Shown in Settings so the user knows who to share the sheet with.
exports.sheetServiceAccount = onCall(async (req) => {
  requireAuth(req);
  return { serviceAccount: await serviceAccountEmail() };
});

// Verifies read + write access and the template's tabs, then saves the ID for this user.
exports.connectSheet = onCall(async (req) => {
  const uid = requireAuth(req);
  const spreadsheetId = parseSheetId(req.data?.sheetId);
  const email = await serviceAccountEmail();
  if (!spreadsheetId) throw new HttpsError('invalid-argument', 'Paste a Sheet ID or URL.');

  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'properties.title,sheets.properties.title' });
  } catch {
    throw new HttpsError('permission-denied', `Can't open that sheet. Share it with ${email} as an Editor, then try again.`, { serviceAccount: email });
  }
  const tabs = meta.data.sheets.map((s) => s.properties.title);
  const missing = Object.values(TABS).filter((t) => !tabs.includes(t));
  if (missing.length) {
    throw new HttpsError('failed-precondition', `This sheet is missing: ${missing.join(', ')}. Import the Covered Calls ledger template first.`);
  }

  const stamp = req.data?.clientTime || new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${TABS.setup}!B3`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[stamp]] },
    });
  } catch {
    throw new HttpsError('permission-denied', `The app can read but not edit this sheet. Give ${email} Editor access.`, { serviceAccount: email });
  }

  const title = meta.data.properties.title;
  await getFirestore().doc(`users/${uid}`).set({ sheetId: spreadsheetId, sheetTitle: title, sheetConnectedAt: new Date() }, { merge: true });
  return { sheetId: spreadsheetId, title, serviceAccount: email };
});

// Payload: { transactions?: Txn[], positions?: Marks[], clientTime?: 'YYYY-MM-DD HH:MM' }
//   Txn:   { id, date: 'YYYY-MM-DD', action, symbol, positionId, lotId, qty, strike?, expiry?, price, fees?, source?, note? }
//   Marks: { positionId, liveStock?, liveCall?, gtc?, light?: 'g'|'y'|'r' }
// Transactions with an id already in the ledger are skipped, so retries never duplicate rows.
exports.syncSheet = onCall(async (req) => {
  const uid = requireAuth(req);
  const snap = await getFirestore().doc(`users/${uid}`).get();
  const spreadsheetId = snap.get('sheetId');
  if (!spreadsheetId) throw new HttpsError('failed-precondition', 'No Google Sheet connected.');

  const txns = Array.isArray(req.data?.transactions) ? req.data.transactions : [];
  const marks = Array.isArray(req.data?.positions) ? req.data.positions : [];
  const stamp = req.data?.clientTime || new Date().toISOString().slice(0, 16).replace('T', ' ');
  const data = [];
  const newLots = new Set();
  let appended = 0;

  if (txns.length) {
    const [dates, ids] = await Promise.all([
      readColumn(spreadsheetId, `${TABS.txn}!A2:A`),
      readColumn(spreadsheetId, `${TABS.txn}!M2:M`),
    ]);
    const seen = new Set(ids.filter(Boolean));
    let row = 2 + lastFilled(dates);
    for (const t of txns) {
      if (!ACTIONS.includes(t.action)) throw new HttpsError('invalid-argument', `Unknown action: ${t.action}`);
      if (t.id && seen.has(String(t.id))) continue;
      // Column J (cash) and N (Schwab check) are formulas in the template, so they are left alone.
      data.push({ range: `${TABS.txn}!A${row}:I${row}`, values: [[t.date, t.action, t.symbol, t.positionId, t.qty, t.strike ?? null, t.expiry ?? null, t.price, t.fees ?? 0]] });
      data.push({ range: `${TABS.txn}!K${row}:M${row}`, values: [[t.source ?? 'App', t.note ?? null, t.id ?? null]] });
      data.push({ range: `${TABS.txn}!O${row}`, values: [[t.lotId ?? null]] });
      if (t.action === 'Buy shares' && t.lotId) newLots.add(t.lotId);
      if (t.id) seen.add(String(t.id));
      row++;
      appended++;
    }
  }

  // Register each new lot on the Lots tab; its row is all formulas keyed on the Lot ID.
  if (newLots.size) {
    const lotIds = await readColumn(spreadsheetId, `${TABS.lots}!A2:A`);
    let next = 2 + lastFilled(lotIds);
    for (const id of newLots) {
      if (lotIds.includes(id)) continue;
      data.push({ range: `${TABS.lots}!A${next}`, values: [[id]] });
      lotIds[next - 2] = id;
      next++;
    }
  }

  if (marks.length) {
    const posIds = await readColumn(spreadsheetId, `${TABS.pos}!A2:A`);
    let next = 2 + lastFilled(posIds);
    for (const m of marks) {
      let row = posIds.indexOf(m.positionId) + 2;
      if (row === 1) {
        row = next++;
        posIds[row - 2] = m.positionId;
        data.push({ range: `${TABS.pos}!A${row}`, values: [[m.positionId]] });
      }
      // null leaves a cell unchanged, so partial updates are safe.
      data.push({ range: `${TABS.pos}!K${row}:O${row}`, values: [[m.liveStock ?? null, m.liveCall ?? null, m.gtc ?? null, LIGHTS[m.light] ?? null, stamp]] });
    }
  }

  data.push({ range: `${TABS.setup}!B3`, values: [[stamp]] });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'USER_ENTERED', data } });
  return { appended, positionsUpdated: marks.length };
});
