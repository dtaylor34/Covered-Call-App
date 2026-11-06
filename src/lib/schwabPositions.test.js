import { describe, it, expect } from "vitest";
import { parseSchwabPositions, parseSchwabOptionPositions, parseOccSymbol, parseSchwabOrders, parseSchwabGtcOrders } from "./schwabPositions";
import { positionCalcs } from "./coveredCallMath";

// Mock Schwab Trader API response: 200 META shares + 2 short $820 calls (the META example).
const DATA = {
  securitiesAccount: {
    positions: [
      {
        longQuantity: 200, shortQuantity: 0, averagePrice: 34.6799, marketValue: 155150,
        instrument: { assetType: "EQUITY", symbol: "META", description: "META PLATFORMS INC-CLASS A" },
      },
      {
        longQuantity: 0, shortQuantity: 2, averagePrice: 14.90, marketValue: -4515,
        instrument: { assetType: "OPTION", symbol: "META  261023C00820000", putCall: "CALL", underlyingSymbol: "META", description: "META PLATFORMS INC 10/23/2026 $820 Call" },
      },
    ],
  },
};

describe("parseOccSymbol", () => {
  it("parses a Schwab OCC option symbol", () => {
    expect(parseOccSymbol("META  261023C00820000")).toEqual({ underlying: "META", expiry: "2026-10-23", putCall: "CALL", strike: 820 });
  });
});

describe("parseSchwabOptionPositions — covered-call flagging", () => {
  it("flags a share-backed short call as a covered call (kept out of the options book)", () => {
    const legs = parseSchwabOptionPositions(DATA); // 200 META shares + 2 short $820 calls
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ sym: "META", type: "CALL", direction: "short", contracts: 2 });
    expect(legs[0].coveredCall).toBe(true); // 200 shares ≥ 2 × 100
  });

  it("does NOT flag a long option or a share-less (naked) short call", () => {
    const data = { securitiesAccount: { positions: [
      { longQuantity: 6, shortQuantity: 0, averagePrice: 0.9, marketValue: 636,
        instrument: { assetType: "OPTION", symbol: "GOOG  261204C00325000", putCall: "CALL", underlyingSymbol: "GOOG" } },
      { longQuantity: 0, shortQuantity: 1, averagePrice: 2.0, marketValue: -200, // no shares held
        instrument: { assetType: "OPTION", symbol: "TSLA  261204C00500000", putCall: "CALL", underlyingSymbol: "TSLA" } },
    ] } };
    const legs = parseSchwabOptionPositions(data);
    expect(legs.find((l) => l.sym === "GOOG").coveredCall).toBe(false); // long call
    expect(legs.find((l) => l.sym === "TSLA").coveredCall).toBe(false); // short call but unbacked → naked
  });
});

describe("parseSchwabPositions", () => {
  const { candidates } = parseSchwabPositions(DATA);
  it("finds the covered call and matches it to the shares", () => {
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.sym).toBe("META");
    expect(c.contracts).toBe(2);
    expect(c.strike).toBe(820);
    expect(c.expiry).toBe("2026-10-23");
    expect(c.fillCall).toBeCloseTo(14.90, 2);
    expect(c.liveCall).toBeCloseTo(22.575, 2);     // 4515 / (2*100)
    expect(c.fillStock).toBeCloseTo(34.6799, 3);   // avg cost (held shares)
    expect(c.liveStock).toBeCloseTo(775.75, 2);    // 155150 / 200
    expect(c.covered).toBe(true);                  // 200 shares >= 2*100
  });
});

// The reported bug: 200 META shares + two short calls (680 & 700, same expiry).
// Must produce TWO covered-call rows, each with its own 100-share lot.
const EQ = (sym, shares, avg, mv) => ({ longQuantity: shares, shortQuantity: 0, averagePrice: avg, marketValue: mv, instrument: { assetType: "EQUITY", symbol: sym } });
const SC = (occ, sym, qty, avg, mv) => ({ longQuantity: 0, shortQuantity: qty, averagePrice: avg, marketValue: mv, instrument: { assetType: "OPTION", symbol: occ, putCall: "CALL", underlyingSymbol: sym } });
const META_TWO = { securitiesAccount: { positions: [
  EQ("META", 200, 34.6799, 122860),                         // 200 sh @ 34.6799, price 614.30
  SC("META  261218C00680000", "META", 1, 16.30, -1122.50),  // 680C sold 16.30, now 11.225
  SC("META  261218C00700000", "META", 1, 10.55, -1055),     // 700C sold 10.55
] } };

