import { describe, it, expect } from "vitest";
import { realizedFromTransactions } from "./schwabTransactions";

const NOW = Date.parse("2026-11-05T12:00:00Z");

// One Schwab TRADE with an OPTION leg (amount signed: − sold, + bought).
const opt = (occ, net, qty, fee = 0) => ({
  type: "TRADE", netAmount: net,
  transferItems: [
    { instrument: { assetType: "OPTION", symbol: occ }, amount: qty },
    ...(fee ? [{ feeType: "OPT_REG_FEE", cost: fee }] : []),
  ],
});
// One Schwab TRADE with an EQUITY leg.
const stk = (sym, net, qty, fee = 0) => ({
  type: "TRADE", netAmount: net,
  transferItems: [
    { instrument: { assetType: "EQUITY", symbol: sym }, amount: qty },
    ...(fee ? [{ feeType: "SEC_FEE", cost: fee }] : []),
  ],
});

describe("realizedFromTransactions — closed positions only, option + stock", () => {
  it("bought-back covered call counts as realized option income", () => {
    const r = realizedFromTransactions([[opt("META  261218C00680000", 1630, -1), opt("META  261218C00680000", -10, 1, 0.04)]], NOW);
    expect(r.closedCount).toBe(1);
    expect(r.optionRealized).toBeCloseTo(1620, 2);
    expect(r.stockRealized).toBe(0);
    expect(r.realized).toBeCloseTo(1620, 2);
  });

  it("expired covered call (open only, past expiry) counts as realized", () => {
    const r = realizedFromTransactions([[opt("PFE   261016C00028000", 1055, -1)]], NOW);
    expect(r.optionRealized).toBeCloseTo(1055, 2);
  });

  it("EXCLUDES a still-open option (open only, future expiry)", () => {
    const r = realizedFromTransactions([[opt("META  261218C00700000", 1055, -1)]], NOW);
    expect(r.closedCount).toBe(0);
    expect(r.openCount).toBe(1);
    expect(r.realized).toBe(0);
  });

  it("called-away stock (bought + fully sold) adds stock realized; held shares stay open", () => {
    const payload = [
      stk("PFE", -2778.50, 100),        // bought 100 @ 27.785
      stk("PFE", 2799.98, -100, 0.02),  // called away: sold 100 @ 28
      stk("META", -122860, 200),        // 200 META shares still held
    ];
    const r = realizedFromTransactions([payload], NOW);
    const pfe = r.closed.find((c) => c.symbol === "PFE");
    expect(pfe.kind).toBe("stock");
    expect(r.stockRealized).toBeCloseTo(21.48, 2);        // 2799.98 − 2778.50
    expect(r.open.some((o) => o.symbol === "META")).toBe(true); // held shares excluded
  });

  it("totals option + stock, ignores non-tradable rows", () => {
    const payload = [
      opt("META  261023C00820000", 1977.29, -2), opt("META  261023C00820000", 0, 2), // sold-to-open then expired/bought-flat
      stk("PFE", -2778.50, 100), stk("PFE", 2799.98, -100),
      { type: "DIVIDEND_OR_INTEREST", netAmount: 5 },
    ];
    const r = realizedFromTransactions([payload], NOW);
    expect(r.realized).toBeCloseTo(1977.29 + 21.48, 2);
  });
});
