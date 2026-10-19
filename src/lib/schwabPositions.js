// ─── src/lib/schwabPositions.js ──────────────────────────────────────────────
// Turns a Schwab Trader API account/positions response into covered-call
// candidates the app can import: a short CALL matched with the underlying
// shares, with cost basis (averagePrice) and live price (marketValue/qty).
//
// Schwab gives AVERAGE cost, not tax lots — so imported shares land as one lot
// at the average price; split them into real lots afterward if needed.

// Trade History only tracks equity/ETF covered calls — NOT futures, index, or
// futures-options (e.g. US-Treasury /ZB options), and not plain stock trades.
// An equity/ETF underlying is a plain ticker (no "=", "^", "/" — those mark
// futures/indexes). Call sites also check the leg's assetType when present.
export const isCoveredCallUnderlying = (sym) => /^[A-Z.]{1,6}$/.test(String(sym || "").toUpperCase());

// Parse a Schwab OCC option symbol, e.g. "META  261023C00820000"
//   root (1-6) · YYMMDD · C/P · strike*1000 (8 digits)
export function parseOccSymbol(sym) {
  const m = String(sym || "").toUpperCase().match(/^([A-Z.]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    underlying: m[1],
    expiry: `20${m[2]}-${m[3]}-${m[4]}`,
    putCall: m[5] === "C" ? "CALL" : "PUT",
    strike: parseInt(m[6], 10) / 1000,
  };
}

// Fallback: parse strike/expiry from a human description, e.g.
// "META PLATFORMS INC 10/23/2026 $820 Call"
function parseDescription(desc) {
  const s = String(desc || "");
  const d = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const k = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:CALL|C\b)/i) || s.match(/\$\s*(\d+(?:\.\d+)?)/);
  const expiry = d ? `${d[3].length === 2 ? "20" + d[3] : d[3]}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}` : null;
  return { expiry, strike: k ? parseFloat(k[1]) : null };
}

/**
 * @param {object} data Schwab response from schwabGetPositions (raw)
 * @returns {{ candidates: Array, unmatchedCalls: Array, equities: object }}
 *   candidate: { sym, contracts, strike, expiry, fillCall, liveCall, fillStock,
 *                liveStock, shares, covered }
 */
export function parseSchwabPositions(data) {
  const positions = data?.securitiesAccount?.positions || data?.positions || [];
  const equities = {}; // underlying -> { shares, avgCost, price }
  const calls = [];

  for (const p of positions) {
    const inst = p.instrument || {};
    const type = inst.assetType;
    if (type === "EQUITY" || type === "COLLECTIVE_INVESTMENT" || type === "ETF") {
      const shares = Number(p.longQuantity) || 0;
      if (shares > 0) {
        equities[inst.symbol] = {
          shares,
          avgCost: Number(p.averagePrice) || 0,
          price: p.marketValue && shares ? Math.abs(Number(p.marketValue)) / shares : null,
        };
      }
    } else if (type === "OPTION") {
      const occ = parseOccSymbol(inst.symbol) || {};
      const putCall = inst.putCall || occ.putCall;
      const short = Number(p.shortQuantity) || 0;
      if (putCall === "CALL" && short > 0) {
        const desc = parseDescription(inst.description);
        const contracts = Math.round(short);
        calls.push({
          underlying: inst.underlyingSymbol || occ.underlying || null,
          strike: occ.strike ?? desc.strike ?? null,
          expiry: occ.expiry ?? desc.expiry ?? null,
          contracts,
          fillCall: Number(p.averagePrice) || 0,
          liveCall: p.marketValue && contracts ? Math.abs(Number(p.marketValue)) / (contracts * 100) : null,
        });
      }
    }
  }

  return finishCandidates(calls, equities);
}

function finishCandidates(calls, equities) {
  const candidates = [], unmatchedCalls = [];
  for (const c of calls) {
    const eq = c.underlying ? equities[c.underlying] : null;
    if (eq && c.strike && c.expiry) {
      candidates.push({
        sym: c.underlying,
        contracts: c.contracts,
        strike: c.strike,
        expiry: c.expiry,
        fillCall: c.fillCall,
        liveCall: c.liveCall,
        fillStock: eq.avgCost,
        liveStock: eq.price,
        shares: eq.shares,
        covered: eq.shares >= c.contracts * 100,
      });
    } else {
      unmatchedCalls.push(c);
    }
  }
  return { candidates, unmatchedCalls, equities };
}

