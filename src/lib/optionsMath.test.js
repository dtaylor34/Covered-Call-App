// ─── src/lib/optionsMath.test.js ─────────────────────────────────────────────
// Focused on freeRollPlan — the "sell half, run the rest free" math that drives
// the Working Options management panel. Uses the real GOOG $230 put as the model
// case: 6 long contracts bought at $0.80 (cost $480), free-roll at 2× = $1.60.

import { describe, it, expect } from "vitest";
import { freeRollPlan } from "./optionsMath";

const put = (o) => ({
  sym: "GOOG", type: "PUT", direction: "long", strike: 230, expiry: "2026-12-04",
  contracts: 6, multiplier: 100, fillPrice: 0.8, ...o,
});

describe("freeRollPlan", () => {
  it("free-roll price is 2× entry for an even lot, and it isn't 'ready' yet below it", () => {
    const fr = freeRollPlan(put({ livePrice: 0.84 }));
    expect(fr.applicable).toBe(true);
    expect(fr.sellQty).toBe(3);
    expect(fr.keepQty).toBe(3);
    expect(fr.origCost).toBeCloseTo(480, 0);
    expect(fr.freeRollPrice).toBeCloseTo(1.6, 2);     // sell 3 at $1.60 → recover $480
    expect(fr.proceedsNow).toBeCloseTo(252, 0);       // 3 × $0.84 × 100
    expect(fr.ready).toBe(false);
    expect(fr.freeRunning).toBe(false);
  });

  it("progress is 0% at entry and tracks the gain toward the double (not live/freeRoll)", () => {
    expect(freeRollPlan(put({ livePrice: 0.8 })).progressPct).toBeCloseTo(0, 1);   // at entry → 0%, not 50%
    expect(freeRollPlan(put({ livePrice: 0.84 })).progressPct).toBeCloseTo(5, 1);  // +5% gain → 5% of the way
    expect(freeRollPlan(put({ livePrice: 1.2 })).progressPct).toBeCloseTo(50, 1);  // halfway ($0.80→$1.60)
    expect(freeRollPlan(put({ livePrice: 1.6 })).progressPct).toBeCloseTo(100, 1); // at free-roll
  });

  it("flags 'ready' once the mark reaches the free-roll price", () => {
    const fr = freeRollPlan(put({ livePrice: 1.6 }));
    expect(fr.ready).toBe(true);
    expect(fr.proceedsNow).toBeCloseTo(480, 0);       // selling half returns the whole cost
  });

  it("keeps the larger half on odd lots (sell 2 of 5, keep 3)", () => {
    const fr = freeRollPlan(put({ contracts: 5, livePrice: 0.84 }));
    expect(fr.sellQty).toBe(2);
    expect(fr.keepQty).toBe(3);
    expect(fr.freeRollPrice).toBeCloseTo((0.8 * 100 * 5) / (2 * 100), 2); // $2.00
  });

  it("is not applicable to a single contract (can't sell half)", () => {
    expect(freeRollPlan(put({ contracts: 1, livePrice: 2 })).applicable).toBe(false);
  });

  it("is not applicable to a short", () => {
    expect(freeRollPlan(put({ direction: "short", livePrice: 0.4 })).applicable).toBe(false);
  });

  it("reports free-running once a prior scale-out recovered the full cost", () => {
    // Sold 3 of the original 6 at $1.60 → recovered $480; 3 remain.
    const fr = freeRollPlan(put({ contracts: 3, scaledOut: 3, recovered: 480, livePrice: 0.9 }));
    expect(fr.freeRunning).toBe(true);
    expect(fr.origQty).toBe(6);
    expect(fr.origCost).toBeCloseTo(480, 0);
  });
});
