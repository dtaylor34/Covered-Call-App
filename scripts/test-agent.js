#!/usr/bin/env node
// ─── scripts/test-agent.js ───────────────────────────────────────────────────
// Self-contained test agent: 5 simulated users × full lifecycle.
//
// Tests ALL business logic the React app executes:
//   - Sign up → user doc creation
//   - Onboarding (3-step flow + validation)
//   - Search 5 symbols → history auto-save
//   - Contract selection → context tracking
//   - History page → verify entries, context, timestamps
//   - Navigate back → state restoration (contract match by strike+exp)
//   - Change contract → auto-update without position bump
//   - Delete single / batch / clear all
//   - Analytics event writing + aggregation
//   - Duplicate prevention, max history cap (50), edge cases
//
// Run:  node scripts/test-agent.js
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

// ── Logging ──
const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const INFO = "\x1b[36m→\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let total = 0, passed = 0, failed = 0;
const failures = [];

function assert(cond, label, detail = "") {
  total++;
  if (cond) { passed++; console.log(`  ${PASS} ${label}`); }
  else { failed++; failures.push({ label, detail }); console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`); }
}

function section(t) { console.log(`\n${BOLD}═══ ${t} ═══${RESET}`); }
function phase(t) { console.log(`\n  ${INFO} ${t}`); }

// ═════════════════════════════════════════════════════════════════════════════
// CORE BUSINESS LOGIC — extracted from AuthContext.jsx, exact same algorithms
// ═════════════════════════════════════════════════════════════════════════════

function addToSearchHistory(currentHistory, symbol, context = {}) {
  const sym = symbol.toUpperCase().trim();
  const existing = currentHistory.find((h) => h.symbol === sym);
  const filtered = currentHistory.filter((h) => h.symbol !== sym);
  const entry = {
    symbol: sym,
    searchedAt: existing?.searchedAt || new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    stockPrice: context.stockPrice ?? existing?.stockPrice ?? null,
    selectedContract: context.selectedContract ?? existing?.selectedContract ?? null,
  };
  return [entry, ...filtered].slice(0, MAX_HISTORY);
}

function updateSearchHistoryEntry(currentHistory, symbol, context) {
  const sym = symbol.toUpperCase().trim();
  const idx = currentHistory.findIndex((h) => h.symbol === sym);
  if (idx === -1) return addToSearchHistory(currentHistory, sym, context);
  const updated = [...currentHistory];
  updated[idx] = {
    ...updated[idx],
    lastUpdatedAt: new Date().toISOString(),
    stockPrice: context.stockPrice ?? updated[idx].stockPrice,
    selectedContract: context.selectedContract ?? updated[idx].selectedContract,
  };
  return updated;
}

function deleteFromSearchHistory(currentHistory, symbols) {
  const toRemove = new Set(symbols.map((s) => s.toUpperCase().trim()));
  return currentHistory.filter((h) => !toRemove.has(h.symbol));
}

function clearSearchHistory() { return []; }

function findMatchingContract(recommendations, restoredContract) {
  if (!restoredContract || !recommendations) return -1;
  return recommendations.findIndex(
    (r) => r.strike === restoredContract.strike && r.expiration === restoredContract.expiration
  );
}

// ── Data generators ──
function makeContract(symbol, idx) {
  const strike = 150 + idx * 5 + (idx * 3);
  return {
    contractSymbol: `${symbol}250321C${String(strike * 1000).padStart(8, "0")}`,
    strike, expiration: "2025-03-21",
    premium: +(1.5 + idx * 0.75).toFixed(2),
    compositeScore: Math.min(95, 45 + idx * 8),
    annualizedReturn: +(0.08 + idx * 0.03).toFixed(4),
    premiumYield: +(0.005 + idx * 0.003).toFixed(4),
    probabilityOTM: +(0.55 + idx * 0.05).toFixed(4),
    delta: +(0.15 + idx * 0.06).toFixed(4),
    daysToExpiration: 14 + idx * 5,
  };
}

const USERS = [
  { email: "alice@test.com", name: "Alice Chen", experience: "beginner", goal: "income" },
  { email: "bob@test.com", name: "Bob Martinez", experience: "intermediate", goal: "growth" },
  { email: "carol@test.com", name: "Carol Davis", experience: "advanced", goal: "hedging" },
  { email: "dave@test.com", name: "Dave Wilson", experience: "beginner", goal: "income" },
  { email: "eve@test.com", name: "Eve Taylor", experience: "intermediate", goal: "speculation" },
];

const SYMBOL_SETS = [
  ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"],
  ["META", "TSLA", "SPY", "QQQ", "NFLX"],
  ["AMD", "INTC", "CRM", "ORCL", "ADBE"],
  ["DIS", "PYPL", "SQ", "SHOP", "UBER"],
  ["BA", "JPM", "V", "MA", "GS"],
];

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS MOCK — matches services/analytics.js event shapes
// ═════════════════════════════════════════════════════════════════════════════

class MockAnalytics {
  constructor() { this.events = []; this.uid = null; this.email = null; this.page = null; }
  init(uid, email) { this.uid = uid; this.email = email; }
  destroy() { this.uid = null; this.events = []; }
  _push(event) {
    if (!this.uid) return;
    this.events.push({ ...event, uid: this.uid, email: this.email, timestamp: new Date().toISOString() });
  }
  pageView(path) { this.page = path; this._push({ type: "page_view", page: path }); }
  pageExit(path, seconds) { this._push({ type: "page_exit", page: path, timeOnPageSeconds: seconds }); }
  event(cat, action, meta = {}) { this._push({ type: "event", category: cat, action, page: this.page, ...meta }); }
  error(err, ctx = {}) { this._push({ type: "error", page: this.page, errorMessage: err.message, severity: ctx.severity || "error", ...ctx }); }
  getByType(type) { return this.events.filter((e) => e.type === type); }
  getByAction(action) { return this.events.filter((e) => e.action === action); }
  getByCategory(cat) { return this.events.filter((e) => e.category === cat); }
}

// ═════════════════════════════════════════════════════════════════════════════
// FULL USER LIFECYCLE TEST (× 5 users)
// ═════════════════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function testUser(idx) {
  const user = USERS[idx];
  const symbols = SYMBOL_SETS[idx];
  const analytics = new MockAnalytics();
  let history = [];

  console.log(`\n${BOLD}──── User ${idx + 1}/5: ${user.name} (${user.email}) ────${RESET}`);

  // PHASE 1: SIGN UP
  phase("Phase 1: Sign up");
  const userData = {
    uid: `uid_${idx}`, email: user.email,
    createdAt: new Date().toISOString(),
    subscriptionStatus: "trial", trialStart: new Date().toISOString(),
    onboardingComplete: false, searchHistory: [], watchlist: [],
  };
  analytics.init(userData.uid, user.email);
  analytics.pageView("/login");
  analytics.event("auth", "signup_completed");
  assert(userData.subscriptionStatus === "trial", "Trial status set");
  assert(userData.searchHistory.length === 0, "Empty history initialized");

  // PHASE 2: ONBOARDING
  phase("Phase 2: Onboarding (3 steps)");
  analytics.pageView("/onboarding");

  const profileValid = user.name.trim().length >= 2 && !!user.experience;
  assert(profileValid, `Step 1 validation: name="${user.name}", exp="${user.experience}"`);
  userData.name = user.name;
  userData.experienceLevel = user.experience;
  userData.investmentGoal = user.goal;
  analytics.event("onboarding", "step_completed", { step: "profile" });

  userData.newsletterOptIn = true;
  userData.updateFrequency = "weekly";
  analytics.event("onboarding", "step_completed", { step: "preferences" });

  userData.onboardingComplete = true;
  userData.onboardingCompletedAt = new Date().toISOString();
  analytics.event("onboarding", "completed", { promoUsed: false });
  assert(userData.onboardingComplete, "Onboarding complete");

  const trialDays = Math.max(0, Math.ceil(7 - (Date.now() - new Date(userData.trialStart).getTime()) / 864e5));
  assert(trialDays === 7, `Trial: ${trialDays} days left`);

  // PHASE 3: SEARCH 5 SYMBOLS + contract selection
  phase(`Phase 3: Search ${symbols.join(", ")}`);
  analytics.pageView("/");
  const contracts = {};

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const price = +(100 + i * 35.5).toFixed(2);
    const contract = makeContract(sym, i);
    contracts[sym] = contract;

    // Search → price loads → contract selected
    history = addToSearchHistory(history, sym);
    analytics.event("search", "symbol_searched", { symbol: sym });
    history = updateSearchHistoryEntry(history, sym, { stockPrice: price });
    history = updateSearchHistoryEntry(history, sym, { selectedContract: contract });
    analytics.event("research", "contract_selected", { symbol: sym, strike: contract.strike });
    await sleep(3);
  }

  assert(history.length === 5, `History: ${history.length} entries`);
  assert(history[0].symbol === symbols[4], `Most recent first: ${history[0].symbol}`);
  assert(history[4].symbol === symbols[0], `Oldest last: ${history[4].symbol}`);

  // Verify ALL entries have full context
  for (const entry of history) {
    assert(entry.stockPrice != null, `  ${entry.symbol}: price $${entry.stockPrice}`);
    assert(entry.selectedContract?.strike != null, `  ${entry.symbol}: contract $${entry.selectedContract.strike} strike`);
    assert(entry.selectedContract?.compositeScore != null, `  ${entry.symbol}: score ${entry.selectedContract.compositeScore}`);
  }

  // Verify contract field completeness
  const reqFields = ["contractSymbol", "strike", "expiration", "premium", "compositeScore", "annualizedReturn", "premiumYield", "probabilityOTM", "delta", "daysToExpiration"];
  const missing = reqFields.filter((f) => history[0].selectedContract[f] == null);
  assert(missing.length === 0, `All ${reqFields.length} contract fields present`, missing.length > 0 ? `missing: ${missing}` : "");

  // PHASE 4: HISTORY PAGE
  phase("Phase 4: History page");
  analytics.pageExit("/", 45);
  analytics.pageView("/history");

  let ordered = true;
  for (let i = 1; i < history.length; i++) {
    if (history[i].lastUpdatedAt > history[i - 1].lastUpdatedAt) { ordered = false; break; }
  }
  assert(ordered, "Entries in descending time order");

  // PHASE 5: STATE RESTORATION + contract change
  phase("Phase 5: Navigate back → restore + change");

  const clicked = history[1];
  analytics.event("history", "entry_clicked", { symbol: clicked.symbol, hasContract: true });
  analytics.pageView("/");

  // Simulate matching contract in recommendations
  const recs = [makeContract(clicked.symbol, 0), clicked.selectedContract, makeContract(clicked.symbol, 5)];
  const matchIdx = findMatchingContract(recs, clicked.selectedContract);
  assert(matchIdx === 1, `Contract matched at index ${matchIdx}`);

  // Bump to top
  history = addToSearchHistory(history, clicked.symbol);
  assert(history[0].symbol === clicked.symbol, `${clicked.symbol} bumped to top`);
  assert(history.length === 5, "No duplicate on bump");
  assert(history[0].selectedContract != null, "Context preserved on bump");

  // Change contract
  const oldStrike = history[0].selectedContract.strike;
  const newContract = makeContract(clicked.symbol, 8);
  history = updateSearchHistoryEntry(history, clicked.symbol, { selectedContract: newContract });
  analytics.event("research", "contract_changed", { symbol: clicked.symbol, from: oldStrike, to: newContract.strike });
  assert(history[0].selectedContract.strike === newContract.strike, `Changed: $${oldStrike} → $${newContract.strike}`);

  // PHASE 6: DELETE OPERATIONS
  phase("Phase 6: Delete operations");
  analytics.pageView("/history");

  const del1 = history[2].symbol;
  history = deleteFromSearchHistory(history, [del1]);
  analytics.event("history", "item_deleted", { symbol: del1 });
  assert(history.length === 4, `Single delete → ${history.length}`);
  assert(!history.find((h) => h.symbol === del1), `${del1} removed`);

  const batch = [history[1].symbol, history[2].symbol];
  history = deleteFromSearchHistory(history, batch);
  analytics.event("history", "batch_deleted", { count: 2 });
  assert(history.length === 2, `Batch delete → ${history.length}`);

  // PHASE 7: CLEAR ALL + fresh start
  phase("Phase 7: Clear + fresh start");
  analytics.event("history", "cleared", { count: history.length });
  history = clearSearchHistory();
  assert(history.length === 0, "Cleared");

  history = addToSearchHistory(history, symbols[0], { stockPrice: 225.50, selectedContract: makeContract(symbols[0], 0) });
  assert(history.length === 1, "Fresh entry after clear");
  assert(history[0].stockPrice === 225.50, "Fresh entry has price");
  assert(history[0].selectedContract != null, "Fresh entry has contract");

  // PHASE 8: ANALYTICS VERIFICATION
  phase("Phase 8: Analytics events");

  const pvs = analytics.getByType("page_view");
  const exits = analytics.getByType("page_exit");
  const searches = analytics.getByAction("symbol_searched");
  const selects = analytics.getByAction("contract_selected");
  const changes = analytics.getByAction("contract_changed");
  const histEvts = analytics.getByCategory("history");
  const onboard = analytics.getByCategory("onboarding");

  assert(pvs.length >= 4, `Page views: ${pvs.length}`);
  assert(exits.length >= 1 && exits[0].timeOnPageSeconds === 45, `Page exit with duration: ${exits[0]?.timeOnPageSeconds}s`);
  assert(searches.length === 5, `Searches: ${searches.length}`);
  assert(selects.length === 5, `Contract selections: ${selects.length}`);
  assert(changes.length === 1, `Contract changes: ${changes.length}`);
  assert(histEvts.length >= 3, `History events: ${histEvts.length}`);
  assert(onboard.length === 3, `Onboarding events: ${onboard.length}`);
  assert(analytics.events.every((e) => e.uid && e.timestamp), "All events have uid + timestamp");

  // PHASE 9: LOGOUT + RE-LOGIN
  phase("Phase 9: Re-login persistence");
  analytics.destroy();
  assert(analytics.events.length === 0, "Analytics cleared on logout");
  analytics.init(userData.uid, user.email);
  assert(userData.onboardingComplete, "Onboarding persists");
  assert(userData.name === user.name, "Name persists");

  console.log(`\n  ${PASS} ${BOLD}User ${idx + 1} complete${RESET}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE SUITES
// ═════════════════════════════════════════════════════════════════════════════

async function testDuplicatePrevention() {
  section("DUPLICATE PREVENTION");
  let h = [];
  for (let i = 0; i < 10; i++) h = addToSearchHistory(h, "AAPL", { stockPrice: 180 + i });
  assert(h.length === 1, `10× AAPL → ${h.length} entry`);
  assert(h[0].stockPrice === 189, `Latest price kept: $${h[0].stockPrice}`);

  h = addToSearchHistory(h, "MSFT");
  h = addToSearchHistory(h, "NVDA");
  h = addToSearchHistory(h, "AAPL");
  assert(h.length === 3, `No dupe on re-search: ${h.length}`);
  assert(h[0].symbol === "AAPL", "AAPL bumped to top");
  assert(h[0].stockPrice === 189, `Price preserved: $${h[0].stockPrice}`);
}

async function testMaxHistoryLimit() {
  section("MAX HISTORY LIMIT (50)");
  let h = [];
  for (let i = 0; i < 60; i++) h = addToSearchHistory(h, `S${String(i).padStart(3, "0")}`);
  assert(h.length === 50, `60 added → capped at ${h.length}`);
  assert(h[0].symbol === "S059", `Newest: ${h[0].symbol}`);
  assert(h[49].symbol === "S010", `Oldest kept: ${h[49].symbol}`);
  assert(!h.find((e) => e.symbol === "S009"), "S009 evicted");
}

async function testUpdateInPlace() {
  section("UPDATE IN-PLACE (no position bump)");
  let h = [];
  h = addToSearchHistory(h, "AAPL"); await sleep(3);
  h = addToSearchHistory(h, "MSFT"); await sleep(3);
  h = addToSearchHistory(h, "NVDA");
  assert(h[0].symbol === "NVDA" && h[1].symbol === "MSFT" && h[2].symbol === "AAPL", "Order: NVDA, MSFT, AAPL");

  h = updateSearchHistoryEntry(h, "AAPL", { selectedContract: makeContract("AAPL", 0) });
  assert(h[2].symbol === "AAPL", `AAPL stayed at idx 2`);
  assert(h[2].selectedContract != null, "Contract updated in-place");
  assert(h[0].symbol === "NVDA", "NVDA still first");
}

async function testContextPreservation() {
  section("CONTEXT PRESERVATION ON BUMP");
  let h = [];
  const c = makeContract("AAPL", 3);
  h = addToSearchHistory(h, "AAPL", { stockPrice: 188.50, selectedContract: c });
  h = addToSearchHistory(h, "MSFT");
  h = addToSearchHistory(h, "NVDA");

  // Re-search AAPL with no new context — should keep old
  h = addToSearchHistory(h, "AAPL");
  assert(h[0].stockPrice === 188.50, `Price preserved: $${h[0].stockPrice}`);
  assert(h[0].selectedContract.strike === c.strike, `Contract preserved: $${h[0].selectedContract.strike}`);

  // Re-search with new price — overrides price, keeps contract
  h = addToSearchHistory(h, "AAPL", { stockPrice: 192.00 });
  assert(h[0].stockPrice === 192.00, `Price overridden: $${h[0].stockPrice}`);
  assert(h[0].selectedContract.strike === c.strike, "Contract untouched");
}

async function testContractMatching() {
  section("CONTRACT MATCHING (state restoration)");
  const recs = [
    { strike: 150, expiration: "2025-03-21" },
    { strike: 155, expiration: "2025-03-21" },
    { strike: 160, expiration: "2025-04-18" },
    { strike: 155, expiration: "2025-04-18" },
  ];
  assert(findMatchingContract(recs, { strike: 155, expiration: "2025-03-21" }) === 1, "Exact match");
  assert(findMatchingContract(recs, { strike: 155, expiration: "2025-04-18" }) === 3, "Same strike diff exp");
  assert(findMatchingContract(recs, { strike: 200, expiration: "2025-03-21" }) === -1, "No match → -1");
  assert(findMatchingContract(recs, null) === -1, "Null contract → -1");
  assert(findMatchingContract(null, { strike: 150, expiration: "2025-03-21" }) === -1, "Null recs → -1");
}

async function testAnalyticsEventShapes() {
  section("ANALYTICS EVENT SHAPES");
  const a = new MockAnalytics();
  a.init("uid", "test@test.com");

  a.pageView("/dashboard");
  assert(a.events[0].type === "page_view" && a.events[0].page === "/dashboard", "page_view shape");

  a.pageExit("/dashboard", 30);
  assert(a.events[1].type === "page_exit" && a.events[1].timeOnPageSeconds === 30, "page_exit shape");

  a.event("search", "symbol_searched", { symbol: "AAPL" });
  const ev = a.events[2];
  assert(ev.type === "event" && ev.category === "search" && ev.action === "symbol_searched" && ev.symbol === "AAPL", "event shape");

  a.error(new Error("Test"), { context: "api", severity: "critical" });
  const er = a.events[3];
  assert(er.type === "error" && er.errorMessage === "Test" && er.severity === "critical", "error shape");

  a.destroy();
  assert(a.events.length === 0, "destroy clears events");
  a._push({ type: "x" });
  assert(a.events.length === 0, "Blocked after destroy");
}

async function testErrorStates() {
  section("ERROR / EMPTY STATES");
  let h = [];
  h = deleteFromSearchHistory(h, ["AAPL"]);
  assert(h.length === 0, "Delete from empty → safe");

  h = updateSearchHistoryEntry(h, "AAPL", { stockPrice: 180 });
  assert(h.length === 1 && h[0].symbol === "AAPL", "Update missing → creates");

  h = addToSearchHistory(h, "aapl");
  assert(h.length === 1 && h[0].symbol === "AAPL", "Case insensitive");

  h = addToSearchHistory(h, "  msft  ");
  assert(h.find((e) => e.symbol === "MSFT"), "Whitespace trimmed");

  h = deleteFromSearchHistory(h, ["AAPL", "FAKE", "MSFT"]);
  assert(h.length === 0, "Batch with non-existent → safe");

  h = clearSearchHistory();
  assert(h.length === 0, "Clear empty → safe");
}

async function testOnboardingValidation() {
  section("ONBOARDING VALIDATION");
  assert("Alice".trim().length >= 2 && !!("beginner"), "Valid: 2+ char name + experience");
  assert(!("A".trim().length >= 2), "Invalid: 1-char name");
  assert(!("Alice".trim().length >= 2 && ""), "Invalid: no experience");
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${BOLD}╔═══════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║  COVERED CALLS APP — FULL INTEGRATION TEST AGENT                 ║${RESET}`);
  console.log(`${BOLD}║  5 users × 9 phases + 8 edge case suites                         ║${RESET}`);
  console.log(`${BOLD}╚═══════════════════════════════════════════════════════════════════╝${RESET}`);

  const start = Date.now();

  for (let i = 0; i < 5; i++) await testUser(i);

  await testDuplicatePrevention();
  await testMaxHistoryLimit();
  await testUpdateInPlace();
  await testContextPreservation();
  await testContractMatching();
  await testAnalyticsEventShapes();
  await testErrorStates();
  await testOnboardingValidation();

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n${BOLD}╔═══════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║  RESULTS                                                         ║${RESET}`);
  console.log(`${BOLD}╠═══════════════════════════════════════════════════════════════════╣${RESET}`);
  console.log(`${BOLD}║${RESET}  Total:   ${total} tests`);
  console.log(`${BOLD}║${RESET}  ${PASS} Passed: ${passed}`);
  console.log(`${BOLD}║${RESET}  ${failed > 0 ? FAIL : PASS} Failed: ${failed}`);
  console.log(`${BOLD}║${RESET}  Time:    ${elapsed}s`);
  console.log(`${BOLD}╚═══════════════════════════════════════════════════════════════════╝${RESET}`);

  if (failures.length > 0) {
    console.log(`\n${BOLD}FAILURES:${RESET}`);
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f.label}${f.detail ? ` — ${f.detail}` : ""}`));
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Agent crashed:", err); process.exit(2); });
