// ─── src/data/coveredCallUniverse.js ─────────────────────────────────────────
// The curated covered-call universe: the broad-market indexes (via their liquid
// ETF proxies), key Technology and Healthcare sector ETFs, and the most liquid,
// optionable large/mid-cap Technology and Healthcare single names. This is the
// single source of truth for (a) the dashboard symbol dropdown and (b) what the
// daily history collector tracks when you seed the registry.
//
// Kept deliberately to ~180 names — comprehensive for covered calls in these
// sectors while staying under the daily-collection rate-limit ceiling.
//
//   type:   "Index" | "ETF" | "Stock"   (drives the dropdown category filter)
//   sector: "Index" | "Technology" | "Healthcare"
// ─────────────────────────────────────────────────────────────────────────────

const row = (symbol, name, type, sector) => ({ symbol, name, type, sector });

// ── Broad-market indexes (optionable ETF proxies) ──
const INDEXES = [
  row("SPY", "SPDR S&P 500 ETF", "Index", "Index"),
  row("VOO", "Vanguard S&P 500 ETF", "Index", "Index"),
  row("IVV", "iShares Core S&P 500 ETF", "Index", "Index"),
  row("QQQ", "Invesco Nasdaq-100 ETF", "Index", "Index"),
  row("DIA", "SPDR Dow Jones Industrial Average ETF", "Index", "Index"),
  row("IWM", "iShares Russell 2000 ETF", "Index", "Index"),
  row("VTI", "Vanguard Total Stock Market ETF", "Index", "Index"),
  row("RSP", "Invesco S&P 500 Equal Weight ETF", "Index", "Index"),
];

// ── Technology & Healthcare sector / thematic ETFs ──
const SECTOR_ETFS = [
  row("XLK", "Technology Select Sector SPDR", "ETF", "Technology"),
  row("VGT", "Vanguard Information Technology ETF", "ETF", "Technology"),
  row("IYW", "iShares U.S. Technology ETF", "ETF", "Technology"),
  row("SMH", "VanEck Semiconductor ETF", "ETF", "Technology"),
  row("SOXX", "iShares Semiconductor ETF", "ETF", "Technology"),
  row("XLC", "Communication Services Select Sector SPDR", "ETF", "Technology"),
  row("SKYY", "First Trust Cloud Computing ETF", "ETF", "Technology"),
  row("HACK", "Amplify Cybersecurity ETF", "ETF", "Technology"),
  row("BOTZ", "Global X Robotics & AI ETF", "ETF", "Technology"),
  row("ARKK", "ARK Innovation ETF", "ETF", "Technology"),
  row("XLV", "Health Care Select Sector SPDR", "ETF", "Healthcare"),
  row("VHT", "Vanguard Health Care ETF", "ETF", "Healthcare"),
  row("IBB", "iShares Biotechnology ETF", "ETF", "Healthcare"),
  row("XBI", "SPDR S&P Biotech ETF", "ETF", "Healthcare"),
  row("IHI", "iShares U.S. Medical Devices ETF", "ETF", "Healthcare"),
];

// ── Technology single names ──
const TECH = [
  ["AAPL", "Apple Inc."], ["MSFT", "Microsoft Corp."], ["NVDA", "NVIDIA Corp."],
  ["GOOGL", "Alphabet Inc. (Class A)"], ["GOOG", "Alphabet Inc. (Class C)"], ["AMZN", "Amazon.com Inc."],
  ["META", "Meta Platforms Inc."], ["AVGO", "Broadcom Inc."], ["TSLA", "Tesla Inc."],
  ["ORCL", "Oracle Corp."], ["CRM", "Salesforce Inc."], ["AMD", "Advanced Micro Devices"],
  ["ADBE", "Adobe Inc."], ["CSCO", "Cisco Systems Inc."], ["ACN", "Accenture plc"],
  ["INTC", "Intel Corp."], ["QCOM", "Qualcomm Inc."], ["TXN", "Texas Instruments"],
  ["IBM", "International Business Machines"], ["NOW", "ServiceNow Inc."], ["INTU", "Intuit Inc."],
  ["AMAT", "Applied Materials Inc."], ["MU", "Micron Technology"], ["LRCX", "Lam Research Corp."],
  ["ADI", "Analog Devices Inc."], ["KLAC", "KLA Corp."], ["SNPS", "Synopsys Inc."],
  ["CDNS", "Cadence Design Systems"], ["PANW", "Palo Alto Networks"], ["ANET", "Arista Networks"],
  ["CRWD", "CrowdStrike Holdings"], ["FTNT", "Fortinet Inc."], ["MRVL", "Marvell Technology"],
  ["ROP", "Roper Technologies"], ["ADSK", "Autodesk Inc."], ["NXPI", "NXP Semiconductors"],
  ["MCHP", "Microchip Technology"], ["PLTR", "Palantir Technologies"], ["SNOW", "Snowflake Inc."],
  ["DELL", "Dell Technologies"], ["HPQ", "HP Inc."], ["HPE", "Hewlett Packard Enterprise"],
  ["WDAY", "Workday Inc."], ["TEAM", "Atlassian Corp."], ["DDOG", "Datadog Inc."],
  ["ZS", "Zscaler Inc."], ["NET", "Cloudflare Inc."], ["MDB", "MongoDB Inc."],
  ["SMCI", "Super Micro Computer"], ["ON", "ON Semiconductor"], ["STX", "Seagate Technology"],
  ["WDC", "Western Digital Corp."], ["GLW", "Corning Inc."], ["KEYS", "Keysight Technologies"],
  ["CDW", "CDW Corp."], ["FICO", "Fair Isaac Corp."], ["IT", "Gartner Inc."],
  ["ANSS", "Ansys Inc."], ["PTC", "PTC Inc."], ["TYL", "Tyler Technologies"],
  ["HUBS", "HubSpot Inc."], ["ZM", "Zoom Communications"], ["DOCU", "DocuSign Inc."],
  ["OKTA", "Okta Inc."], ["TWLO", "Twilio Inc."], ["SHOP", "Shopify Inc."],
  ["UBER", "Uber Technologies"], ["ABNB", "Airbnb Inc."], ["XYZ", "Block Inc."],
  ["PYPL", "PayPal Holdings"], ["COIN", "Coinbase Global"], ["HOOD", "Robinhood Markets"],
  ["SOFI", "SoFi Technologies"], ["AFRM", "Affirm Holdings"], ["ROKU", "Roku Inc."],
  ["SPOT", "Spotify Technology"], ["PINS", "Pinterest Inc."], ["SNAP", "Snap Inc."],
  ["DASH", "DoorDash Inc."], ["RBLX", "Roblox Corp."], ["U", "Unity Software"],
  ["NFLX", "Netflix Inc."], ["TTD", "The Trade Desk"], ["APP", "AppLovin Corp."],
  ["GRMN", "Garmin Ltd."], ["WDAY", "Workday Inc."],
].map(([s, n]) => row(s, n, "Stock", "Technology"));

