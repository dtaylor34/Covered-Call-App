// ─── src/components/SheetSettings.jsx ────────────────────────────────────────
// Connect a Google Sheet ledger: share the template with the service account,
// paste the Sheet ID, Connect. Dark-themed to match the app. Ported + restyled
// from handover/sheets-sync/src/components/SheetSettings.jsx.

import { useEffect, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { connectSheet, getServiceAccount } from "../lib/sheetSync";

export default function SheetSettings({ initialSheetId = "", initialTitle = "" }) {
  const { T } = useTheme();
  const [value, setValue] = useState(initialSheetId);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(initialTitle ? { ok: true, text: `Connected to “${initialTitle}”` } : null);

  useEffect(() => { getServiceAccount().then(setEmail).catch(() => {}); }, []);

  async function onConnect() {
    setBusy(true); setStatus(null);
    try {
      const r = await connectSheet(value);
      setValue(r.sheetId);
      setStatus({ ok: true, text: `Connected to “${r.title}”. Trades and price updates now sync automatically.` });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally { setBusy(false); }
  }

  async function copyEmail() {
    try { await navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  const input = { flex: 1, minWidth: 0, minHeight: 42, padding: "0 12px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13 };
  const btn = (primary) => ({ padding: "0 16px", minHeight: 42, borderRadius: 8, cursor: "pointer", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, border: `1px solid ${primary ? T.accent : T.border}`, background: primary ? T.accent : T.card, color: primary ? "#0A0A0A" : T.text });

  return (
    <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "20px 22px" }} aria-label="Google Sheet ledger">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>📗</span>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Google Sheet ledger</h3>
      </div>
      <p style={{ color: T.textDim, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
        Import the Covered Calls ledger template into Google Sheets, then share it as an <strong style={{ color: T.text }}>Editor</strong> with this address:
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <code style={{ flex: 1, minWidth: 200, padding: "10px 12px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, color: T.accent, fontFamily: T.fontMono, fontSize: 12, wordBreak: "break-all" }}>
          {email || "Loading service account…"}
        </code>
        <button type="button" onClick={copyEmail} disabled={!email} style={btn(false)}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <label htmlFor="sheet-id" style={{ display: "block", color: T.textDim, fontSize: 11, fontFamily: T.fontMono, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Sheet ID or URL</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input id="sheet-id" type="text" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit" style={input} />
        <button type="button" onClick={onConnect} disabled={busy || !value.trim()} style={btn(true)}>{busy ? "Checking…" : "Connect"}</button>
      </div>
      {status && (
        <p role="status" style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: status.ok ? T.success : T.danger }}>{status.text}</p>
      )}
    </section>
  );
}
