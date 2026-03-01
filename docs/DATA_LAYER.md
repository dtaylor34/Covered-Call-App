# Data Layer Architecture — Covered Calls Manager

> **Status:** Active — Phase 1 (Yahoo Finance)
> **Current Provider:** Yahoo Finance via `yahoo-finance2`
> **Last Updated:** 2026-02-27
> **Cursor:** Read this file before writing any code that touches market data,
> options chains, stock prices, Greeks, or the covered call scoring engine.

---

## 1. Design Principle: Provider-Agnostic Architecture

The data layer is designed so that **no frontend code ever knows which data
provider is active**. All market data flows through a single abstraction layer
in Cloud Functions. Swapping providers is a backend-only change — the React
frontend, Firestore schema, and user-facing features remain untouched.

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                          │
│                                                                │
│   useMarketData(symbol)     useOptionsChain(symbol, expiry)   │
│   useCoveredCallScores(symbol)    useWatchlist()              │
│                                                                │
│   These hooks call Cloud Functions. They never import          │
│   provider-specific code. They never know where data           │
│   comes from. They receive a standardized shape.               │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTPS callable / REST
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                 CLOUD FUNCTIONS (Node.js)                      │
│                                                                │
│   functions/                                                   │
│   ├── api/                                                     │
│   │   ├── getQuote.js           ← Stock price + basic info    │
│   │   ├── getOptionsChain.js    ← Full chain for a symbol     │
│   │   ├── getCoveredCalls.js    ← Scored recommendations      │
│   │   └── getWatchlistData.js   ← Batch quotes for watchlist  │
│   │                                                            │
│   ├── providers/                ← PROVIDER ABSTRACTION         │
│   │   ├── index.js              ← Reads ACTIVE_PROVIDER env   │
│   │   ├── yahoo.js              ← Phase 1 (free)              │
│   │   ├── polygon.js            ← Phase 2 (paid, scaled)      │
│   │   └── tradier.js            ← Phase 3 alt (brokerage)     │
│   │                                                            │
│   ├── engine/                   ← CALCULATIONS (provider-free) │
│   │   ├── greeks.js             ← Black-Scholes calculator    │
│   │   ├── scoring.js            ← Covered call ranker         │
│   │   └── riskFreeRate.js       ← Treasury rate fetcher       │
│   │                                                            │
│   └── cache/                    ← CACHING LAYER               │
│       └── firestore.js          ← Read/write cached data      │
└──────────────────────────────────────────────────────────────┘
```

### The Golden Rule

> **Cursor:** If you are writing code that fetches stock or options data,
> it MUST go through `functions/providers/index.js`. Never import a specific
> provider (yahoo.js, polygon.js) directly from API endpoints or frontend code.
> The provider index reads `ACTIVE_PROVIDER` from environment config and
> delegates to the correct module.

---

## 2. Standardized Data Shapes

All providers must return data in these exact shapes. When adding a new
provider, map their API response to these structures. The frontend and
scoring engine depend on these shapes — they are the contract.

### 2.1 StockQuote

```javascript
{
  symbol: "AAPL",                    // Ticker symbol
  price: 228.50,                     // Current or delayed price
  change: 2.35,                      // Dollar change today
  changePercent: 1.04,               // Percent change today
  open: 226.15,                      // Today's open
  high: 229.80,                      // Today's high
  low: 225.90,                       // Today's low
  previousClose: 226.15,             // Yesterday's close
  volume: 45230000,                  // Shares traded today
  marketCap: 3520000000000,          // Market cap
  fiftyTwoWeekHigh: 260.10,          // 52-week high
  fiftyTwoWeekLow: 164.08,          // 52-week low
  dividendYield: 0.0044,             // Annual dividend yield (decimal)
  earningsDate: "2026-04-25",        // Next earnings date (ISO string or null)
  delay: 15,                         // Data delay in minutes (0 = real-time)
  provider: "yahoo",                 // Which provider served this
  fetchedAt: "2026-02-27T15:30:00Z"  // When we fetched it (ISO)
}
```

### 2.2 OptionsChain

```javascript
{
  symbol: "AAPL",
  underlyingPrice: 228.50,
  expirations: ["2026-03-06", "2026-03-13", "2026-03-20", ...],
  chain: {
    "2026-03-20": {
      calls: [
        {
          contractSymbol: "AAPL260320C00230000",
          strike: 230.00,
          expiration: "2026-03-20",
          type: "call",
          lastPrice: 3.45,
          bid: 3.40,
          ask: 3.50,
          volume: 12500,
          openInterest: 45000,
          impliedVolatility: 0.2845,  // Decimal (28.45%)

          // Greeks (calculated by engine/greeks.js if provider doesn't supply)
          delta: 0.42,
          gamma: 0.035,
          theta: -0.15,
          vega: 0.28,
          rho: 0.08,

          inTheMoney: false,
          daysToExpiration: 21
        },
        // ... more strikes
      ],
      puts: [
        // Same shape as calls with type: "put"
      ]
    }
  },
  delay: 15,
  provider: "yahoo",
  fetchedAt: "2026-02-27T15:30:00Z"
}
```

### 2.3 CoveredCallScore

```javascript
{
  symbol: "AAPL",
  underlyingPrice: 228.50,
  recommendations: [
    {
      contractSymbol: "AAPL260320C00230000",
      strike: 230.00,
      expiration: "2026-03-20",
      premium: 3.45,                    // Premium per share
      premiumYield: 0.0151,             // Premium / underlying price (1.51%)
      annualizedReturn: 0.2625,         // Annualized if repeated (26.25%)
      maxProfit: 4.95,                  // (strike - price) + premium
      maxProfitPercent: 0.0217,         // Max profit / underlying price
      downProtection: 0.0151,           // Premium / underlying price
      probabilityOTM: 0.58,             // 1 - delta (rough estimate)
      daysToExpiration: 21,
      breakeven: 225.05,                // Underlying price - premium
      compositeScore: 82,               // 0-100 weighted score

      // Score components (for transparency / education)
      scores: {
        yield: 85,                      // Premium yield vs. peers
        safety: 78,                     // How far OTM + IV assessment
        probability: 80,               // Likelihood of expiring OTM
        timeValue: 84                   // Theta decay efficiency
      }
    },
    // ... ranked by compositeScore descending
  ],
  delay: 15,
  provider: "yahoo",
  scoredAt: "2026-02-27T15:30:00Z"
}
```

---

## 3. Provider Implementations

### 3.1 Phase 1 — Yahoo Finance (ACTIVE)

**Status:** Current active provider
**Cost:** $0/month
**Package:** `yahoo-finance2` (npm)
**Data recency:** 15-minute delayed
**Greeks:** Calculated locally via Black-Scholes (yahoo provides IV)
**Rate limits:** Unofficial — keep requests under 2/second to avoid blocks
**Best for:** 0–2,000 users, development, educational use

#### What Yahoo Provides
- Stock quotes (price, change, volume, market cap, 52-week range)
- Options chain (all expirations, all strikes, bid/ask/last, IV, volume, OI)
- Historical price data (daily/weekly/monthly candles)
- Dividend yield and earnings dates

#### What Yahoo Does NOT Provide
- Pre-calculated Greeks (we calculate via Black-Scholes)
- WebSocket streaming (we poll on a schedule)
- SLA or uptime guarantee (unofficial scraping layer)
- Formal redistribution rights (educational gray area — see Section 6)

#### Implementation Notes
```
Provider file: functions/providers/yahoo.js
NPM package:  yahoo-finance2
Key methods:
  - quoteSummary(symbol)           → StockQuote shape
  - options(symbol)                → raw chain, map to OptionsChain shape
  - historical(symbol, options)    → OHLC bars for backtesting
