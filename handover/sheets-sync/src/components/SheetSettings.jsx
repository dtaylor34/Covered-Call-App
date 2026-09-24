import { useEffect, useState } from 'react';
import { connectSheet, getServiceAccount } from '../lib/sheetSync';

// Paste a Sheet ID or URL, press Connect. The function checks access and saves it to users/{uid}.
export default function SheetSettings({ initialSheetId = '', initialTitle = '' }) {
  const [value, setValue] = useState(initialSheetId);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(initialTitle ? { ok: true, text: `Connected to "${initialTitle}"` } : null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getServiceAccount().then(setEmail).catch(() => {}); }, []);

  async function onConnect() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await connectSheet(value);
      setValue(r.sheetId);
      setStatus({ ok: true, text: `Connected to "${r.title}". Trades and price updates now sync automatically.` });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="sheet-settings">
      <h2>Google Sheet</h2>
      <p>Import the Covered Calls ledger template into Google Sheets, then share it as an Editor with:</p>
      <div className="sheet-settings__email">
        <code>{email || 'Loading…'}</code>
        <button type="button" onClick={copyEmail} disabled={!email}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <label htmlFor="sheet-id">Sheet ID or URL</label>
      <div className="sheet-settings__row">
        <input
          id="sheet-id"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit"
        />
        <button type="button" onClick={onConnect} disabled={busy || !value.trim()}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
      </div>
      {status && <p role="status" className={status.ok ? 'is-ok' : 'is-error'}>{status.text}</p>}
    </section>
  );
}
