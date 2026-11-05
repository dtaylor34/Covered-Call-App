// ─── src/lib/optionStrategies.test.js ────────────────────────────────────────
// Covers leg classification, strategy-level numbers, and the mechanical
// profit-taking rules. Profit-target branches use hand-built calc objects so
// the DTE-sensitive cases don't depend on the wall clock.

import { describe, it, expect } from "vitest";
import {
  groupIntoStrategies, classifyLegs, strategyCalcs, profitTargets, sellTargets,
} from "./optionStrategies";

const leg = (o) => ({
  sym: "TLT", expiry: "2027-01-15", contracts: 1, multiplier: 100,
  fillUnderlying: 90, liveUnderlying: 90, ...o,
});
const longStraddle = [
  leg({ type: "CALL", direction: "long", strike: 90, fillPrice: 1.5, livePrice: 3.0 }),
  leg({ type: "PUT", direction: "long", strike: 90, fillPrice: 1.4, livePrice: 0.2 }),
];
const shortStrangle = [
  leg({ type: "PUT", direction: "short", strike: 85, fillPrice: 1.0, livePrice: 0.4 }),
  leg({ type: "CALL", direction: "short", strike: 95, fillPrice: 1.1, livePrice: 0.5 }),
];

describe("classifyLegs", () => {
  it("names a long straddle (call+put, same strike, both long)", () => {
    expect(classifyLegs(longStraddle).strategy).toBe("Long straddle");
  });
  it("names a short strangle (call+put, diff strike, both short)", () => {
    expect(classifyLegs(shortStrangle).strategy).toBe("Short strangle");
  });
  it("names a call vertical (2 calls, opposite directions)", () => {
    const v = [leg({ type: "CALL", direction: "long", strike: 90, fillPrice: 2 }), leg({ type: "CALL", direction: "short", strike: 95, fillPrice: 1 })];
    expect(classifyLegs(v).strategy).toBe("Call vertical");
  });
  it("names an iron condor (2 calls + 2 puts)", () => {
    const ic = [
      leg({ type: "PUT", direction: "long", strike: 80, fillPrice: 0.4 }),
      leg({ type: "PUT", direction: "short", strike: 85, fillPrice: 0.9 }),
      leg({ type: "CALL", direction: "short", strike: 95, fillPrice: 0.9 }),
      leg({ type: "CALL", direction: "long", strike: 100, fillPrice: 0.4 }),
    ];
    expect(classifyLegs(ic).strategy).toBe("Iron condor");
  });
  it("names a butterfly (3 same-type legs)", () => {
    const fly = [
      leg({ type: "CALL", direction: "long", strike: 90, fillPrice: 3 }),
      leg({ type: "CALL", direction: "short", strike: 95, fillPrice: 1.5, contracts: 2 }),
      leg({ type: "CALL", direction: "long", strike: 100, fillPrice: 0.6 }),
    ];
    expect(classifyLegs(fly).strategy).toBe("Butterfly");
  });
  it("names a single leg", () => {
    expect(classifyLegs([leg({ type: "CALL", direction: "long", strike: 90, fillPrice: 1 })]).strategy).toBe("Long call");
  });
});

describe("groupIntoStrategies", () => {
  it("keeps un-grouped legs individual, even when they'd look like a strategy", () => {
    const groups = groupIntoStrategies(longStraddle.map((l, i) => ({ ...l, id: `L${i}` })));
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.multiLeg)).toBe(true);
  });
  it("combines legs that share an explicit groupId into one strategy card", () => {
    const combined = longStraddle.map((l, i) => ({ ...l, id: `L${i}`, groupId: "g1" }));
    const groups = groupIntoStrategies(combined);
    expect(groups).toHaveLength(1);
    expect(groups[0].legs).toHaveLength(2);
    expect(groups[0].multiLeg).toBe(true);
    expect(groups[0].strategy).toBe("Long straddle");
  });
  it("separates legs that carry different (or no) groupIds", () => {
    const legs = [
      { ...leg({ type: "CALL", direction: "long", strike: 90, fillPrice: 1 }), id: "a", groupId: "g1" },
      { ...leg({ type: "PUT", direction: "long", strike: 90, fillPrice: 1 }), id: "b", groupId: "g1" },
      { ...leg({ type: "CALL", direction: "long", strike: 95, fillPrice: 1 }), id: "c" },
    ];
    const groups = groupIntoStrategies(legs);
    expect(groups).toHaveLength(2);             // one combined pair + one standalone
    expect(groups.filter((g) => g.multiLeg)).toHaveLength(1);
  });
});