```

#### Caching Strategy (Yahoo)
- Stock quotes: Cache in Firestore for **60 seconds**
- Options chains: Cache in Firestore for **5 minutes**
  (Options data doesn't change meaningfully faster than this for education)
- Historical data: Cache for **24 hours** (EOD data)
- Covered call scores: Cache for **5 minutes** (recalculate on chain refresh)

#### Failure Handling
Yahoo's unofficial API can break without notice. The provider must:
1. Wrap all calls in try/catch
2. Return cached data if Yahoo is down (with `stale: true` flag)
3. Log failures to Firestore `systemLog` collection
4. Set a `providerStatus` doc in Firestore that the admin panel can display
5. Never crash the Cloud Function — always return something

---

### 3.2 Phase 2 — Polygon / Massive (FUTURE — Paid Scaling)

**Status:** Future — activate when revenue exceeds data cost
**Trigger:** ~200+ paying subscribers ($2,000+/month revenue)
**Cost:** $29–199/month (Individual) → $1,999/month (Business at scale)
**Package:** `@polygon.io/client-js` (npm — rebranded to Massive)
**Data recency:** 15-minute delayed (Starter/Developer) or real-time (Advanced/Business)
**Greeks:** Provided by Polygon on paid plans
**Rate limits:** Unlimited API calls on all paid plans
**Best for:** 200–20,000+ users, production scale

#### Polygon Tier Progression

| Stage | Plan | Monthly | Data | When to Use |
|-------|------|---------|------|-------------|
| Testing | Individual Basic | $0 | EOD only, 5 calls/min | API exploration only |
| Early paid | Individual Starter | $29 | 15-min delayed, WebSocket | First 200 users |
| Growing | Individual Developer | $79 | 15-min delayed + trades | Up to 500 users (personal use terms) |
| Scaling | Options Business | $1,999 | Real-time, redistribution rights | 200+ paying users |
| Enterprise | Custom | Contact sales | SLA, dedicated support | 5,000+ users |

**Important licensing note:** Individual plans are labeled "personal,
non-business use." Once you are displaying data to paying subscribers,
you need the Business plan. The Business plan includes OPRA licensing —
no separate exchange fees or approvals needed.

**Startup discount:** Polygon offers up to 50% off year one for startups.
Email sales@massive.com when ready. Explain: educational paper-trading app,
non-transactional, options chain display with scoring engine.

#### Implementation Notes
```
Provider file: functions/providers/polygon.js
NPM package:  @polygon.io/client-js
API key:      Store in Firebase environment config (never in code)
Key methods:
  - restClient.stocks.snapshotTicker(symbol)     → StockQuote shape
  - restClient.options.snapshotOptionChain(symbol) → OptionsChain shape
  - websocket (options/stocks) → real-time streaming (Business plan)