// ── Healthcare single names ──
const HEALTH = [
  ["LLY", "Eli Lilly & Co."], ["JNJ", "Johnson & Johnson"], ["UNH", "UnitedHealth Group"],
  ["MRK", "Merck & Co."], ["ABBV", "AbbVie Inc."], ["TMO", "Thermo Fisher Scientific"],
  ["ABT", "Abbott Laboratories"], ["DHR", "Danaher Corp."], ["PFE", "Pfizer Inc."],
  ["AMGN", "Amgen Inc."], ["ISRG", "Intuitive Surgical"], ["BMY", "Bristol-Myers Squibb"],
  ["VRTX", "Vertex Pharmaceuticals"], ["GILD", "Gilead Sciences"], ["MDT", "Medtronic plc"],
  ["CVS", "CVS Health Corp."], ["CI", "The Cigna Group"], ["ELV", "Elevance Health"],
  ["REGN", "Regeneron Pharmaceuticals"], ["ZTS", "Zoetis Inc."], ["BSX", "Boston Scientific"],
  ["SYK", "Stryker Corp."], ["BDX", "Becton Dickinson"], ["HCA", "HCA Healthcare"],
  ["MCK", "McKesson Corp."], ["CAH", "Cardinal Health"], ["COR", "Cencora Inc."],
  ["HUM", "Humana Inc."], ["CNC", "Centene Corp."], ["EW", "Edwards Lifesciences"],
  ["DXCM", "DexCom Inc."], ["IDXX", "IDEXX Laboratories"], ["IQV", "IQVIA Holdings"],
  ["GEHC", "GE HealthCare Technologies"], ["A", "Agilent Technologies"], ["BIIB", "Biogen Inc."],
  ["MRNA", "Moderna Inc."], ["ILMN", "Illumina Inc."], ["RMD", "ResMed Inc."],
  ["WST", "West Pharmaceutical Services"], ["MTD", "Mettler-Toledo International"], ["ALGN", "Align Technology"],
  ["LH", "Labcorp Holdings"], ["DGX", "Quest Diagnostics"], ["ZBH", "Zimmer Biomet"],
  ["BAX", "Baxter International"], ["STE", "Steris plc"], ["WAT", "Waters Corp."],
  ["HOLX", "Hologic Inc."], ["PODD", "Insulet Corp."], ["RVTY", "Revvity Inc."],
  ["TECH", "Bio-Techne Corp."], ["CRL", "Charles River Laboratories"], ["VTRS", "Viatris Inc."],
  ["INCY", "Incyte Corp."], ["BMRN", "BioMarin Pharmaceutical"], ["EXAS", "Exact Sciences"],
  ["NBIX", "Neurocrine Biosciences"], ["SRPT", "Sarepta Therapeutics"], ["HALO", "Halozyme Therapeutics"],
  ["UTHR", "United Therapeutics"], ["ALNY", "Alnylam Pharmaceuticals"], ["RPRX", "Royalty Pharma"],
  ["DVA", "DaVita Inc."], ["UHS", "Universal Health Services"], ["MOH", "Molina Healthcare"],
].map(([s, n]) => row(s, n, "Stock", "Healthcare"));

// De-duplicate by symbol (keeps first occurrence) so accidental repeats are harmless.
const seen = new Set();
export const COVERED_CALL_UNIVERSE = [...INDEXES, ...SECTOR_ETFS, ...TECH, ...HEALTH]
  .filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true)));

export const UNIVERSE_SYMBOLS = COVERED_CALL_UNIVERSE.map((r) => r.symbol);
