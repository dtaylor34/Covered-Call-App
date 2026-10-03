import { describe, it, expect } from "vitest";
import { parseSchwabPositions, parseOccSymbol, parseSchwabOrders } from "./schwabPositions";

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