```

#### Caching Strategy (Polygon)
- On Starter/Developer (delayed): Same as Yahoo — 60s quotes, 5min chains
- On Business (real-time): Quote cache 10 seconds, chain cache 30 seconds
- Use Redis (Cloud Memorystore) when on Business plan for sub-second reads

#### Migration Checklist (Yahoo → Polygon)
1. Install `@polygon.io/client-js`
2. Add `POLYGON_API_KEY` to Firebase environment config
3. Implement `functions/providers/polygon.js` mapping to standard shapes
4. Set `ACTIVE_PROVIDER=polygon` in environment config
5. Deploy Cloud Functions only (`firebase deploy --only functions`)
6. Frontend unchanged — zero code changes needed
7. Verify in admin panel that `providerStatus` shows Polygon active
8. Update CHANGELOG.md

---

### 3.3 Phase 3 (Alternative) — Tradier

**Status:** Alternative option — evaluate if Polygon pricing doesn't fit
**Cost:** $10/month (Pro brokerage account gives API access)
**Package:** REST API (no official npm SDK — use fetch)
**Data recency:** Real-time for brokerage account holders
**Greeks:** Provided via ORATS integration
**Rate limits:** 120 requests/minute
**Best for:** Budget-conscious scaling, real-time data at low cost

#### Why Tradier Is Interesting
Tradier is a brokerage that exposes its entire platform via API. If you
(the developer) open a Pro account ($10/month), you get full API access
to real-time stock quotes, options chains with Greeks, streaming via
WebSocket, and a paper trading sandbox. Your app's users don't need
Tradier accounts — you're using the API as a data feed.

**The gray area:** Tradier's terms say real-time data is for "Tradier
Brokerage account holders." Using one account to feed data to an app
with thousands of users is not explicitly covered. For an educational
app with 15-minute delayed display, this is lower risk. For real-time
redistribution at scale, you'd want to contact their sales team
(they actively court fintech integrations).

#### Implementation Notes
```
Provider file: functions/providers/tradier.js
Base URL:     https://api.tradier.com/v1
Auth:         Bearer token in Authorization header
Key methods:
  - GET /markets/quotes?symbols=AAPL            → StockQuote shape
  - GET /markets/options/chains?symbol=AAPL      → OptionsChain shape
  - GET /markets/options/expirations?symbol=AAPL → available expirations
  - WebSocket: wss://ws.tradier.com/v1/markets/events → streaming
