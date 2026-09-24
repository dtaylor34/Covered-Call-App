// ─── src/lib/coveredCallMath.test.js ─────────────────────────────────────────
// Verifies the ported math against the PFE acceptance trade in
// handover/HANDOVER.md. Exact arithmetic is asserted tightly; Black-Scholes
// outputs use the "≈" tolerances from the handover.

import { describe, it, expect } from "vitest";
import {
  callVal, callDelta, positionCalcs, stoplight, gtcFillEstimate,
  effectiveLotCost, freeLotSignal, deliveryOrder, washSale, taxEstimate, strikeStep,
} from "./coveredCallMath";

// PFE: bought 100 @ $27.80, sold 1× Oct-16 '26 $28 call @ $0.55,
// live stock $27.775, live call $0.57, 25 days, IV 22%, GTC $0.10.
const PFE = {
  contracts: 1, fillStock: 27.80, fillCall: 0.55, strike: 28,
  liveStock: 27.775, liveCall: 0.57, daysToExpiry: 25, iv: 0.22, gtc: 0.10,
};

// PFE tax lots (prototype defaults), reference "today" = 2026-09-21.
const TODAY = new Date("2026-09-21T00:00:00");
const PFE_LOTS = [
  { id: "pfe-a", sym: "PFE", shares: 100, cost: 27.80, bought: "2026-09-21", premiumKept: 0 },
  { id: "pfe-b", sym: "PFE", shares: 100, cost: 29.10, bought: "2026-08-14", premiumKept: 0 },
  { id: "pfe-c", sym: "PFE", shares: 100, cost: 26.40, bought: "2026-09-02", premiumKept: 0 },
];

describe("position P&L (PFE)", () => {
  const c = positionCalcs(PFE);
  it("money in the trade = $2,725.00", () => expect(c.basis).toBeCloseTo(2725.0, 2));
  it("if closed now = -$4.50 (shares -2.50, call -2.00)", () => {
    expect(c.stockPL).toBeCloseTo(-2.5, 2);
    expect(c.kept).toBeCloseTo(-2.0, 2);
    expect(c.close).toBeCloseTo(-4.5, 2);
  });
  it("max profit = +$75.00", () => expect(c.maxProfit).toBeCloseTo(75.0, 2));
  it("breakeven = $27.25", () => expect(c.breakeven).toBeCloseTo(27.25, 2));
  it("health = 99.8%", () => expect((c.health * 100).toFixed(1)).toBe("99.8"));
});

describe("Black-Scholes (PFE)", () => {
  it("modeled call ≈ $0.57", () => {
    const v = callVal(PFE.liveStock, PFE.strike, PFE.daysToExpiry, PFE.iv);
    expect(v).toBeGreaterThan(0.55);
    expect(v).toBeLessThan(0.59);
  });
  it("call chance ≈ 47%", () => {
    const d = callDelta(PFE.liveStock, PFE.strike, PFE.daysToExpiry, PFE.iv);
    expect(Math.round(d * 100)).toBeGreaterThanOrEqual(45);
    expect(Math.round(d * 100)).toBeLessThanOrEqual(49);
  });
  it("stoplight is Yellow (delta ≥ 0.35, below strike)", () => {
    const be = positionCalcs(PFE).breakeven;
    const s = stoplight({ liveStock: PFE.liveStock, strike: PFE.strike, daysToExpiry: PFE.daysToExpiry, iv: PFE.iv, breakeven: be });
    expect(s.key).toBe("y");
  });
});

describe("GTC fill estimate (PFE)", () => {
  it("locks in $45.00 of premium", () => {
    const { gtcKeep } = gtcFillEstimate({ S: PFE.liveStock, strike: PFE.strike, daysLeft: PFE.daysToExpiry, iv: PFE.iv, gtc: PFE.gtc, fillCall: PFE.fillCall, contracts: 1 });
    expect(gtcKeep).toBeCloseTo(45.0, 2);
  });
  it("has a fill day within the window", () => {
    const { fillDays } = gtcFillEstimate({ S: PFE.liveStock, strike: PFE.strike, daysLeft: PFE.daysToExpiry, iv: PFE.iv, gtc: PFE.gtc, fillCall: PFE.fillCall });
    expect(fillDays).not.toBeNull();
    expect(fillDays).toBeLessThanOrEqual(PFE.daysToExpiry);
  });
});

describe("lots — delivery, free-lot signal, wash sale (PFE)", () => {
  it("delivers the $27.80 lot first if called at $28", () => {
    const order = deliveryOrder("PFE", 28, PFE_LOTS);
    expect(order[0].id).toBe("pfe-a");
    expect(order[0].cost).toBe(27.80);
  });

  it("$26.40 lot → Ready ($28 call ≈ $0.64, ≈2.3%/mo)", () => {
    const eff = effectiveLotCost(PFE_LOTS[2]); // 26.40, no premium, uncovered
    expect(eff).toBeCloseTo(26.40, 2);
    const sig = freeLotSignal({ S: 27.775, eff, iv: 0.22 });
    expect(sig.signal).toBe("ready");
    expect(sig.strike).toBe(28);
    expect(sig.premium).toBeGreaterThan(0.60);
    expect(sig.premium).toBeLessThan(0.68);
    expect(sig.monthlyYieldPct).toBeGreaterThan(2.1);
    expect(sig.monthlyYieldPct).toBeLessThan(2.5);
  });

  it("$29.10 lot → Thin ($29.50 call ≈ $0.18, ≈0.6%/mo)", () => {
    const eff = effectiveLotCost(PFE_LOTS[1]); // 29.10
    const sig = freeLotSignal({ S: 27.775, eff, iv: 0.22 });
    expect(sig.signal).toBe("thin");
    expect(sig.strike).toBe(29.5);
    expect(sig.premium).toBeGreaterThan(0.13);
    expect(sig.premium).toBeLessThan(0.23);
    expect(sig.monthlyYieldPct).toBeGreaterThan(0.45);
    expect(sig.monthlyYieldPct).toBeLessThan(0.85);
  });

  it("$29.10 lot is wash-sale flagged, clears 2026-10-22", () => {
    const w = washSale(PFE_LOTS[1], PFE_LOTS, TODAY, 27.775);
    expect(w.wash).toBe(true);
    expect(w.clearDate.toISOString().slice(0, 10)).toBe("2026-10-22");
  });

  it("a lot in profit is never wash-flagged", () => {
    const w = washSale(PFE_LOTS[2], PFE_LOTS, TODAY, 27.775); // 26.40 < 27.775 → gain
    expect(w.wash).toBe(false);
  });
});

describe("helpers", () => {
  it("strike step: 0.5 / 1 / 5 by price band", () => {
    expect(strikeStep(27.78)).toBe(0.5);
    expect(strikeStep(120)).toBe(1);
    expect(strikeStep(650)).toBe(5);
  });
  it("tax estimate: fed + state + NIIT on positive realized only", () => {
    expect(taxEstimate({ fed: 24, state: 9.3, niit: false }, 100).ratePct).toBeCloseTo(33.3, 1);
    expect(taxEstimate({ fed: 24, state: 9.3, niit: true }, 100).tax).toBeCloseTo(37.1, 1);
    expect(taxEstimate({ fed: 24, state: 9.3, niit: true }, -500).tax).toBe(0);
  });
});