describe("parseSchwabPositions — share allocation across multiple short calls", () => {
  it("pairs each short call with its OWN 100-share lot (no merge, nothing dropped)", () => {
    const { candidates } = parseSchwabPositions(META_TWO);
    expect(candidates).toHaveLength(2);
    const [c680, c700] = candidates; // stable order: same expiry → strike 680 before 700
    expect(c680).toMatchObject({ sym: "META", strike: 680, contracts: 1, shares: 100, covered: true });
    expect(c700).toMatchObject({ sym: "META", strike: 700, contracts: 1, shares: 100, covered: true });
    expect(c680.fillCall).toBeCloseTo(16.30, 2);
    expect(c700.fillCall).toBeCloseTo(10.55, 2);
    expect(c680.fillStock).toBeCloseTo(34.6799, 4);
  });

  it("per-row calcs use that row's own shares/contracts — money in trade, premium, best case, kept", () => {
    const [c680, c700] = parseSchwabPositions(META_TWO).candidates;
    const r680 = positionCalcs(c680);
    expect(r680.basis).toBeCloseTo(1837.99, 2);      // money in trade = 34.6799×100 − 16.30×100
    expect(r680.premium).toBeCloseTo(1630.00, 2);
    expect(r680.maxProfit).toBeCloseTo(66162.01, 2); // best case = (680−34.6799)×100 + 1630
    expect(r680.kept).toBeCloseTo(507.50, 2);        // (16.30 − 11.225) × 100 — formula is correct
    const r700 = positionCalcs(c700);
    expect(r700.basis).toBeCloseTo(2412.99, 2);
    expect(r700.premium).toBeCloseTo(1055.00, 2);
    expect(r700.maxProfit).toBeCloseTo(67587.01, 2);
  });

  it("aggregates N contracts at the same strike into one row (qty −N / +N×100)", () => {
    const data = { securitiesAccount: { positions: [
      EQ("META", 200, 34.6799, 122860),
      SC("META  261218C00680000", "META", 2, 16.30, -2245),
    ] } };
    const { candidates } = parseSchwabPositions(data);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ strike: 680, contracts: 2, shares: 200, covered: true });
  });

  it("marks leftover short calls UNCOVERED when shares run out (not hidden)", () => {
    const data = { securitiesAccount: { positions: [
      EQ("META", 200, 34.6799, 122860),                        // only 200 shares = 2 lots
      SC("META  261218C00680000", "META", 1, 16.30, -1122.50),
      SC("META  261218C00700000", "META", 1, 10.55, -1055),
      SC("META  261218C00720000", "META", 1, 6.00, -600),      // 3rd call → no shares left
    ] } };
    const { candidates } = parseSchwabPositions(data);
    expect(candidates).toHaveLength(3);                          // nothing hidden
    expect(candidates.map((c) => c.covered)).toEqual([true, true, false]);
    expect(candidates[2]).toMatchObject({ strike: 720, contracts: 1, shares: 0, covered: false });
  });
});

describe("parseSchwabOrders", () => {
  it("extracts GTC buy-to-close call orders → key→price", () => {
    const orders = [
      {
        status: "WORKING", price: 2.00, duration: "GOOD_TILL_CANCEL",
        orderLegCollection: [{
          instruction: "BUY_TO_CLOSE", quantity: 2,
          instrument: { assetType: "OPTION", symbol: "META  261106C00800000", putCall: "CALL", underlyingSymbol: "META" },
        }],
      },
      { status: "FILLED", price: 9.99, orderLegCollection: [] }, // ignored (not active)
    ];
    expect(parseSchwabOrders(orders)).toEqual({ "META|800|2026-11-06": 2 });
  });
});

describe("parseSchwabGtcOrders", () => {
  it("keeps the resting order's status (authoritative 'not filled' signal)", () => {
    const orders = [
      {
        status: "WORKING", price: 2.00, enteredTime: "2026-10-02T12:34:15+0000",
        orderLegCollection: [{
          instruction: "BUY_TO_CLOSE",
          instrument: { assetType: "OPTION", symbol: "META  261106C00800000", putCall: "CALL", underlyingSymbol: "META" },
        }],
      },
      { status: "FILLED", price: 1.00, orderLegCollection: [] }, // ignored (not active)
    ];
    const out = parseSchwabGtcOrders(orders);
    expect(out["META|800|2026-11-06"].gtc).toBe(2);
    expect(out["META|800|2026-11-06"].status).toBe("WORKING");
    expect(out["META|800|2026-11-06"].placedMs).toBe(new Date("2026-10-02T12:34:15+0000").getTime());
  });
});