describe("strategyCalcs", () => {
  it("long straddle is a debit with symmetric breakevens", () => {
    const c = strategyCalcs({ expiry: "2027-01-15", legs: longStraddle }, { liveUnderlying: 90 });
    expect(c.kind).toBe("debit");
    expect(c.debit).toBeCloseTo(290, 0);               // (1.5 + 1.4) × 100
    expect(c.openPL).toBeCloseTo(30, 0);               // +150 call, −120 put
    const bes = c.breakevens.map((b) => Math.round(b * 10) / 10).sort((a, b) => a - b);
    expect(bes[0]).toBeCloseTo(87.1, 1);
    expect(bes[1]).toBeCloseTo(92.9, 1);
    expect(c.maxProfit).toBe(Infinity);                // net long call → unbounded upside
  });
  it("short strangle is a credit with capped max profit", () => {
    const c = strategyCalcs({ expiry: "2027-01-15", legs: shortStrangle }, { liveUnderlying: 90 });
    expect(c.kind).toBe("credit");
    expect(c.credit).toBeCloseTo(210, 0);              // (1.0 + 1.1) × 100
    expect(c.openPL).toBeCloseTo(120, 0);              // +60 put, +60 call
    expect(c.maxProfit).toBeCloseTo(210, 0);           // keep full credit
  });
});

describe("sellTargets", () => {
  const put = { sym: "GOOG", type: "PUT", direction: "long", strike: 230, expiry: "2027-06-18", contracts: 6, multiplier: 100, fillPrice: 0.8, livePrice: 0.84, fillUnderlying: 280, liveUnderlying: 280 };
  const call = { ...put, type: "CALL", strike: 325, fillPrice: 0.9, livePrice: 1.06 };

  it("prices each gain rung off the entry premium, with proceeds for the whole lot", () => {
    const [t50, t100] = sellTargets(put, [50, 100]);
    expect(t50.premium).toBeCloseTo(1.2, 2);           // $0.80 × 1.5
    expect(t50.proceeds).toBeCloseTo(720, 0);          // $1.20 × 100 × 6
    expect(t100.premium).toBeCloseTo(1.6, 2);          // 2× entry
    expect(t100.proceeds).toBeCloseTo(960, 0);
    expect(t100.free).toBe(true);                      // +100% is the free-roll rung
  });

  it("puts need the stock BELOW today's price to gain; calls need it ABOVE", () => {
    const putT = sellTargets(put, [100])[0];
    const callT = sellTargets(call, [100])[0];
    expect(putT.underlying).toBeLessThan(280);
    expect(callT.underlying).toBeGreaterThan(280);
  });

  it("a short's targets are buy-back prices below the credit taken", () => {
    const short = { ...put, direction: "short", fillPrice: 2.0 };
    const [t50] = sellTargets(short, [50]);
    expect(t50.premium).toBeCloseTo(1.0, 2);           // buy back at 50% of the $2.00 credit
    expect(t50.free).toBe(false);
  });

  it("hides stock-price targets when the mark and underlying disagree (stale/after-hours)", () => {
    // ITM call marked at $1.00 while intrinsic is ~$15 → IV floors out → unreliable.
    const stale = { ...call, strike: 325, fillUnderlying: 340, liveUnderlying: 340, fillPrice: 0.9, livePrice: 1.0 };
    const [t] = sellTargets(stale, [50]);
    expect(t.ivReliable).toBe(false);
    expect(t.underlying).toBeNull();                   // no misleading line
    expect(t.premium).toBeCloseTo(1.35, 2);            // premium target still exact
  });
});

describe("profitTargets", () => {
  it("credit: flags take-profit once ≥50% of max credit is captured", () => {
    const t = profitTargets({ kind: "credit", credit: 210, debit: 0, openPL: 120, dte: 45, maxProfit: 210 });
    expect(t.health.color).toBe("good");
    expect(t.health.label).toBe("Take profit");
    expect(t.targets).toHaveLength(2);
  });
  it("credit: warns to manage inside 21 DTE before the 50% target", () => {
    const t = profitTargets({ kind: "credit", credit: 210, debit: 0, openPL: 40, dte: 14, maxProfit: 210 });
    expect(t.health.color).toBe("warn");
  });
  it("credit: flags the defensive stop at 2× credit loss", () => {
    const t = profitTargets({ kind: "credit", credit: 210, debit: 0, openPL: -430, dte: 45, maxProfit: 210 });
    expect(t.health.color).toBe("bad");
  });
  it("debit: scale-out at +50%, take-profit at +100%", () => {
    expect(profitTargets({ kind: "debit", credit: 0, debit: 290, openPL: 160, dte: 45 }).health.label).toBe("Scale out");
    expect(profitTargets({ kind: "debit", credit: 0, debit: 290, openPL: 320, dte: 45 }).health.label).toBe("Take profit");
    expect(profitTargets({ kind: "debit", credit: 0, debit: 290, openPL: 30, dte: 45 }).health.color).toBe("neutral");
    expect(profitTargets({ kind: "debit", credit: 0, debit: 290, openPL: -160, dte: 45 }).health.color).toBe("bad");
  });
});
