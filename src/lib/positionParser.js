// ─── src/lib/positionParser.js ───────────────────────────────────────────────
// Parses pasted thinkorswim fill notifications / order rows into position
// fields. Ported from the prototype's parsePaste/normDate/num
// (handover/reference/Portfolio.dc.html). Pure and unit-tested.
//
// Understood inputs (any mix, one per line or ;-separated):
//   • Quick CSV note:  PFE, 1, 27.80, 0.55, 28, 2026-10-16, 0.10
//   • Option fill:     SOLD -1 PFE 100 (Weeklys) 16 OCT 26 28 CALL @ .55
//   • Buy-back order:  BUY +1 PFE 100 16 OCT 26 28 CALL @ .10 LMT
//   • Share purchase:  BOT +100 PFE @ 27.80
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/** Parse a loose numeric string ("$1,234.50" → 1234.5); null if not a number. */
export function num(s) {
  const v = parseFloat(String(s ?? "").replace(/[$,\s]/g, ""));
  return isNaN(v) ? null : v;
}

/** Normalize a date to YYYY-MM-DD from YYYY-M-D or M/D/YY(YY); passthrough otherwise. */
export function normDate(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
  return s;
}

/**
 * Parse pasted text into partial position fields.
 * @returns {{ out: object, found: string[] }} out = { sym, contracts, fillStock,
 *          fillCall, strike, expiry, gtc } (strings, as pasted); found = the kinds
 *          of rows recognized, de-duplicated.
 */
export function parsePaste(text, now = new Date()) {
  const out = {}, found = [];
  const optRe = /([A-Z][A-Z.]{0,5})\s+(?:100\s+)?(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2})\s+(\d+(?:\.\d+)?)\s+CALL/;
  const lines = String(text || "").toUpperCase().replace(/\(WEEKLYS?\)/g, " ").split(/\n|;/);

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;

    // Quick CSV note.
    const csv = line.split(",").map((s) => s.trim());
    if (csv.length >= 6 && /^[A-Z.]+$/.test(csv[0]) && num(csv[1]) !== null) {
      Object.assign(out, { sym: csv[0], contracts: csv[1], fillStock: csv[2], fillCall: csv[3], strike: csv[4], expiry: normDate(csv[5]) });
      if (csv[6]) out.gtc = csv[6];
      found.push("quick note");
      continue;
    }

    const pm = line.match(/@\s*\$?(\d*\.?\d+)/) || line.match(/(\d*\.\d+)\s+LMT/);
    const price = pm ? pm[1] : null;

    // Option fill or working order.
    const om = line.match(optRe);
    if (om) {
      out.sym = om[1];
      out.strike = om[5];
      out.expiry = "20" + om[4] + "-" + String(MONTHS[om[3]]).padStart(2, "0") + "-" + om[2].padStart(2, "0");
      const qm = line.match(/([+-])\s?(\d+)\s+(?:AUTO\s+|TO\s+(?:OPEN|CLOSE)\s+)?[A-Z]/);
      if (qm) out.contracts = qm[2];
      const isSell = /\b(SOLD|SELL)\b/.test(line) || (qm && qm[1] === "-");
      const isBuy = /\b(BOT|BUY|BOUGHT)\b/.test(line) || (qm && qm[1] === "+");
      if (isSell && price) { out.fillCall = price; found.push("call sale"); }
      else if (isBuy && price) { out.gtc = price; found.push("buy-back order"); }
      else found.push("contract");
      continue;
    }

    // Share purchase.
    const sm = line.match(/\b(BOT|BUY|BOUGHT)\b\s*\+?(\d+)\s+([A-Z][A-Z.]{0,5})\b[^@]*@\s*\$?(\d*\.?\d+)/);
    if (sm) {
      out.sym = out.sym || sm[3];
      out.fillStock = sm[4];
      if (!out.contracts) out.contracts = String(Math.max(1, Math.round(parseInt(sm[2], 10) / 100)));
      found.push("share purchase");
    }
  }

  // ── Natural-language fallback ──
  // Fills anything still missing from a free-form note, e.g.
  //   "100 shares of PFE, sold 1 call at $0.55, hits $28 by Oct 16, breakeven $27.25"
  const U = String(text || "").toUpperCase();
  const g = (re) => { const m = U.match(re); return m ? m[1] : null; };
  let noteHit = false;
  if (!out.sym) {
    const s = g(/\bSHARES\s+OF\s+([A-Z]{1,5})\b/) || g(/\b([A-Z]{1,5})\s+(?:HITS|STOCK)\b/) || g(/\bON\s+([A-Z]{1,5})\b/);
    if (s) { out.sym = s; noteHit = true; }
  }
  if (!out.fillCall) {
    const v = g(/\bAT\s+\$?(\d*\.\d+)/) || g(/CALL[^$\d]*\$(\d*\.\d+)/) || g(/PREMIUM[:\s]+\$?(\d*\.\d+)/);
    if (v) { out.fillCall = v; noteHit = true; }
  }
  if (!out.strike) {
    const v = g(/\bHITS\s+\$?(\d+(?:\.\d+)?)/) || g(/STRIKE[:\s]+\$?(\d+(?:\.\d+)?)/) || g(/\$(\d+(?:\.\d+)?)\s+CALL\b/);
    if (v) { out.strike = v; noteHit = true; }
  }
  if (!out.contracts) {
    const v = g(/(\d+)\s+CALLS?\b/) || g(/SOLD\s+(\d+)\b/);
    if (v) { out.contracts = v; noteHit = true; }
    else { const sh = g(/(\d+)\s+SHARES?\b/); if (sh) { out.contracts = String(Math.max(1, Math.round(parseInt(sh, 10) / 100))); noteHit = true; } }
  }
  if (!out.expiry) {
    const md = U.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?/);
    if (md) {
      const mo = MONTHS[md[1]], day = parseInt(md[2], 10);
      let yr = md[3] ? (md[3].length === 2 ? 2000 + +md[3] : +md[3]) : null;
      if (yr == null) { yr = now.getFullYear(); if (new Date(yr, mo - 1, day) < now) yr += 1; }
      out.expiry = `${yr}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      noteHit = true;
    }
  }
  if (!out.fillStock) {
    const be = g(/BREAKEVEN[:\s]+\$?(\d+(?:\.\d+)?)/);
    if (be && out.fillCall != null) { out.fillStock = (parseFloat(be) + parseFloat(out.fillCall)).toFixed(2); noteHit = true; }
  }
  if (noteHit) found.push("note");

  return { out, found: found.filter((v, i) => found.indexOf(v) === i) };
}

/** Canonical position id: `sym-strike-expiry`, lowercased, non-alphanumerics → "-". */
export function positionId(sym, strike, expiry) {
  return `${sym}-${strike}-${expiry}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