```

#### Migration Checklist (Any Provider → Tradier)
1. Add `TRADIER_API_KEY` to Firebase environment config
2. Implement `functions/providers/tradier.js` mapping to standard shapes
3. Set `ACTIVE_PROVIDER=tradier` in environment config
4. Deploy Cloud Functions only
5. Frontend unchanged

---

## 4. Greeks Calculator (Provider-Independent)

The Greeks engine lives in `functions/engine/greeks.js` and is always
available regardless of which provider is active. Some providers supply
Greeks (Polygon, Tradier) — if they do, we use theirs. If not (Yahoo),
we calculate from the data they do provide.

### Black-Scholes Implementation

The engine calculates five Greeks from these inputs:
- **S** — Current stock price (from quote)
- **K** — Strike price (from options chain)
- **T** — Time to expiration in years (calculated from expiration date)
- **r** — Risk-free rate (fetched from US Treasury, cached 24 hours)
- **σ (sigma)** — Implied volatility (from options chain — all providers supply this)

Output:
- **Delta** — Price sensitivity to $1 move in underlying
- **Gamma** — Rate of change of delta
- **Theta** — Time decay per day (negative for long options)
- **Vega** — Sensitivity to 1% change in IV
- **Rho** — Sensitivity to 1% change in interest rates

### Logic in Provider Index

```javascript
// In functions/providers/index.js
async function getOptionsChain(symbol, expiration) {
  const provider = getActiveProvider();
  const raw = await provider.fetchOptionsChain(symbol, expiration);

  // If provider supplies Greeks, use them
  if (raw.hasGreeks) {
    return raw;
  }

  // Otherwise calculate from IV (all providers supply IV)
  const riskFreeRate = await getRiskFreeRate();
  return enrichWithGreeks(raw, riskFreeRate);
}
```

**Cursor:** Never remove the local Greeks calculator, even when using
a provider that supplies Greeks. It serves as a fallback and is valuable
for the educational "show your work" feature (users can see HOW Greeks
are calculated).

---

## 5. Covered Call Scoring Engine

The scoring engine lives in `functions/engine/scoring.js` and is the
core intellectual property of the app. It ranks covered call opportunities
by multiple factors and produces a composite score (0–100).

### Scoring Factors

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Premium Yield | 30% | Premium ÷ stock price — higher is better |
| Annualized Return | 20% | Yield extrapolated to annual — rewards shorter expirations |
| Probability OTM | 20% | 1 − delta — likelihood stock stays below strike |
| Downside Protection | 15% | Premium ÷ stock price — buffer before loss |
| Time Value Efficiency | 15% | Theta ÷ premium — how fast time decay works for seller |

### Filters (Pre-Scoring)

Before scoring, filter out contracts that don't make sense for covered calls:
- Only calls (never score puts for covered call strategy)
- Only OTM or slightly ITM (strike ≥ 95% of current price)
- Minimum open interest of 100 (liquidity check)
- Minimum volume of 10 today (avoid stale quotes)
- Expiration between 7 and 60 days out (sweet spot for covered calls)

### Educational Transparency

The scoring engine exposes all its math. Each recommendation includes:
- The composite score (0–100)
- Individual factor scores
- The raw numbers behind each factor
- A plain-English summary ("This call offers 1.5% yield with 58% chance
  of expiring worthless, giving you $3.45/share in premium income")

This is what users pay $10/month for — not raw data (anyone can get that),
but the analysis, ranking, and education around it.

---

## 6. Compliance & Licensing Notes

### Educational Use Positioning

This application is explicitly educational and non-transactional:
- No real trades are executed
- No brokerage accounts are connected
- No order routing or execution
- Simulated/paper trades only
- Required disclaimers displayed (see PRD Section 10)

### Data Source Compliance by Phase

| Phase | Provider | Data Delay | Redistribution | OPRA Status | Notes |
|-------|----------|-----------|----------------|-------------|-------|
| 1 | Yahoo Finance | 15-min | Gray area (unofficial API) | Not applicable (Yahoo handles) | Thousands of edu apps use this model. No formal agreement. Risk: API breakage, not legal action for edu use. |
| 2 | Polygon Individual | 15-min | Not permitted for business use | Covered by Polygon | Fine for development/testing. Must upgrade to Business before serving paying users at scale. |
| 2+ | Polygon Business | Real-time | Fully permitted | Included — no exchange fees | $1,999/month includes all OPRA licensing. Full redistribution rights to your app's users. |
| 3 | Tradier | Real-time | Contact sales for edu/fintech terms | Handled by Tradier | $10/month gets API access. For redistribution at scale, discuss with their fintech team. |

### OPRA (Options Price Reporting Authority)

All US options data originates from OPRA. Key facts for our situation:
- Redistributing real-time OPRA data requires a Vendor Agreement ($1,500/mo baseline)
  PLUS per-user fees ($1.25/mo non-professional, $31.50/mo professional)
- Redistributing DELAYED data (15-min+) has NO per-user fees
  (still needs vendor agreement for formal compliance)
- Using a Business-tier provider like Polygon INCLUDES OPRA licensing —
  you do not need a separate vendor agreement
- For educational apps using unofficial data (Yahoo), OPRA enforcement
  has not historically targeted non-transactional educational tools

**Bottom line:** Start with Yahoo (free, educational). When revenue
justifies it, move to Polygon Business (fully compliant, all-inclusive).

---

## 7. Caching Architecture

### Why Cache Aggressively

- Reduces API calls (stay under rate limits, lower costs)
- Faster response times for users (Firestore reads: ~50ms vs API calls: ~500ms)
- Resilience — cached data survives provider outages
- Multiple users requesting the same symbol get one API call, not thousands

### Cache Locations by Scale

| Scale | Quote Cache | Chain Cache | Score Cache | Technology |
|-------|------------|-------------|-------------|------------|
| 0–500 users | Firestore | Firestore | Firestore | Cloud Functions only |
| 500–2,000 | Firestore | Firestore | Firestore | Cloud Functions + scheduled refresh |
| 2,000–10,000 | Redis | Firestore | Firestore | Cloud Run + Redis + scheduled refresh |
| 10,000+ | Redis | Redis | Firestore | Cloud Run + Redis + Realtime DB for prices |

### Cache Key Schema (Firestore)

```
marketData/
  quotes/{symbol}                 → StockQuote + fetchedAt + ttl
  chains/{symbol}:{expiration}    → OptionsChain + fetchedAt + ttl
  scores/{symbol}                 → CoveredCallScore + scoredAt + ttl
  meta/riskFreeRate               → { rate, fetchedAt }
  meta/providerStatus             → { provider, status, lastSuccess, lastError }
