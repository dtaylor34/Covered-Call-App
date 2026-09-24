import { describe, it, expect } from "vitest";
import { ytdSummary } from "./ytd";

// One closed SPYD call (prototype example): 3× $45, sold 0.30, bought back 0.05.
const CLOSED = [{ sym: "SPYD", contracts: 3, strike: 45, fillCall: 0.30, buyback: 0.05, how: "bought", stockGain: 0, closedOn: "2026-09-17" }];
// One open PFE call for open P&L + health.
const OPEN = [{ contracts: 1, fillStock: 27.80, fillCall: 0.55, strike: 28, liveStock: 27.775, liveCall: 0.57 }];

describe("ytdSummary", () => {
  const y = ytdSummary(CLOSED, OPEN, { fed: 24, state: 9.3, niit: false }, 2026);

  it("realized option premium = (0.30-0.05)*300 = $75", () => {
    expect(y.premiumRealized).toBeCloseTo(75, 2);
    expect(y.realized).toBeCloseTo(75, 2);
  });
  it("open P&L = if-closed-now for PFE = -$4.50", () => {
    expect(y.openPL).toBeCloseTo(-4.5, 2);
  });
  it("account health across the open book = 99.8%", () => {
    expect((y.accountHealth * 100).toFixed(1)).toBe("99.8");
  });
  it("estimated tax applies only to positive realized", () => {
    expect(y.realizedTax).toBeCloseTo(75 * 0.333, 1);
  });
  it("only totals the requested year", () => {
    expect(ytdSummary(CLOSED, [], { fed: 0, state: 0, niit: false }, 2025).closedCount).toBe(0);
  });
});
