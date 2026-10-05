// ─── src/lib/tos.js ───────────────────────────────────────────────────────────
// thinkorswim order-string helpers. The string matches the format our own
// positionParser understands (e.g. "SELL -1 PFE 100 16 OCT 26 28 CALL @ .55 LMT"),
// so it round-trips and pastes into TOS to stage a covered-call write.

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// "2026-10-23" → "23 OCT 26"
export function tosExpiry(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  return `${d} ${MON[m - 1]} ${String(y).slice(-2)}`;
}

// Sell-to-open the calls against your shares (the covered-call write).
export function tosCoveredCallOrder(q) {
  const n = Math.max(1, Math.round(Number(q.contracts) || 1));
  const px = (Number(q.premium ?? q.fillCall) || 0).toFixed(2);
  return `SELL -${n} ${String(q.sym || "").toUpperCase()} 100 ${tosExpiry(q.expiry)} ${q.strike} CALL @${px} LMT`;
}
