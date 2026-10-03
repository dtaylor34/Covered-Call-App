// ─── src/lib/schwabPositions.js ──────────────────────────────────────────────
// Turns a Schwab Trader API account/positions response into covered-call
// candidates the app can import: a short CALL matched with the underlying
// shares, with cost basis (averagePrice) and live price (marketValue/qty).
//
// Schwab gives AVERAGE cost, not tax lots — so imported shares land as one lot
// at the average price; split them into real lots afterward if needed.

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

const ACTIVE_ORDER_STATUS = ["WORKING", "QUEUED", "ACCEPTED", "PENDING_ACTIVATION", "OPEN", "AWAITING_PARENT_ORDER"];

/**
 * Extract GTC buy-to-close call orders from a Schwab orders response.
 * @param {Array|object} orders response from schwabGetOrders
 * @returns {object} map of "SYM|strike|expiry" -> gtc price (buy-to-close limit)
 */
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