/**
 * Parse ALL open option positions for the Options Manager (not just covered
 * calls): long & short calls & puts, equity options and futures options. Returns
 * [{ sym, type, direction, strike, expiry, contracts, fillPrice, livePrice,
 *    multiplier, underlyingType, occSymbol, assetType, liveUnderlying }].
 */
export function parseSchwabOptionPositions(data) {
  const positions = data?.securitiesAccount?.positions || data?.positions || [];
  const underlyingPx = {}; // symbol -> price
  const out = [];
  for (const p of positions) {
    const inst = p.instrument || {};
    const at = String(inst.assetType || "").toUpperCase();
    if (at === "EQUITY" || at === "ETF" || at === "COLLECTIVE_INVESTMENT") {
      const sh = Number(p.longQuantity) || 0;
      if (sh > 0 && p.marketValue) underlyingPx[inst.symbol] = Math.abs(Number(p.marketValue)) / sh;
      continue;
    }
    const isOption = at === "OPTION" || at === "FUTURE_OPTION" || !!inst.putCall;
    if (!isOption) continue;
    const occ = parseOccSymbol(inst.symbol) || {};
    const type = String(inst.putCall || occ.putCall || "").toUpperCase();
    if (type !== "CALL" && type !== "PUT") continue;
    const long = Number(p.longQuantity) || 0, short = Number(p.shortQuantity) || 0;
    if (long <= 0 && short <= 0) continue;
    const contracts = Math.round(long > 0 ? long : short) || 1;
    const direction = long > 0 ? "long" : "short";
    const desc = parseDescription(inst.description);
    const mult = Number(inst.multiplier) || (at === "FUTURE_OPTION" ? 1000 : 100);
    const sym = (inst.underlyingSymbol || occ.underlying || "").toUpperCase() || null;
    const fillPrice = Number(p.averagePrice) || 0;
    const livePrice = p.marketValue && contracts ? Math.abs(Number(p.marketValue)) / (contracts * mult) : null;
    out.push({
      sym, type, direction,
      strike: occ.strike ?? desc.strike ?? null,
      expiry: occ.expiry ?? desc.expiry ?? null,
      contracts, fillPrice, livePrice, multiplier: mult,
      underlyingType: at === "FUTURE_OPTION" ? "future" : "equity",
      occSymbol: inst.symbol || null, assetType: at || "OPTION",
    });
  }
  for (const o of out) { if (o.sym && underlyingPx[o.sym] != null) o.liveUnderlying = underlyingPx[o.sym]; }
  return out.filter((o) => o.strike != null && o.expiry);
}

const ACTIVE_ORDER_STATUS = ["WORKING", "QUEUED", "ACCEPTED", "PENDING_ACTIVATION", "OPEN", "AWAITING_PARENT_ORDER"];

/**
 * Extract GTC buy-to-close call orders from a Schwab orders response.
 * @param {Array|object} orders response from schwabGetOrders
 * @returns {object} map of "SYM|strike|expiry" -> gtc price (buy-to-close limit)
 */
// Map "SYM|strike|expiry" → entry timestamp (ms) from FILLED SELL_TO_OPEN call
// orders — i.e. the date you sold each covered call. Note: Schwab's orders API
// only returns ~60 days, so calls opened longer ago won't be found here.
export function parseSchwabOpenDates(orders) {
  const list = Array.isArray(orders) ? orders : (orders?.orders || []);
  const byKey = {};
  for (const o of list) {
    if (String(o.status || "").toUpperCase() !== "FILLED") continue;
    const t = o.closeTime || o.enteredTime || o.orderActivityCollection?.[0]?.executionLegs?.[0]?.time;
    const ms = t ? new Date(t).getTime() : NaN;
    if (!Number.isFinite(ms)) continue;
    for (const leg of (o.orderLegCollection || [])) {
      if (String(leg.instruction || "").toUpperCase() !== "SELL_TO_OPEN") continue;
      const inst = leg.instrument || {};
      const at = String(inst.assetType || "").toUpperCase();
      if (at && at !== "OPTION") continue; // equity options only (skip FUTURE_OPTION etc.)
      const occ = parseOccSymbol(inst.symbol) || {};
      const putCall = inst.putCall || occ.putCall;
      if (putCall !== "CALL") continue;
      const sym = (inst.underlyingSymbol || occ.underlying || "").toUpperCase();
      if (!isCoveredCallUnderlying(sym)) continue; // stocks/ETFs only — no futures/treasuries
      if (sym && occ.strike != null && occ.expiry) {
        const key = `${sym}|${occ.strike}|${occ.expiry}`;
        if (byKey[key] == null || ms < byKey[key]) byKey[key] = ms; // earliest open for this contract
      }
    }
  }
  return byKey;
}

