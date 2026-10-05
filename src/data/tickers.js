// ─── src/data/tickers.js ──────────────────────────────────────────────────────
// Symbols shown in the dashboard search dropdown. Derived from the curated
// covered-call universe (indexes + Technology + Healthcare) — real names and
// correct Index/ETF/Stock categories. (Previously this held ~450 placeholder
// "Mock Stock / Mock ETF" rows, now removed.)
import { COVERED_CALL_UNIVERSE } from "./coveredCallUniverse";

export const PRELOADED_TICKERS = COVERED_CALL_UNIVERSE.map(({ symbol, name, type }) => ({ symbol, name, type }));