```

### Cache Invalidation Rules

- Quotes: Stale after 60 seconds (Yahoo) or 10 seconds (Polygon Business)
- Chains: Stale after 5 minutes (Yahoo) or 30 seconds (Polygon Business)
- Scores: Recalculate when chain cache refreshes
- Risk-free rate: Refresh once per 24 hours
- All caches: Serve stale data with `stale: true` flag if provider is down

---

## 8. Scaling Roadmap

### Stage 1: Cloud Functions Only (0–2,000 users)

```
User → Cloud Function → Check Firestore cache → Cache hit? Return it.
                                               → Cache miss? Call Yahoo → Cache → Return.
```

- Scheduled function runs every 5 minutes during market hours
- Refreshes data for all symbols on users' watchlists
- Individual user requests always read from cache (fast)
- Cost: ~$5–15/month (Cloud Functions execution)

### Stage 2: Scheduled Refresh + Polygon (2,000–5,000 users)

```
Scheduled job (every 30s) → Polygon API → Firestore cache
User → Cloud Function → Read from Firestore cache (always fast)
```

- Pub/Sub scheduled function polls Polygon for top watched symbols
- Users never wait for an API call — always reading cached data
- Cost: ~$100–300/month (Polygon Starter + Cloud Functions)

### Stage 3: Cloud Run + Redis + WebSocket (5,000–20,000 users)

```
Cloud Run server ──WebSocket──→ Polygon (stock prices)
                  ──REST poll──→ Polygon (options chains every 30s)
                  ──writes to──→ Redis (hot cache)
                  ──writes to──→ Firebase Realtime DB (price fan-out)
                  ──writes to──→ Firestore (chains + scores)

Users ──listen──→ Firebase Realtime DB (live prices)
      ──read──→ Firestore (chains + scores, auto-cached client-side)
      ──receive──→ FCM push notifications (alert thresholds)
```

- One persistent server process consuming Polygon WebSocket
- Redis for sub-second cache reads on hot data
- Firebase Realtime DB fans out price updates to all connected users
- Firestore for options chains (less frequent updates)
- FCM for push alerts when covered call scores exceed user thresholds
- Cost: ~$4,000–4,500/month (Polygon Business + Cloud Run + Redis)

---

## 9. Environment Configuration

### Required Environment Variables

```bash
# Active provider (controls which module is used)
ACTIVE_PROVIDER=yahoo          # Options: yahoo, polygon, tradier