// Map "SYM|strike|expiry" → { ms, date, price } from FILLED BUY_TO_CLOSE call
// orders — i.e. covered calls you bought back (closed early / GTC filled). Used
// to auto-record closes that happened at the broker. ~60-day Schwab window.
export function parseSchwabCloses(orders) {
  const list = Array.isArray(orders) ? orders : (orders?.orders || []);
  const byKey = {};
  for (const o of list) {
    if (String(o.status || "").toUpperCase() !== "FILLED") continue;
    const t = o.closeTime || o.enteredTime || o.orderActivityCollection?.[0]?.executionLegs?.[0]?.time;
    const ms = t ? new Date(t).getTime() : null;
    for (const leg of (o.orderLegCollection || [])) {
      if (String(leg.instruction || "").toUpperCase() !== "BUY_TO_CLOSE") continue;
      const inst = leg.instrument || {};
      const at = String(inst.assetType || "").toUpperCase();
      if (at && at !== "OPTION") continue; // equity options only
      const occ = parseOccSymbol(inst.symbol) || {};
      if ((inst.putCall || occ.putCall) !== "CALL") continue;
      const sym = (inst.underlyingSymbol || occ.underlying || "").toUpperCase();
      if (!isCoveredCallUnderlying(sym)) continue; // stocks/ETFs only
      let strike = occ.strike, expiry = occ.expiry;
      if ((strike == null || !expiry) && inst.description) { const d = parseDescription(inst.description); strike = strike ?? d.strike; expiry = expiry || d.expiry; }
      if (!sym || strike == null || !expiry) continue;
      const key = `${sym}|${strike}|${expiry}`;
      const price = Number(o.price) || Number(o.orderActivityCollection?.[0]?.executionLegs?.[0]?.price) || 0;
      if (!byKey[key] || (ms && ms > byKey[key].ms)) byKey[key] = { ms, date: ms ? new Date(ms).toISOString().slice(0, 10) : null, price };
    }
  }
  return byKey;
}

// Reconstruct CLOSED covered-call trades from order history. Every FILLED
// BUY_TO_CLOSE (buy-back) on a call becomes a closed trade; if a matching FILLED
// SELL_TO_OPEN is also in the window, the opening premium + entry date are
// attached (fillCall/openMs), otherwise they're null (the open was older than
// Schwab's ~60-day window — fill the premium in later). Returns
// [{ sym, strike, expiry, contracts, fillCall, openMs, buyback, closeMs }].
// Note: expirations/assignments have no closing order, so they aren't captured.
export function parseSchwabClosedCycles(orders) {
  const list = Array.isArray(orders) ? orders : (orders?.orders || []);
  const opens = {}, closes = {};
  for (const o of list) {
    if (String(o.status || "").toUpperCase() !== "FILLED") continue;
    const t = o.closeTime || o.enteredTime || o.orderActivityCollection?.[0]?.executionLegs?.[0]?.time;
    const ms = t ? new Date(t).getTime() : null;
    const exec = Number(o.orderActivityCollection?.[0]?.executionLegs?.[0]?.price);
    const price = Number.isFinite(exec) && exec > 0 ? exec : (Number(o.price) || 0);
    for (const leg of (o.orderLegCollection || [])) {
      const instr = String(leg.instruction || "").toUpperCase();
      if (instr !== "SELL_TO_OPEN" && instr !== "BUY_TO_CLOSE") continue;
      const inst = leg.instrument || {};
      const at = String(inst.assetType || "").toUpperCase();
      if (at && at !== "OPTION") continue; // equity options only (skip futures/treasury options)
      const occ = parseOccSymbol(inst.symbol) || {};
      if ((inst.putCall || occ.putCall) !== "CALL") continue;
      const sym = (inst.underlyingSymbol || occ.underlying || "").toUpperCase();
      if (!isCoveredCallUnderlying(sym)) continue; // stocks/ETFs only — no futures/treasuries
      // Fall back to the human description when the OCC symbol doesn't parse.
      let strike = occ.strike, expiry = occ.expiry;
      if ((strike == null || !expiry) && inst.description) { const d = parseDescription(inst.description); strike = strike ?? d.strike; expiry = expiry || d.expiry; }
      if (!sym || strike == null || !expiry) continue;
      const key = `${sym}|${strike}|${expiry}`;
      const qty = Math.round(Number(leg.quantity) || 0) || 1;
      const slot = { ms, price, contracts: qty, sym, strike, expiry };
      if (instr === "SELL_TO_OPEN") {
        if (!opens[key] || (ms && ms < opens[key].ms)) opens[key] = slot; // earliest open
      } else {
        if (!closes[key] || (ms && ms > closes[key].ms)) closes[key] = slot; // latest close
      }
    }
  }
  // One closed trade per buy-back; attach the open if we have it.
  const cycles = [];
  for (const key of Object.keys(closes)) {
    const cl = closes[key], op = opens[key];
    cycles.push({
      sym: cl.sym, strike: cl.strike, expiry: cl.expiry,
      contracts: op?.contracts || cl.contracts,
      fillCall: op ? op.price : null,
      openMs: op ? op.ms : null,
      buyback: cl.price, closeMs: cl.ms,
    });
  }
  return cycles;
}

