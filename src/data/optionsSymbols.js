// ─── src/data/optionsSymbols.js ──────────────────────────────────────────────
// Catalog for the Options Manager Dashboard symbol dropdown, grouped by category.
// Covers US Treasuries (futures / ETFs / yields), Grains & Ag, Indexes, and a set
// of liquid optionable Stocks. Symbols use Yahoo conventions: futures "ZB=F",
// index "^TYX", equities "AAPL". Charting works for all; listed option chains
// populate for optionable equities/ETFs (futures/yield indices have no chain here).

export const SYMBOL_GROUPS = [
  { group: "US Treasuries — Futures", items: [
    ["ZB=F", "30-Year T-Bond"], ["UB=F", "Ultra T-Bond"], ["ZN=F", "10-Year T-Note"],
    ["ZF=F", "5-Year T-Note"], ["ZT=F", "2-Year T-Note"], ["TN=F", "Ultra 10-Year"],
  ] },
  { group: "US Treasuries — ETFs (optionable)", items: [
    ["TLT", "20+ Year (TLT)"], ["TLH", "10-20 Year (TLH)"], ["IEF", "7-10 Year (IEF)"],
    ["IEI", "3-7 Year (IEI)"], ["SHY", "1-3 Year (SHY)"], ["GOVT", "All Maturities (GOVT)"],
    ["EDV", "Extended Duration (EDV)"], ["BIL", "1-3 Month (BIL)"],
  ] },
  { group: "US Treasuries — Yields", items: [
    ["^TYX", "30-Year Yield"], ["^TNX", "10-Year Yield"], ["^FVX", "5-Year Yield"], ["^IRX", "13-Week Yield"],
  ] },
  { group: "Grains & Agriculture — Futures", items: [
    ["ZC=F", "Corn"], ["ZS=F", "Soybeans"], ["ZW=F", "Wheat (Chicago)"], ["KE=F", "Wheat (KC)"],
    ["ZM=F", "Soybean Meal"], ["ZL=F", "Soybean Oil"], ["ZO=F", "Oats"], ["ZR=F", "Rough Rice"],
  ] },
  { group: "Grains & Agriculture — ETFs (optionable)", items: [
    ["CORN", "Corn Fund (CORN)"], ["SOYB", "Soybean Fund (SOYB)"], ["WEAT", "Wheat Fund (WEAT)"],
    ["DBA", "Agriculture Fund (DBA)"],
  ] },
  { group: "Indexes", items: [
    ["^GSPC", "S&P 500"], ["^NDX", "Nasdaq 100"], ["^DJI", "Dow Jones"], ["^RUT", "Russell 2000"], ["^VIX", "VIX Volatility"],
  ] },
  { group: "Index Futures", items: [
    ["ES=F", "S&P 500 (ES)"], ["NQ=F", "Nasdaq 100 (NQ)"], ["YM=F", "Dow (YM)"], ["RTY=F", "Russell 2000 (RTY)"],
  ] },
  { group: "Index ETFs (optionable)", items: [
    ["SPY", "S&P 500 (SPY)"], ["QQQ", "Nasdaq 100 (QQQ)"], ["DIA", "Dow (DIA)"], ["IWM", "Russell 2000 (IWM)"], ["VOO", "S&P 500 (VOO)"],
  ] },
  { group: "Stocks (optionable)", items: [
    ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"], ["AMZN", "Amazon"], ["GOOGL", "Alphabet"],
    ["META", "Meta"], ["TSLA", "Tesla"], ["AMD", "AMD"], ["AVGO", "Broadcom"], ["NFLX", "Netflix"],
    ["JPM", "JPMorgan"], ["BAC", "Bank of America"], ["XOM", "Exxon Mobil"], ["UNH", "UnitedHealth"], ["LLY", "Eli Lilly"],
    ["WMT", "Walmart"], ["COST", "Costco"], ["DIS", "Disney"], ["BA", "Boeing"], ["PLTR", "Palantir"],
    ["COIN", "Coinbase"], ["HOOD", "Robinhood"], ["SOFI", "SoFi"], ["F", "Ford"], ["INTC", "Intel"],
    ["PFE", "Pfizer"], ["KO", "Coca-Cola"], ["T", "AT&T"],
  ] },
];

// Flat set of all catalog symbols (to detect whether the current symbol is listed).
export const CATALOG_SYMBOLS = new Set(SYMBOL_GROUPS.flatMap((g) => g.items.map(([s]) => s)));
