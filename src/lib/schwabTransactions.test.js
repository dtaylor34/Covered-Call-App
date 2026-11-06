import { describe, it, expect } from "vitest";
import { realizedFromTransactions } from "./schwabTransactions";

const NOW = Date.parse("2026-11-05T12:00:00Z");

// One Schwab TRADE transaction with an option leg (+ optional fee leg).
const tx = (occ, net, effect, qty, fee = 0) => ({
  type: "TRADE", netAmount: net,
  transferItems: [
    { instrument: { assetType: "OPTION", symbol: occ }, amount: qty, positionEffect: effect },
    ...(fee ? [{ feeType: "OPT_REG_FEE", cost: fee }] : []),
  ],
});

describe("realizedFromTransactions — closed positions only", () => {
  it("counts a bought-back covered call (open + close) as realized", () => {
    const payload = [tx("META  261218C00680000", 1630, "OPENING", -1), tx("META  261218C00680000", -10, "CLOSING", 1, 0.04)];
    const r = realizedFromTransactions([payload], NOW);
    expect(r.closedCount).toBe(1);
    expect(r.openCount).toBe(0);
    expect(r.realized).toBeCloseTo(1620, 2); // 1630 premium − 10 buy-back
  });

  it("counts an expired covered call (open only, past expiry) as realized", () => {
    const payload = [tx("PFE   261016C00028000", 1055, "OPENING", -1)]; // expiry 2026-10-16 < NOW
    const r = realizedFromTransactions([payload], NOW);
    expect(r.closedCount).toBe(1);
    expect(r.realized).toBeCloseTo(1055, 2);
  });

  it("EXCLUDES a still-open position (open only, future expiry)", () => {
    const payload = [tx("META  261218C00700000", 1055, "OPENING", -1)]; // expiry 2026-12-18 > NOW
    const r = realizedFromTransactions([payload], NOW);
    expect(r.closedCount).toBe(0);
    expect(r.openCount).toBe(1);
    expect(r.realized).toBe(0);
  });

  it("ignores non-TRADE rows, excludes open legs, sums across accounts", () => {
    const a = [tx("META  261218C00680000", 1630, "OPENING", -1), tx("META  261218C00680000", -10, "CLOSING", 1)];
    const b = [{ type: "DIVIDEND_OR_INTEREST", netAmount: 5 }, tx("GOOG  261204C00325000", -540, "OPENING", 4)]; // GOOG long, still open
    const r = realizedFromTransactions([a, b], NOW);
    expect(r.realized).toBeCloseTo(1620, 2); // only the closed META; GOOG open excluded, dividend ignored
    expect(r.closedCount).toBe(1);
    expect(r.openCount).toBe(1);
  });
});
