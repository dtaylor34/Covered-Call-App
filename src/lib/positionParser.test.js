// ─── src/lib/positionParser.test.js ──────────────────────────────────────────
// Parses the four thinkorswim formats into the correct position fields.

import { describe, it, expect } from "vitest";
import { parsePaste, normDate, num, positionId } from "./positionParser";

describe("normDate / num", () => {
  it("normalizes date formats to YYYY-MM-DD", () => {
    expect(normDate("2026-10-16")).toBe("2026-10-16");
    expect(normDate("2026-1-6")).toBe("2026-01-06");
    expect(normDate("10/16/26")).toBe("2026-10-16");
    expect(normDate("1/6/2026")).toBe("2026-01-06");
  });
  it("parses loose numbers", () => {
    expect(num("$1,234.50")).toBe(1234.5);
    expect(num(" 27.80 ")).toBe(27.8);
    expect(num("abc")).toBeNull();
  });
});

describe("parsePaste", () => {
  it("quick CSV note", () => {
    const { out, found } = parsePaste("PFE, 1, 27.80, 0.55, 28, 2026-10-16, 0.10");
    expect(out).toMatchObject({ sym: "PFE", contracts: "1", fillStock: "27.80", fillCall: "0.55", strike: "28", expiry: "2026-10-16", gtc: "0.10" });
    expect(found).toContain("quick note");
  });

  it("option fill (call sale)", () => {
    const { out, found } = parsePaste("SOLD -1 PFE 100 (Weeklys) 16 OCT 26 28 CALL @ .55");
    expect(out.sym).toBe("PFE");
    expect(out.strike).toBe("28");
    expect(out.expiry).toBe("2026-10-16");
    expect(out.contracts).toBe("1");
    expect(num(out.fillCall)).toBeCloseTo(0.55, 2);
    expect(found).toContain("call sale");
  });

  it("buy-back working order → gtc", () => {
    const { out, found } = parsePaste("BUY +1 PFE 100 16 OCT 26 28 CALL @ .10 LMT");
    expect(out.sym).toBe("PFE");
    expect(num(out.gtc)).toBeCloseTo(0.10, 2);
    expect(found).toContain("buy-back order");
  });

  it("share purchase", () => {
    const { out, found } = parsePaste("BOT +100 PFE @ 27.80");
    expect(out.sym).toBe("PFE");
    expect(num(out.fillStock)).toBeCloseTo(27.80, 2);
    expect(out.contracts).toBe("1");
    expect(found).toContain("share purchase");
  });

  it("combines a multi-line paste (shares + call + GTC) into one position", () => {
    const text = [
      "BOT +100 PFE @ 27.80",
      "SOLD -1 PFE 100 16 OCT 26 28 CALL @ .55",
      "BUY +1 PFE 100 16 OCT 26 28 CALL @ .10 LMT",
    ].join("\n");
    const { out } = parsePaste(text);
    expect(out.sym).toBe("PFE");
    expect(out.strike).toBe("28");
    expect(out.expiry).toBe("2026-10-16");
    expect(num(out.fillStock)).toBeCloseTo(27.80, 2);
    expect(num(out.fillCall)).toBeCloseTo(0.55, 2);
    expect(num(out.gtc)).toBeCloseTo(0.10, 2);
  });
});

describe("positionId", () => {
  it("builds the canonical id used by app + sheet", () => {
    expect(positionId("PFE", 28, "2026-10-16")).toBe("pfe-28-2026-10-16");
  });
});