# Yahoo (Phase 1) — no API key needed
# yahoo-finance2 uses public endpoints

# Polygon (Phase 2+)
POLYGON_API_KEY=               # From massive.com/dashboard

# Tradier (Phase 3 alternative)
TRADIER_API_KEY=               # From web.tradier.com/user/api
TRADIER_SANDBOX=true           # true for paper trading sandbox

# Caching
CACHE_QUOTE_TTL=60             # Seconds before quote is stale
CACHE_CHAIN_TTL=300            # Seconds before chain is stale
CACHE_SCORE_TTL=300            # Seconds before scores are stale

# Scoring engine
SCORING_MIN_OI=100             # Minimum open interest filter
SCORING_MIN_VOLUME=10          # Minimum daily volume filter
SCORING_MIN_DTE=7              # Minimum days to expiration
SCORING_MAX_DTE=60             # Maximum days to expiration
```

### Setting Environment Variables

```bash
# Firebase Functions environment config
firebase functions:config:set \
  market.active_provider="yahoo" \
  market.polygon_api_key="YOUR_KEY" \
  market.tradier_api_key="YOUR_KEY" \
  market.cache_quote_ttl="60" \
  market.cache_chain_ttl="300"
```

---

## 10. Adding a New Provider

When adding a provider that doesn't exist yet, follow this checklist:

1. Create `functions/providers/{name}.js`
2. Implement three required methods:
   - `fetchQuote(symbol)` → returns StockQuote shape (Section 2.1)
   - `fetchOptionsChain(symbol, expiration)` → returns OptionsChain shape (Section 2.2)
   - `fetchExpirations(symbol)` → returns array of ISO date strings
3. Set `hasGreeks: true/false` on the chain response
   (if false, the provider index will calculate Greeks automatically)
4. Add the provider name to the switch statement in `functions/providers/index.js`
5. Add the required environment variables to Section 9
6. Add a migration checklist to Section 3
7. Test locally against Firebase Emulators
8. Update this document with the new provider's details
9. Update `docs/CHANGELOG.md`

**Cursor:** When asked to add a new data provider, follow this checklist
exactly. The standard data shapes in Section 2 are the contract — the new
provider must output these shapes, not invent new ones.

---

## 11. File Map

```
functions/
├── api/
│   ├── getQuote.js              ← Callable: returns StockQuote
│   ├── getOptionsChain.js       ← Callable: returns OptionsChain
│   ├── getCoveredCalls.js       ← Callable: returns CoveredCallScore
│   ├── getWatchlistData.js      ← Callable: batch quotes for watchlist
│   └── refreshMarketData.js     ← Scheduled: refreshes cache for active symbols
│
├── providers/
│   ├── index.js                 ← Router: reads ACTIVE_PROVIDER, delegates
│   ├── yahoo.js                 ← Phase 1: yahoo-finance2
│   ├── polygon.js               ← Phase 2: @polygon.io/client-js
│   └── tradier.js               ← Phase 3: REST fetch wrapper
│
├── engine/
│   ├── greeks.js                ← Black-Scholes Greek calculator
│   ├── scoring.js               ← Covered call composite scorer
│   └── riskFreeRate.js          ← US Treasury rate fetcher (cached 24h)
│
└── cache/
    └── firestore.js             ← Cache read/write with TTL logic
```

---

## 12. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-27 | Start with Yahoo Finance | Free, provides options chains with IV, sufficient for educational MVP. Greeks calculated locally via Black-Scholes. |
| 2026-02-27 | Provider-agnostic architecture | Avoid lock-in. Provider swap = 1 env var change + deploy functions. Frontend never changes. |
| 2026-02-27 | Calculate Greeks locally | Yahoo doesn't provide them. But even when using Polygon/Tradier (which do), keep local calculator as fallback and educational feature. |
| 2026-02-27 | 15-minute delayed data is sufficient | Educational/paper-trading app. Covered call evaluation doesn't require sub-second data. Delayed data avoids OPRA per-user fees. |
| 2026-02-27 | Cache in Firestore first, Redis later | Firestore is already in the stack. Redis adds infrastructure cost. Move to Redis when Firestore read costs exceed Redis hosting cost (~2,000+ users). |
| 2026-02-27 | Polygon Business plan at scale | Only provider that bundles OPRA licensing into the price. No separate vendor agreement needed. Startup discount available. |