export function parseSchwabOrders(orders) {
  const list = Array.isArray(orders) ? orders : (orders?.orders || []);
  const gtcByKey = {};
  for (const o of list) {
    const status = String(o.status || "").toUpperCase();
    if (status && !ACTIVE_ORDER_STATUS.includes(status)) continue;
    const price = Number(o.price);
    if (!(price >= 0)) continue; // need a limit price (the GTC buy-back level)
    for (const leg of (o.orderLegCollection || [])) {
      if (String(leg.instruction || "").toUpperCase() !== "BUY_TO_CLOSE") continue;
      const inst = leg.instrument || {};
      const occ = parseOccSymbol(inst.symbol) || {};
      const putCall = inst.putCall || occ.putCall;
      if (putCall !== "CALL") continue;
      const sym = (inst.underlyingSymbol || occ.underlying || "").toUpperCase();
      if (sym && occ.strike != null && occ.expiry) {
        gtcByKey[`${sym}|${occ.strike}|${occ.expiry}`] = price;
      }
    }
  }
  return gtcByKey;
}

/**
 * Richer view of resting GTC buy-to-close call orders: the authoritative
 * "is my buy-back still working at the broker" signal. Unlike parseSchwabOrders
 * (which returns just the limit price), this keeps the order STATUS so the UI can
 * say "WORKING — not filled" instead of inferring a fill from a model/mark.
 * @returns {object} map "SYM|strike|expiry" -> { gtc, status, placedMs }
 */
export function parseSchwabGtcOrders(orders) {
  const list = Array.isArray(orders) ? orders : (orders?.orders || []);
  const byKey = {};
  for (const o of list) {
    const status = String(o.status || "").toUpperCase();
    if (status && !ACTIVE_ORDER_STATUS.includes(status)) continue; // only live/resting orders
    const price = Number(o.price);
    if (!(price >= 0)) continue;
    const t = o.enteredTime || o.closeTime;
    const placedMs = t ? new Date(t).getTime() : null;
    for (const leg of (o.orderLegCollection || [])) {
      if (String(leg.instruction || "").toUpperCase() !== "BUY_TO_CLOSE") continue;
      const inst = leg.instrument || {};
      const occ = parseOccSymbol(inst.symbol) || {};
      const putCall = inst.putCall || occ.putCall;
      if (putCall !== "CALL") continue;
      const sym = (inst.underlyingSymbol || occ.underlying || "").toUpperCase();
      if (sym && occ.strike != null && occ.expiry) {
        byKey[`${sym}|${occ.strike}|${occ.expiry}`] = { gtc: price, status: status || "WORKING", placedMs };
      }
    }
  }
  return byKey;
}
