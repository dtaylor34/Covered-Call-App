// --- src/components/SelectionTab.jsx ------------------------------------------
// Position Selection & Analysis tab. Ported from the original standalone
// covered-calls prototype. Preserves all interactions:
//
// Flow: symbol → stock data → strikes/expirations → Black-Scholes pricing →
//       computed stats (premium, ROI, breakeven, max profit) → quick profits
//
// Cross-section interactions:
//   - Symbol picker → recalculates everything
//   - Strike/Expiration buttons → update premium, ROI, profit timeline
//   - Buyback slider → zone-colored (conservative/sweet/aggressive)
//   - Auto-Optimize → sets strike + expiration + buyback simultaneously
//   - Best Return Hint → clickable to apply recommended values
//   - Save & Export → modal with clipboard copy
//   - InfoTip glossary links → navigate to Glossary tab via callback
// -----------------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext";

// ── Stock Data ────────────────────────────────────────────────────────────────
const STOCK_DATA = {
  META: { name: "Meta Platforms", price: 653.18, beta: 1.29, iv: 0.32, dividend: 2.10, earningsDate: "2026-04-28", high52: 796.25, low52: 479.80, url: "https://finance.yahoo.com/quote/META" },
  AAPL: { name: "Apple Inc.", price: 232.80, beta: 1.24, iv: 0.25, dividend: 1.00, earningsDate: "2026-04-30", high52: 260.10, low52: 164.08, url: "https://finance.yahoo.com/quote/AAPL" },
  GOOGL: { name: "Alphabet Inc.", price: 311.24, beta: 1.06, iv: 0.28, dividend: 0.80, earningsDate: "2026-04-29", high52: 380.49, low52: 148.71, url: "https://finance.yahoo.com/quote/GOOGL" },
  MSFT: { name: "Microsoft Corp.", price: 412.50, beta: 0.89, iv: 0.24, dividend: 3.32, earningsDate: "2026-04-22", high52: 470.25, low52: 376.00, url: "https://finance.yahoo.com/quote/MSFT" },
  AMZN: { name: "Amazon.com", price: 228.93, beta: 1.15, iv: 0.30, dividend: 0, earningsDate: "2026-04-24", high52: 242.52, low52: 161.02, url: "https://finance.yahoo.com/quote/AMZN" },
  NVDA: { name: "NVIDIA Corp.", price: 187.19, beta: 1.67, iv: 0.45, dividend: 0.04, earningsDate: "2026-05-21", high52: 212.19, low52: 86.62, url: "https://finance.yahoo.com/quote/NVDA" },
  TSLA: { name: "Tesla Inc.", price: 422.66, beta: 2.05, iv: 0.55, dividend: 0, earningsDate: "2026-04-22", high52: 498.83, low52: 214.25, url: "https://finance.yahoo.com/quote/TSLA" },
  UBER: { name: "Uber Technologies", price: 70.44, beta: 1.38, iv: 0.38, dividend: 0, earningsDate: "2026-05-06", high52: 101.99, low52: 57.00, url: "https://finance.yahoo.com/quote/UBER" },
  AMD: { name: "Advanced Micro Devices", price: 208.96, beta: 1.56, iv: 0.42, dividend: 0, earningsDate: "2026-04-29", high52: 227.30, low52: 120.62, url: "https://finance.yahoo.com/quote/AMD" },
  PLTR: { name: "Palantir Technologies", price: 129.13, beta: 2.31, iv: 0.60, dividend: 0, earningsDate: "2026-05-04", high52: 207.52, low52: 66.12, url: "https://finance.yahoo.com/quote/PLTR" },
  NFLX: { name: "Netflix Inc.", price: 76.07, beta: 1.28, iv: 0.35, dividend: 0, earningsDate: "2026-04-17", high52: 134.12, low52: 75.23, url: "https://finance.yahoo.com/quote/NFLX" },
  INTC: { name: "Intel Corp.", price: 46.08, beta: 1.05, iv: 0.48, dividend: 0.50, earningsDate: "2026-04-24", high52: 54.60, low52: 17.67, url: "https://finance.yahoo.com/quote/INTC" },
  DIS: { name: "Walt Disney Co.", price: 102.84, beta: 1.18, iv: 0.30, dividend: 1.00, earningsDate: "2026-05-06", high52: 124.69, low52: 80.10, url: "https://finance.yahoo.com/quote/DIS" },
  PYPL: { name: "PayPal Holdings", price: 39.07, beta: 1.41, iv: 0.40, dividend: 0, earningsDate: "2026-04-29", high52: 79.50, low52: 38.46, url: "https://finance.yahoo.com/quote/PYPL" },
  COIN: { name: "Coinbase Global", price: 163.54, beta: 2.85, iv: 0.65, dividend: 0, earningsDate: "2026-05-08", high52: 444.65, low52: 139.36, url: "https://finance.yahoo.com/quote/COIN" },
  JPM: { name: "JPMorgan Chase", price: 303.01, beta: 1.08, iv: 0.22, dividend: 5.00, earningsDate: "2026-04-11", high52: 337.25, low52: 202.16, url: "https://finance.yahoo.com/quote/JPM" },
  HOOD: { name: "Robinhood Markets", price: 71.60, beta: 1.90, iv: 0.55, dividend: 0, earningsDate: "2026-05-13", high52: 153.86, low52: 29.66, url: "https://finance.yahoo.com/quote/HOOD" },
  SQ: { name: "Block Inc.", price: 56.20, beta: 2.10, iv: 0.50, dividend: 0, earningsDate: "2026-05-01", high52: 89.74, low52: 44.10, url: "https://finance.yahoo.com/quote/XYZ" },
  SHOP: { name: "Shopify Inc.", price: 112.45, beta: 2.15, iv: 0.52, dividend: 0, earningsDate: "2026-05-01", high52: 145.80, low52: 57.60, url: "https://finance.yahoo.com/quote/SHOP" },
  BA: { name: "Boeing Co.", price: 178.50, beta: 1.52, iv: 0.38, dividend: 0, earningsDate: "2026-04-23", high52: 196.95, low52: 128.88, url: "https://finance.yahoo.com/quote/BA" },
  CRM: { name: "Salesforce Inc.", price: 288.50, beta: 1.28, iv: 0.30, dividend: 1.60, earningsDate: "2026-05-28", high52: 348.86, low52: 218.01, url: "https://finance.yahoo.com/quote/CRM" },
  SOFI: { name: "SoFi Technologies", price: 14.85, beta: 1.72, iv: 0.55, dividend: 0, earningsDate: "2026-04-28", high52: 20.98, low52: 6.01, url: "https://finance.yahoo.com/quote/SOFI" },
};

// ── Black-Scholes Pricing ─────────────────────────────────────────────────────
function cdf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function blackScholesCall(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
}

function generateStrikePrices(currentPrice, count = 12) {
  const base = Math.round(currentPrice / 5) * 5;
  const strikes = [];
  for (let i = -4; i <= count - 5; i++) strikes.push(base + i * 5);
  return strikes.filter(s => s > currentPrice * 0.85);
}

function daysBetween(d1, d2) {
  return Math.ceil((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function generateExpirationDates() {
  const dates = [];
  const today = new Date();
  for (let w = 1; w <= 12; w++) {
    const friday = new Date(today);
    friday.setDate(today.getDate() + (5 - today.getDay() + 7 * w) % 7 + 7 * (w - 1));
    if (friday.getDay() === 5) dates.push(friday.toISOString().split("T")[0]);
  }
  for (let m = 1; m <= 6; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const firstDay = d.getDay();
    const thirdFriday = 15 + ((5 - firstDay + 7) % 7);
    d.setDate(thirdFriday);
    const iso = d.toISOString().split("T")[0];
    if (!dates.includes(iso)) dates.push(iso);
  }
  return [...new Set(dates)].sort();
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SelectionTab({ onNavigateToGlossary, sharedSymbol, onSymbolChange }) {
  const { T, themeName } = useTheme();

  // Map ThemeContext tokens → prototype variable names (keeps JSX identical)
  const palette = useMemo(() => ({
    bg: T.bg,
    card: T.card,
    cardHover: T.cardHover,
    accent: T.accent,
    accentDim: T.accentDim,
    accentBright: T.accentBright,
    warning: T.warn,
    danger: T.danger,
    dangerDim: T.dangerDim,
    profit: T.success,
    profitDim: T.successDim,
    text: T.text,
    textDim: T.textDim,
    textMuted: T.textMuted,
    border: T.border,
    borderLight: T.borderActive,
    inputBg: T.inputBg,
    gradientA: T.accent,
    gradientB: T.gradientB,
  }), [T]);

  const font = T.fontMono;
  const displayFont = T.fontDisplay;

  // ── State ─────────────────────────────────────────────────────────────────
  const [symbol, setSymbol] = useState(sharedSymbol || "AAPL");
  const changeSymbol = useCallback((sym) => {
    setSymbol(sym);
    if (onSymbolChange) onSymbolChange(sym);
  }, [onSymbolChange]);
  const [customStocks, setCustomStocks] = useState({});
  const [hiddenPresets, setHiddenPresets] = useState([]);
  const [hoveredSymbol, setHoveredSymbol] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const tickerRef = useRef(null);
  const priceRef = useRef(null);
  const [shares, setShares] = useState(200);
  const [strikePrice, setStrikePrice] = useState(null);
  const [expirationDate, setExpirationDate] = useState(null);
  const [buybackLimit, setBuybackLimit] = useState(50);
  const [sliderHover, setSliderHover] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [activeBroker] = useState("schwab");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [animateIn, setAnimateIn] = useState(true);
  const [optimizedFlash, setOptimizedFlash] = useState(false);
  const [showOptimizeInfo, setShowOptimizeInfo] = useState(false);
  const [activeInfoTip, setActiveInfoTip] = useState(null);
  const [strikeRangeMin, setStrikeRangeMin] = useState(95);  // % of stock price
  const [strikeRangeMax, setStrikeRangeMax] = useState(115); // % of stock price

  // ── Derived Data ──────────────────────────────────────────────────────────
  const visiblePresets = useMemo(() => {
    const filtered = {};
    Object.entries(STOCK_DATA).forEach(([k, v]) => {
      if (!hiddenPresets.includes(k)) filtered[k] = v;
    });
    return filtered;
  }, [hiddenPresets]);

  const allStocks = useMemo(() => ({ ...visiblePresets, ...customStocks }), [visiblePresets, customStocks]);
  const stock = allStocks[symbol] || STOCK_DATA.META;
  const contracts = Math.floor(shares / 100);

  const removeSymbol = useCallback((sym) => {
    if (STOCK_DATA[sym]) {
      setHiddenPresets(prev => [...prev, sym]);
    } else {
      setCustomStocks(prev => { const next = { ...prev }; delete next[sym]; return next; });
    }
    if (sym === symbol) {
      const remaining = Object.keys(allStocks).filter(s => s !== sym);
      changeSymbol(remaining[0] || "META");
      setStrikePrice(null);
    }
  }, [symbol, allStocks]);

  const expirations = useMemo(() => generateExpirationDates(), []);
  const strikes = useMemo(() => generateStrikePrices(stock.price), [stock.price]);

  useEffect(() => {
    if (!strikePrice) setStrikePrice(strikes[6] || Math.round(stock.price * 1.03 / 5) * 5);
  }, [strikes, stock.price]);

  useEffect(() => {
    if (!expirationDate && expirations.length > 2) setExpirationDate(expirations[3]);
  }, [expirations]);

  useEffect(() => {
    setAnimateIn(false);
    const t = setTimeout(() => setAnimateIn(true), 50);
    return () => clearTimeout(t);
  }, [symbol]);

  useEffect(() => {
    const handleClick = () => setActiveInfoTip(null);
    if (activeInfoTip) document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [activeInfoTip]);

  const today = todayISO();
  const daysToExpiry = expirationDate ? daysBetween(today, expirationDate) : 30;
  const timeToExpiry = daysToExpiry / 365;
  const riskFreeRate = 0.043;

  // ── Add Manual Stock ──────────────────────────────────────────────────────
  const addManualStock = useCallback((ticker, price) => {
    const sym = ticker.toUpperCase().trim();
    const p = parseFloat(price);
    if (!sym) { setLookupError("Enter a ticker symbol"); return; }
    if (isNaN(p) || p <= 0) { setLookupError(`Enter the current price for ${sym}`); return; }
    setCustomStocks(prev => ({ ...prev, [sym]: {
      name: sym, price: p, beta: 1.0, iv: 0.30, dividend: 0,
      earningsDate: null, high52: p * 1.15, low52: p * 0.75,
      url: `https://finance.yahoo.com/quote/${sym}`,
    }}));
    changeSymbol(sym); setStrikePrice(null); setLookupError("");
    if (tickerRef.current) tickerRef.current.value = "";
    if (priceRef.current) priceRef.current.value = "";
  }, []);

  // ── Computed Values ───────────────────────────────────────────────────────
  const premiumPerShare = blackScholesCall(stock.price, strikePrice || stock.price * 1.03, timeToExpiry, riskFreeRate, stock.iv);
  const premiumPerContract = premiumPerShare * 100;
  const totalPremium = premiumPerContract * contracts;
  const costToEnter = stock.price * shares;
  const maxProfit = ((strikePrice || stock.price * 1.03) - stock.price) * shares + totalPremium;
  const returnOnInvestment = (totalPremium / costToEnter) * 100;
  const annualizedReturn = (returnOnInvestment / daysToExpiry) * 365;
  const breakeven = stock.price - premiumPerShare;

  // ── Best Strike Recommendation ────────────────────────────────────────────
  const bestStrike = useMemo(() => {
    let best = null, bestScore = -Infinity;
    strikes.forEach(k => {
      const prem = blackScholesCall(stock.price, k, timeToExpiry, riskFreeRate, stock.iv);
      const otmPct = (k - stock.price) / stock.price;
      const roi = (prem / stock.price) * 100;
      const annRoi = (roi / daysToExpiry) * 365;
      const score = annRoi * 0.5 + otmPct * 100 * 0.3 + (prem > 3 ? 20 : 0);
      if (score > bestScore) { bestScore = score; best = { strike: k, premium: prem, roi, annRoi, otmPct }; }
    });
    return best;
  }, [strikes, stock.price, timeToExpiry, daysToExpiry]);

  // ── Best Date Recommendation ──────────────────────────────────────────────
  const bestDate = useMemo(() => {
    let best = null, bestScore = -Infinity;
    const targetStrike = strikePrice || stock.price * 1.03;
    expirations.forEach(d => {
      const days = daysBetween(today, d);
      if (days < 7 || days > 60) return;
      const T = days / 365;
      const prem = blackScholesCall(stock.price, targetStrike, T, riskFreeRate, stock.iv);
      const dailyTheta = prem / days;
      const roi = (prem / stock.price) * 100;
      const annRoi = (roi / days) * 365;
      const timeBonus = days >= 25 && days <= 45 ? 15 : 0;
      const score = annRoi * 0.4 + dailyTheta * 10 + timeBonus;
      if (score > bestScore) { bestScore = score; best = { date: d, days, premium: prem, roi, annRoi, dailyTheta }; }
    });
    return best;
  }, [expirations, strikePrice, stock.price, today]);

  // ── Auto-Optimize ─────────────────────────────────────────────────────────
  const autoOptimize = useCallback(() => {
    let optStrike = null, optStrikeScore = -Infinity;
    let optDate = null, optDateScore = -Infinity;
    const strikeCandidates = generateStrikePrices(stock.price);
    strikeCandidates.forEach(k => {
      expirations.forEach(d => {
        const days = daysBetween(today, d);
        if (days < 14 || days > 55) return;
        if (stock.earningsDate && Math.abs(daysBetween(d, stock.earningsDate)) < 7) return;
        const T = days / 365;
        const prem = blackScholesCall(stock.price, k, T, riskFreeRate, stock.iv);
        const otmPct = (k - stock.price) / stock.price;
        const roi = (prem / stock.price) * 100;
        const annRoi = (roi / days) * 365;
        const dailyTheta = prem / days;
        const otmBonus = (otmPct >= 0.02 && otmPct <= 0.06) ? 20 : (otmPct > 0 ? 10 : -10);
        const timeBonus = (days >= 25 && days <= 45) ? 15 : (days >= 20 && days <= 55) ? 8 : 0;
        const score = annRoi * 0.4 + dailyTheta * 8 + otmBonus + timeBonus + (prem > 3 ? 5 : 0);
        if (score > optStrikeScore) { optStrikeScore = score; optStrike = k; }
        if (score > optDateScore) { optDateScore = score; optDate = d; }
      });
    });
    if (optStrike) setStrikePrice(optStrike);
    if (optDate) setExpirationDate(optDate);
    const optDays = optDate ? daysBetween(today, optDate) : 30;
    const optT = optDays / 365;
    const optPrem = blackScholesCall(stock.price, optStrike || stock.price * 1.03, optT, riskFreeRate, stock.iv);
    const optBuyback = Math.round(optPrem * 100 * 0.3);
    setBuybackLimit(Math.max(10, Math.min(optBuyback, Math.round(optPrem * 100 * 0.5))));
    setOptimizedFlash(true);
    setShowOptimizeInfo(true);
    setTimeout(() => setOptimizedFlash(false), 2000);
  }, [stock, expirations, riskFreeRate, today]);

  // ── Quick Profit Timeline ─────────────────────────────────────────────────
  const quickProfits = useMemo(() => {
    const scenarios = [];
    [3, 7, 14, 21].forEach(days => {
      if (days >= daysToExpiry) return;
      const remaining = (daysToExpiry - days) / 365;
      const futurePrice = blackScholesCall(stock.price, strikePrice, remaining, riskFreeRate, stock.iv);
      const profit = (premiumPerShare - futurePrice) * 100 * contracts;
      const profitPct = (profit / totalPremium) * 100;
      scenarios.push({ days, futurePrice: futurePrice * 100 * contracts, profit, profitPct, buybackCost: futurePrice * 100 * contracts });
    });
    return scenarios;
  }, [premiumPerShare, strikePrice, daysToExpiry, stock, contracts, totalPremium]);

  // ── Save Transaction ──────────────────────────────────────────────────────
  const handleSaveTransaction = () => {
    const tx = {
      id: Date.now(), date: todayISO(), symbol, shares, contracts,
      strikePrice, expiration: expirationDate, premium: totalPremium,
      costBasis: costToEnter, buybackLimit, broker: activeBroker,
      stockPrice: stock.price, premiumPerShare, premiumPerContract, status: "OPEN",
    };
    setTransactions(prev => [...prev, tx]);
    setShowSaveModal(false);
    setSavedMessage("Transaction logged! Copy the text below to paste into Google Docs.");
    setTimeout(() => setSavedMessage(""), 4000);
  };

  const generateGoogleDocsText = () => {
    const lines = [
      "═══════════════════════════════════════════",
      "  COVERED CALLS TRANSACTION LOG",
      "  Generated: " + new Date().toLocaleDateString(),
      "═══════════════════════════════════════════", "",
    ];
    const allTx = [...transactions, {
      date: todayISO(), symbol, shares, contracts,
      strikePrice, expiration: expirationDate, premium: totalPremium,
      costBasis: costToEnter, buybackLimit, status: "CURRENT",
    }];
    allTx.forEach((tx, i) => {
      lines.push(`--- Transaction #${i + 1} [${tx.status}] ---`);
      lines.push(`Date: ${tx.date}`);
      lines.push(`Symbol: ${tx.symbol} | Shares: ${tx.shares} | Contracts: ${tx.contracts}`);
      lines.push(`Strike: $${tx.strikePrice} | Expiry: ${tx.expiration}`);
      lines.push(`Premium Collected: $${tx.premium.toFixed(2)}`);
      lines.push(`Cost Basis: $${tx.costBasis.toFixed(2)}`);
      lines.push(`Buyback Limit: $${tx.buybackLimit}/contract`);
      lines.push("");
    });
    lines.push("═══════════════════════════════════════════");
    lines.push(`Total Premiums Collected: $${allTx.reduce((s, t) => s + t.premium, 0).toFixed(2)}`);
    lines.push(`Total Shares Under Contract: ${allTx.reduce((s, t) => s + t.shares, 0)}`);
    return lines.join("\n");
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setSavedMessage("📋 Copied to clipboard! Paste into Google Docs to archive.");
      setTimeout(() => setSavedMessage(""), 3000);
    });
  };

  // ── Sub-Components ────────────────────────────────────────────────────────
  const Card = ({ children, style = {}, glow = false }) => (
    <div style={{
      background: palette.card,
      border: `1px solid ${glow ? palette.accent + "44" : palette.border}`,
      borderRadius: 12,
      padding: 24,
      boxShadow: glow ? `0 0 30px ${palette.accentDim}` : themeName === "dark" ? "0 4px 24px rgba(0,0,0,0.3)" : themeName === "highContrast" ? "0 4px 24px rgba(0,0,0,0.5)" : "0 2px 12px rgba(0,0,0,0.08)",
      transition: "all 0.3s ease",
      ...style,
    }}>
      {children}
    </div>
  );

  const Badge = ({ children, color = palette.accent }) => (
    <span style={{
      background: color + "22", color,
      padding: "3px 10px", borderRadius: 6,
      fontSize: 11, fontWeight: 600, fontFamily: font,
      letterSpacing: "0.5px", textTransform: "uppercase",
    }}>
      {children}
    </span>
  );

  const Stat = ({ label, value, sub, color = palette.text, size = "large" }) => (
    <div style={{ marginBottom: size === "large" ? 0 : 12 }}>
      <div style={{ color: palette.textDim, fontSize: 11, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: size === "large" ? 28 : 20, fontWeight: 700, fontFamily: displayFont, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: palette.textMuted, fontSize: 11, fontFamily: font, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const InfoTip = ({ id, tip, glossaryTerm }) => {
    const isOpen = activeInfoTip === id;
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          onClick={(e) => { e.stopPropagation(); setActiveInfoTip(isOpen ? null : id); }}
          style={{
            width: 18, height: 18, borderRadius: "50%",
            background: isOpen ? palette.accent : "transparent",
            border: `1.5px solid ${isOpen ? palette.accent : palette.textMuted}`,
            color: isOpen ? palette.bg : palette.textMuted,
            fontSize: 10, fontWeight: 700, fontFamily: font,
            cursor: "pointer", display: "inline-flex",
            alignItems: "center", justifyContent: "center",
            transition: "all 0.2s", padding: 0, lineHeight: 1,
            verticalAlign: "middle", marginLeft: 6,
          }}
          title="More info"
        >i</button>
        {isOpen && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
            transform: "translateX(-50%)", width: 280,
            background: palette.card,
            border: `1px solid ${palette.accent}44`,
            borderRadius: 10, padding: 14, zIndex: 50,
            boxShadow: themeName === "dark" ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.15)",
            animation: "selectionFadeIn 0.2s ease",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ color: palette.text, fontFamily: font, fontSize: 12, lineHeight: 1.7 }}>{tip}</div>
            {glossaryTerm && onNavigateToGlossary && (
              <button onClick={() => { onNavigateToGlossary(); setActiveInfoTip(null); }} style={{
                marginTop: 8, background: palette.accentDim, color: palette.accent,
                border: `1px solid ${palette.accent}33`,
                padding: "4px 10px", borderRadius: 5, cursor: "pointer",
                fontFamily: font, fontSize: 10, fontWeight: 600,
              }}>
                📖 View in Glossary →
              </button>
            )}
            <div style={{
              position: "absolute", bottom: -6, left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 10, height: 10, background: palette.card,
              borderRight: `1px solid ${palette.accent}44`,
              borderBottom: `1px solid ${palette.accent}44`,
            }} />
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{`
        @keyframes selectionFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {savedMessage && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 200,
          background: palette.profit, color: palette.bg,
          padding: "10px 20px", borderRadius: 8,
          fontFamily: font, fontSize: 13, fontWeight: 600,
          boxShadow: `0 4px 20px ${palette.profit}44`,
          animation: "selectionFadeIn 0.3s ease",
        }}>
          {savedMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24, opacity: animateIn ? 1 : 0, transform: animateIn ? "translateY(0)" : "translateY(10px)", transition: "all 0.4s ease" }}>

        {/* ── Header Stats Row ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <Card glow>
            <Stat label={<>Cost to Enter<InfoTip id="cost" tip="The total capital required to buy the shares. This is your initial investment before selling any calls. You must own these shares to write a covered call against them." glossaryTerm="Cost Basis" /></>} value={`$${costToEnter.toLocaleString("en", { minimumFractionDigits: 2 })}`} sub={`${shares} shares × $${stock.price.toFixed(2)}`} />
          </Card>
          <Card>
            <Stat label={<>Premium Collected<InfoTip id="premium" tip="The cash you receive upfront for selling the call option. This is deposited into your account immediately. You keep this money regardless of what happens to the stock." glossaryTerm="Premium" /></>} value={`$${totalPremium.toFixed(2)}`} sub={`$${premiumPerShare.toFixed(2)}/share × ${contracts} contracts`} color={palette.profit} />
          </Card>
          <Card>
            <Stat label={<>Max Profit<InfoTip id="maxprofit" tip={`The best possible outcome: stock rises to exactly $${strikePrice} at expiration. You keep the premium ($${totalPremium.toFixed(2)}) PLUS the stock appreciation ($${((strikePrice - stock.price) * shares).toFixed(2)}). Above the strike, profits are capped because shares get called away.`} glossaryTerm="Max Profit" /></>} value={`$${maxProfit.toFixed(2)}`} sub={`${(maxProfit / costToEnter * 100).toFixed(2)}% return`} color={palette.accentBright} />
          </Card>
          <Card>
            <Stat label={<>Breakeven Price<InfoTip id="breakeven" tip={`The stock price where you neither profit nor lose. Calculated as stock price ($${stock.price.toFixed(2)}) minus premium per share ($${premiumPerShare.toFixed(2)}). Below $${breakeven.toFixed(2)}, you're at a net loss despite the premium.`} glossaryTerm="Breakeven Price" /></>} value={`$${breakeven.toFixed(2)}`} sub={`${((stock.price - breakeven) / stock.price * 100).toFixed(2)}% downside protection`} color={palette.warning} />
          </Card>
        </div>

        {/* ── Configuration Section (2-column grid) ────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* ── Left: Stock & Position Setup ───────────────────────────── */}
          <Card style={{ gridRow: "span 2" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h3 style={{ color: palette.text, fontFamily: displayFont, fontSize: 18, margin: 0, fontWeight: 600 }}>Position Setup</h3>
                <Badge>CONFIGURE</Badge>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <button onClick={autoOptimize} style={{
                  background: optimizedFlash
                    ? `linear-gradient(135deg, ${palette.profit}, ${palette.accentBright})`
                    : `linear-gradient(135deg, ${palette.gradientA}, ${palette.gradientB})`,
                  color: palette.bg, border: "none",
                  padding: "8px 16px", borderRadius: "8px 0 0 8px",
                  cursor: "pointer", fontFamily: font, fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.3px", transition: "all 0.3s ease",
                  boxShadow: optimizedFlash ? `0 0 20px ${palette.profit}66` : "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ fontSize: 14 }}>{optimizedFlash ? "✅" : "⚡"}</span>
                  {optimizedFlash ? "Optimized!" : "Auto-Optimize"}
                </button>
                <button onClick={() => setShowOptimizeInfo(prev => !prev)} style={{
                  background: showOptimizeInfo ? palette.profit
                    : optimizedFlash ? `linear-gradient(135deg, ${palette.profit}, ${palette.accentBright})`
                    : `linear-gradient(135deg, ${palette.gradientB}, ${palette.gradientA})`,
                  color: palette.bg, border: "none",
                  borderLeft: `1px solid ${palette.bg}33`,
                  padding: "8px 10px", borderRadius: "0 8px 8px 0",
                  cursor: "pointer", fontFamily: font, fontSize: 11, fontWeight: 700,
                  transition: "all 0.2s ease", display: "flex", alignItems: "center",
                }} title={showOptimizeInfo ? "Hide details" : "Show optimization details"}>
                  <span style={{ display: "inline-block", transition: "transform 0.25s ease", transform: showOptimizeInfo ? "rotate(180deg)" : "rotate(0deg)", fontSize: 10 }}>▼</span>
                </button>
              </div>
            </div>

            {showOptimizeInfo && (
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                background: `linear-gradient(135deg, ${palette.profitDim}, ${palette.accentDim})`,
                borderRadius: 8, border: `1px solid ${palette.profit}44`,
                color: palette.profit, fontFamily: font, fontSize: 12, lineHeight: 1.6,
                animation: "selectionFadeIn 0.3s ease",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
              }}>
                <div>
                  {bestStrike && bestDate ? (
                    <><strong>Optimized for {symbol}:</strong> Strike <strong>${bestStrike.strike}</strong> ({(bestStrike.otmPct * 100).toFixed(1)}% OTM) expiring <strong>{bestDate.date}</strong> ({bestDate.days}d). Premium ~<strong>${(bestStrike.premium * 100 * contracts).toFixed(2)}</strong> total. Annualized return: <strong>{bestStrike.annRoi.toFixed(1)}%</strong>. Buyback at <strong>${buybackLimit}</strong>/contract to capture ~70% early.</>
                  ) : (
                    <>Click <strong>Auto-Optimize</strong> to calculate the best strike, expiration &amp; buyback for <strong>{symbol}</strong> based on risk-adjusted annualized return while avoiding earnings risk.</>
                  )}
                </div>
                <button onClick={() => setShowOptimizeInfo(false)} style={{
                  background: "transparent", border: "none", color: palette.profit,
                  cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: font,
                  padding: "0 2px", lineHeight: 1, opacity: 0.6, flexShrink: 0,
                }}>×</button>
              </div>
            )}

            {/* Stock Symbol Entry */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: palette.textDim, fontSize: 11, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Stock Symbol</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {Object.keys(allStocks).map(s => {
                  const isActive = symbol === s;
                  const isHovered = hoveredSymbol === s;
                  return (
                    <div key={s} style={{ position: "relative", display: "inline-flex" }}
                      onMouseEnter={() => setHoveredSymbol(s)}
                      onMouseLeave={() => setHoveredSymbol(null)}>
                      <button onClick={() => { changeSymbol(s); setStrikePrice(null); setLookupError(""); }}
                        style={{
                          background: isActive ? palette.accent : palette.inputBg,
                          color: isActive ? palette.bg : palette.text,
                          border: `1px solid ${isActive ? palette.accent : customStocks[s] ? palette.profit + "66" : palette.borderLight}`,
                          padding: "8px 14px", paddingRight: isHovered ? 28 : 14,
                          borderRadius: 6, cursor: "pointer", fontFamily: font,
                          fontSize: 12, fontWeight: isActive ? 700 : 400, transition: "all 0.2s",
                        }}>{s}</button>
                      <button onClick={(e) => { e.stopPropagation(); removeSymbol(s); }}
                        style={{
                          position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)",
                          background: "transparent", border: "none",
                          color: isActive ? palette.bg : palette.danger,
                          cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font,
                          lineHeight: 1, padding: "2px 4px", borderRadius: 4,
                          opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? "auto" : "none",
                          transition: "opacity 0.15s ease",
                        }} title={`Remove ${s}`}>×</button>
                    </div>
                  );
                })}
                {hiddenPresets.length > 0 && (
                  <button onClick={() => setHiddenPresets([])} style={{
                    background: "transparent", color: palette.textMuted,
                    border: `1px dashed ${palette.borderLight}`,
                    padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                    fontFamily: font, fontSize: 11, transition: "all 0.2s",
                    display: "flex", alignItems: "center", gap: 4,
                  }} title={`Restore: ${hiddenPresets.join(", ")}`}>
                    <span style={{ fontSize: 13 }}>+</span> {hiddenPresets.length} hidden
                  </button>
                )}
              </div>

              {/* Custom symbol add */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input ref={tickerRef} type="text" placeholder="Ticker (e.g. UBER)"
                  onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const sym = tickerRef.current?.value?.trim().toUpperCase() || "";
                      const price = priceRef.current?.value || "";
                      if (sym && price) addManualStock(sym, price);
                      else if (sym && allStocks[sym]) {
                        changeSymbol(sym); setStrikePrice(null);
                        if (tickerRef.current) tickerRef.current.value = "";
                        if (priceRef.current) priceRef.current.value = "";
                      }
                    }
                  }}
                  style={{
                    background: palette.inputBg, border: `1px solid ${palette.borderLight}`,
                    color: palette.text, padding: "10px 14px", borderRadius: 8,
                    fontFamily: font, fontSize: 13, width: 120, outline: "none",
                  }} />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: palette.textDim, fontFamily: font, fontSize: 14, fontWeight: 600 }}>$</span>
                  <input ref={priceRef} type="number" placeholder="Price"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const sym = tickerRef.current?.value?.trim().toUpperCase() || "";
                        const price = priceRef.current?.value || "";
                        if (sym && price) addManualStock(sym, price);
                      }
                    }}
                    style={{
                      background: palette.inputBg, border: `1px solid ${palette.borderLight}`,
                      color: palette.text, padding: "10px 12px", borderRadius: 8,
                      fontFamily: font, fontSize: 13, width: 100, outline: "none",
                    }} />
                </div>
                <button onClick={() => {
                  const sym = tickerRef.current?.value?.trim().toUpperCase() || "";
                  const price = priceRef.current?.value || "";
                  if (sym && allStocks[sym] && !price) {
                    changeSymbol(sym); setStrikePrice(null);
                    if (tickerRef.current) tickerRef.current.value = "";
                    if (priceRef.current) priceRef.current.value = "";
                  } else addManualStock(sym, price);
                }} style={{
                  background: `linear-gradient(135deg, ${palette.gradientA}, ${palette.gradientB})`,
                  color: palette.bg, border: `1px solid ${palette.accent}`,
                  padding: "10px 18px", borderRadius: 8, cursor: "pointer",
                  fontFamily: font, fontSize: 12, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span>+</span> Add Stock
                </button>
              </div>

              {lookupError && lookupError !== "price_needed" && (
                <div style={{ color: palette.danger, fontFamily: font, fontSize: 11, marginTop: 6 }}>{lookupError}</div>
              )}

              {/* Currently selected custom stock info */}
              {!STOCK_DATA[symbol] && allStocks[symbol] && (
                <div style={{
                  marginTop: 10, padding: "8px 12px", background: palette.profitDim,
                  borderRadius: 6, border: `1px solid ${palette.profit}33`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ color: palette.profit, fontSize: 12 }}>✓</span>
                  <span style={{ color: palette.profit, fontFamily: font, fontSize: 12 }}>
                    {allStocks[symbol].name} — ${allStocks[symbol].price.toFixed(2)}
                  </span>
                  <span style={{ color: palette.textMuted, fontFamily: font, fontSize: 10 }}>
                    (IV: {(allStocks[symbol].iv * 100).toFixed(0)}% | 52w: ${allStocks[symbol].low52.toFixed(0)}-${allStocks[symbol].high52.toFixed(0)})
                  </span>
                </div>
              )}
            </div>

            {/* Shares / Contracts */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: palette.textDim, fontSize: 11, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Number of Shares</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" min={100} step={100} value={shares}
                  onChange={(e) => { const v = parseInt(e.target.value) || 100; setShares(Math.max(100, v)); }}
                  style={{
                    background: palette.inputBg, border: `1px solid ${palette.borderLight}`,
                    color: palette.accent, padding: "8px 10px", borderRadius: 6,
                    fontFamily: font, fontSize: 13, fontWeight: 700, width: 72,
                    textAlign: "center", outline: "none",
                  }} />
                {[100, 200, 300, 500].map(n => (
                  <button key={n} onClick={() => setShares(n)} style={{
                    background: shares === n ? palette.accent : palette.inputBg,
                    color: shares === n ? palette.bg : palette.text,
                    border: `1px solid ${shares === n ? palette.accent : palette.borderLight}`,
                    padding: "8px 14px", borderRadius: 6, cursor: "pointer",
                    fontFamily: font, fontSize: 12, fontWeight: shares === n ? 700 : 400,
                  }}>{n}</button>
                ))}
              </div>
              <div style={{ color: palette.accent, fontSize: 13, fontFamily: font, marginTop: 8 }}>
                = {contracts} contract{contracts !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Strike Price */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ color: palette.textDim, fontSize: 11, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase" }}>
                  Strike Price
                  <InfoTip id="sec_strike" tip="Each button shows 3 values: Strike Price — the price your shares sell at if assigned. % OTM — how far above the current price (higher = safer, less premium). $ Premium — estimated income per share. ★ marks the algorithm's best risk/reward pick." glossaryTerm="Strike Price" />
                </label>
                {bestStrike && (
                  <span style={{ color: palette.profit, fontSize: 11, fontFamily: font, cursor: "pointer" }}
                    onClick={() => setStrikePrice(bestStrike.strike)}>
                    ★ Best: ${bestStrike.strike} ({bestStrike.annRoi.toFixed(1)}% ann.)
                  </span>
                )}
              </div>
              {/* Strike Range Slider */}
              <div style={{ marginBottom: 12, padding: "10px 14px", background: palette.inputBg, borderRadius: 8, border: `1px solid ${palette.borderLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ color: palette.textDim, fontSize: 10, fontFamily: font, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                    Range Filter
                  </span>
                  <span style={{ color: palette.accent, fontSize: 11, fontFamily: font, fontWeight: 600 }}>
                    ${(stock.price * strikeRangeMin / 100).toFixed(2)} – ${(stock.price * strikeRangeMax / 100).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: palette.textMuted, fontFamily: font, minWidth: 28 }}>{strikeRangeMin}%</span>
                  <div style={{ flex: 1, position: "relative", height: 20 }}>
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 3, background: palette.borderLight, borderRadius: 2, transform: "translateY(-50%)" }} />
                    <div style={{
                      position: "absolute", top: "50%", height: 3, borderRadius: 2, background: palette.accent, transform: "translateY(-50%)",
                      left: `${((strikeRangeMin - 85) / 55) * 100}%`,
                      width: `${((strikeRangeMax - strikeRangeMin) / 55) * 100}%`,
                    }} />
                    <input type="range" min={85} max={140} step={1} value={strikeRangeMin}
                      onChange={e => setStrikeRangeMin(Math.min(Number(e.target.value), strikeRangeMax - 2))}
                      style={{ position: "absolute", width: "100%", opacity: 0, cursor: "pointer", zIndex: 2, height: "100%" }}
                    />
                    <input type="range" min={85} max={140} step={1} value={strikeRangeMax}
                      onChange={e => setStrikeRangeMax(Math.max(Number(e.target.value), strikeRangeMin + 2))}
                      style={{ position: "absolute", width: "100%", opacity: 0, cursor: "pointer", zIndex: 3, height: "100%" }}
                    />
                    <div style={{ position: "absolute", top: "50%", width: 12, height: 12, borderRadius: "50%", background: palette.accent, border: `2px solid ${palette.card}`, transform: "translate(-50%, -50%)", left: `${((strikeRangeMin - 85) / 55) * 100}%`, zIndex: 4, pointerEvents: "none" }} />
                    <div style={{ position: "absolute", top: "50%", width: 12, height: 12, borderRadius: "50%", background: palette.accent, border: `2px solid ${palette.card}`, transform: "translate(-50%, -50%)", left: `${((strikeRangeMax - 85) / 55) * 100}%`, zIndex: 4, pointerEvents: "none" }} />
                  </div>
                  <span style={{ fontSize: 10, color: palette.textMuted, fontFamily: font, minWidth: 28 }}>{strikeRangeMax}%</span>
                  <button onClick={() => { setStrikeRangeMin(95); setStrikeRangeMax(115); }} style={{
                    fontSize: 9, color: palette.textMuted, fontFamily: font,
                    background: "transparent", border: `1px solid ${palette.borderLight}`,
                    borderRadius: 4, padding: "2px 6px", cursor: "pointer",
                  }}>reset</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {strikes.map(k => {
                  const prem = blackScholesCall(stock.price, k, timeToExpiry, riskFreeRate, stock.iv);
                  const otmPct = (k - stock.price) / stock.price * 100;
                  const otm = otmPct.toFixed(1);
                  const isBest = bestStrike && k === bestStrike.strike;
                  const isOutOfRange = k < stock.price * (strikeRangeMin / 100) || k > stock.price * (strikeRangeMax / 100);
                  const isOutOfZone = otmPct < -1 || otmPct > 4;
                  const isSelected = strikePrice === k;
                  return (
                    <button key={k} onClick={() => setStrikePrice(k)} style={{
                      background: isSelected ? (isBest ? palette.profit : palette.accent) : (isOutOfRange || isOutOfZone) ? (themeName === "dark" ? "#0d111744" : themeName === "highContrast" ? "#11111144" : "#e5e7eb88") : palette.inputBg,
                      color: isSelected ? palette.bg : (isOutOfRange || isOutOfZone) ? palette.textMuted : palette.text,
                      border: `1px solid ${isSelected ? (isBest ? palette.profit : palette.accent) : isBest && !isOutOfRange ? palette.profit + "66" : (isOutOfRange || isOutOfZone) ? (themeName === "dark" || themeName === "highContrast" ? "#1f293744" : "#d1d5db66") : palette.borderLight}`,
                      padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                      fontFamily: font, fontSize: 11, textAlign: "center", minWidth: 72,
                      position: "relative", opacity: isSelected ? 1 : isOutOfRange ? 0.3 : isOutOfZone ? 0.5 : 1,
                      transition: "all 0.2s",
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>${k}</div>
                      <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{otm}% OTM</div>
                      <div style={{ fontSize: 9, color: isSelected ? palette.bg : isOutOfZone ? palette.textMuted : palette.profit, marginTop: 1 }}>${prem.toFixed(2)}</div>
                      {isBest && <div style={{ position: "absolute", top: -6, right: -4, fontSize: 12 }}>★</div>}
                      {isOutOfZone && !isSelected && <div style={{ position: "absolute", top: -6, left: -2, fontSize: 8, color: palette.textMuted, fontFamily: font }}>⚠</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Expiration Date */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ color: palette.textDim, fontSize: 11, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase" }}>
                  Expiration Date
                  <InfoTip id="sec_expiry" tip="Each button shows: MM-DD — the option expiration date. Xd — days until expiration (DTE). Sweet spot is 30-45 days for best theta decay vs premium balance. ⚠ flags dates near earnings. ★ marks the optimal date." glossaryTerm="Expiration Date" />
                </label>
                {bestDate && (
                  <span style={{ color: palette.profit, fontSize: 11, fontFamily: font, cursor: "pointer" }}
                    onClick={() => setExpirationDate(bestDate.date)}>
                    ★ Best: {bestDate.date} ({bestDate.days}d)
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {expirations.slice(0, 10).map(d => {
                  const days = daysBetween(today, d);
                  const isBest = bestDate && d === bestDate.date;
                  const isNearEarnings = stock.earningsDate && Math.abs(daysBetween(d, stock.earningsDate)) < 5;
                  return (
                    <button key={d} onClick={() => setExpirationDate(d)} style={{
                      background: expirationDate === d ? palette.accent : palette.inputBg,
                      color: expirationDate === d ? palette.bg : palette.text,
                      border: `1px solid ${expirationDate === d ? palette.accent : isNearEarnings ? palette.warning + "66" : isBest ? palette.profit + "66" : palette.borderLight}`,
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      fontFamily: font, fontSize: 11, textAlign: "center",
                      minWidth: 80, position: "relative",
                    }}>
                      <div style={{ fontWeight: 600 }}>{d.slice(5)}</div>
                      <div style={{ fontSize: 9, opacity: 0.7 }}>{days}d</div>
                      {isBest && <div style={{ position: "absolute", top: -6, right: -4, fontSize: 12 }}>★</div>}
                      {isNearEarnings && <div style={{ position: "absolute", top: -6, left: -4, fontSize: 10 }}>⚠</div>}
                    </button>
                  );
                })}
              </div>
              {stock.earningsDate && (
                <div style={{ color: palette.warning, fontSize: 11, fontFamily: font, marginTop: 6, display: "flex", alignItems: "center" }}>
                  ⚠ Earnings: {stock.earningsDate} — Avoid selling calls through this date
                  <InfoTip id="sec_earnings" tip="Earnings announcements cause massive IV swings. Before earnings, IV is inflated — premiums look attractive but risk is extreme. After the announcement, IV collapses ('IV crush'). Best practice: never sell a covered call that spans an earnings date." glossaryTerm="IV Crush" />
                </div>
              )}
            </div>

            {/* Buyback Limit */}
            <div>
              <label style={{ color: palette.textDim, fontSize: 11, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                Buyback Limit (per contract)
                <InfoTip id="sec_buyback" tip="The slider sets the price you'll pay to buy back (close) your call early. When theta decay erodes the option down to this target, your GTC order auto-fills. Lower buyback = more profit but slower. Higher = faster exit, less profit." glossaryTerm="Buyback Limit" />
              </label>
              {(() => {
                const sliderMin = 10;
                const sliderMax = Math.round(premiumPerContract * 0.8);
                const range = Math.max(sliderMax - sliderMin, 1);
                const conservMax = premiumPerContract * 0.30;
                const sweetMax = premiumPerContract * 0.50;
                const conservPct = Math.min(100, Math.max(0, (conservMax - sliderMin) / range * 100));
                const sweetPct = Math.min(100, Math.max(0, (sweetMax - sliderMin) / range * 100));
                const pctLocked = ((1 - buybackLimit / premiumPerContract) * 100);
                const currentZone = pctLocked >= 70 ? "conservative" : pctLocked >= 50 ? "sweet" : "aggressive";
                const zoneColor = currentZone === "conservative" ? palette.profit : currentZone === "sweet" ? palette.accent : palette.warning;
                const thumbPct = Math.min(100, Math.max(0, (buybackLimit - sliderMin) / range * 100));
                const sliderId = "selection-buyback-slider";
                return (
                  <>
                    <style>{`
                      #${sliderId} { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 4px; outline: none; cursor: pointer;
                        background: linear-gradient(to right, ${palette.profit} 0%, ${palette.profit} ${conservPct}%, ${palette.accent} ${conservPct}%, ${palette.accent} ${sweetPct}%, ${palette.warning} ${sweetPct}%, ${palette.warning} 100%); }
                      #${sliderId}::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${zoneColor}; border: 2px solid ${palette.bg}; box-shadow: 0 0 6px ${zoneColor}88; cursor: pointer; transition: background 0.2s, box-shadow 0.2s; }
                      #${sliderId}::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${zoneColor}; border: 2px solid ${palette.bg}; box-shadow: 0 0 6px ${zoneColor}88; cursor: pointer; }
                    `}</style>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, position: "relative" }}
                        onMouseEnter={() => setSliderHover(true)}
                        onMouseLeave={() => setSliderHover(false)}>
                        <input id={sliderId} type="range" min={sliderMin} max={sliderMax} value={buybackLimit}
                          onChange={(e) => setBuybackLimit(Number(e.target.value))} />
                        {sliderHover && (
                          <div style={{
                            position: "absolute", top: -28,
                            left: `calc(${thumbPct}% + ${8 - thumbPct * 0.16}px)`,
                            transform: "translateX(-50%)",
                            background: zoneColor, color: palette.bg,
                            fontFamily: font, fontSize: 10, fontWeight: 700,
                            padding: "3px 7px", borderRadius: 5,
                            whiteSpace: "nowrap", pointerEvents: "none",
                          }}>
                            {pctLocked.toFixed(0)}%
                            <div style={{
                              position: "absolute", bottom: -4, left: "50%",
                              transform: "translateX(-50%)",
                              width: 0, height: 0,
                              borderLeft: "4px solid transparent",
                              borderRight: "4px solid transparent",
                              borderTop: `4px solid ${zoneColor}`,
                            }} />
                          </div>
                        )}
                      </div>
                      <div style={{ color: zoneColor, fontFamily: font, fontSize: 16, fontWeight: 700, minWidth: 70, textAlign: "right", transition: "color 0.2s" }}>
                        ${buybackLimit}
                      </div>
                    </div>
                    <div style={{ color: palette.textMuted, fontSize: 11, fontFamily: font, marginTop: 6 }}>
                      GTC buy-to-close at <span style={{ color: zoneColor, fontWeight: 700 }}>${buybackLimit}</span>/contract to lock in <span style={{ color: zoneColor, fontWeight: 700 }}>{pctLocked.toFixed(0)}%</span> of premium
                    </div>
                    <div style={{ display: "flex", fontSize: 9, fontFamily: font, marginTop: 8 }}>
                      <div style={{ width: `${conservPct}%`, color: currentZone === "conservative" ? palette.profit : palette.textMuted, transition: "color 0.2s" }}>
                        <div style={{ fontWeight: 700 }}>Conservative</div>
                        <div style={{ opacity: 0.7 }}>70%+ locked</div>
                      </div>
                      <div style={{ width: `${sweetPct - conservPct}%`, color: currentZone === "sweet" ? palette.accent : palette.textMuted, textAlign: "center", transition: "color 0.2s" }}>
                        <div style={{ fontWeight: 700 }}>Sweet Spot</div>
                        <div style={{ opacity: 0.7 }}>50-70%</div>
                      </div>
                      <div style={{ width: `${100 - sweetPct}%`, color: currentZone === "aggressive" ? palette.warning : palette.textMuted, textAlign: "right", transition: "color 0.2s" }}>
                        <div style={{ fontWeight: 700 }}>Aggressive</div>
                        <div style={{ opacity: 0.7 }}>&lt;50% locked</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>

          {/* ── Right: Contract Cost Panel ──────────────────────────────── */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ color: palette.text, fontFamily: displayFont, fontSize: 18, margin: 0, fontWeight: 600 }}>Contract Cost<InfoTip id="sec_contract" tip="Breaks down your income from selling the call. Per Share is the Black-Scholes estimated premium (Bid price). Per Contract multiplies by 100. Total Premium is your complete income. ROI measures income vs stock cost, annualized to compare trades." glossaryTerm="Premium" /></h3>
              <Badge color={palette.profit}>PREMIUM</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Stat size="small" label={<>Per Share<InfoTip id="cc_pershare" tip="The estimated premium per share calculated by the Black-Scholes model. This is what the option buyer pays you for each share covered." glossaryTerm="Premium" /></>} value={`$${premiumPerShare.toFixed(2)}`} color={palette.profit} />
              <Stat size="small" label={<>Per Contract<InfoTip id="cc_percontract" tip={`Per share premium ($${premiumPerShare.toFixed(2)}) × 100 shares = $${premiumPerContract.toFixed(2)} per contract.`} glossaryTerm="Contract" /></>} value={`$${premiumPerContract.toFixed(2)}`} color={palette.profit} />
              <Stat size="small" label={<>Total Premium<InfoTip id="cc_total" tip={`Per contract ($${premiumPerContract.toFixed(2)}) × ${contracts} contracts = $${totalPremium.toFixed(2)} total. This is the complete income deposited into your account.`} glossaryTerm="Premium" /></>} value={`$${totalPremium.toFixed(2)}`} color={palette.accentBright} />
              <Stat size="small" label={<>ROI<InfoTip id="cc_roi" tip={`Return on Investment: total premium ($${totalPremium.toFixed(2)}) ÷ cost to enter ($${costToEnter.toLocaleString()}) = ${returnOnInvestment.toFixed(2)}%. Annualized: ${annualizedReturn.toFixed(1)}%.`} glossaryTerm="Return on Investment" /></>} value={`${returnOnInvestment.toFixed(2)}%`} sub={`${annualizedReturn.toFixed(1)}% annualized`} color={palette.accent} />
            </div>

            {/* Best Return Hint */}
            <div style={{ marginTop: 16, padding: 12, background: palette.profitDim, borderRadius: 8, border: `1px solid ${palette.profit}33` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: palette.profit, fontFamily: font, fontSize: 12, fontWeight: 600 }}>💡 Best Return Hint</div>
                {bestStrike && bestDate && (
                  <button onClick={() => {
                    setStrikePrice(bestStrike.strike);
                    setExpirationDate(bestDate.date);
                    const optPrem = blackScholesCall(stock.price, bestStrike.strike, bestDate.days / 365, riskFreeRate, stock.iv);
                    setBuybackLimit(Math.max(10, Math.round(optPrem * 100 * 0.3)));
                  }} style={{
                    background: palette.profit, color: palette.bg, border: "none",
                    padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                    fontFamily: font, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.3px", transition: "all 0.2s",
                  }}>Apply</button>
                )}
              </div>
              <div style={{ color: palette.text, fontFamily: font, fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
                {bestStrike && bestDate ? (
                  <>Sell {contracts}× <strong>${bestStrike.strike}</strong> calls expiring <strong>{bestDate.date}</strong> ({bestDate.days}d) for ~<strong>${(bestStrike.premium * 100 * contracts).toFixed(2)}</strong> total premium. Annualized return: <strong>{bestStrike.annRoi.toFixed(1)}%</strong>.</>
                ) : "Calculating..."}
              </div>
            </div>
          </Card>

          {/* ── Right: Quick Profit Timeline ────────────────────────────── */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ color: palette.text, fontFamily: displayFont, fontSize: 18, margin: 0, fontWeight: 600 }}>Quick Profit Timeline<InfoTip id="sec_quickprofit" tip="Shows estimated profit if you close early by buying back the call. Xd = days after selling. Progress bar = time value decayed. +$X = profit. % captured = premium you keep. Theta decay accelerates near expiration." glossaryTerm="Theta" /></h3>
              <Badge color={palette.warning}>EARLY EXIT</Badge>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {quickProfits.map((qp, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "60px 1fr 80px 80px",
                  gap: 12, alignItems: "center",
                  padding: "10px 12px", background: palette.inputBg,
                  borderRadius: 8, border: `1px solid ${palette.border}`,
                }}>
                  <div style={{ color: palette.accent, fontFamily: font, fontSize: 13, fontWeight: 700 }}>{qp.days}d</div>
                  <div><div style={{ background: `linear-gradient(90deg, ${palette.accent}44, transparent)`, height: 4, borderRadius: 2, width: `${Math.min(qp.profitPct, 100)}%` }} /></div>
                  <div style={{ color: palette.profit, fontFamily: font, fontSize: 13, fontWeight: 600, textAlign: "right" }}>+${qp.profit.toFixed(0)}</div>
                  <div style={{ color: palette.textDim, fontFamily: font, fontSize: 11, textAlign: "right" }}>{qp.profitPct.toFixed(0)}% captured</div>
                </div>
              ))}
            </div>
            <div style={{ color: palette.textMuted, fontSize: 11, fontFamily: font, marginTop: 10 }}>
              Estimated profit from buying back the call at each point (assumes stock price unchanged, theta decay only)
            </div>
          </Card>
        </div>

        {/* ── Market Index Links ──────────────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ color: palette.text, fontFamily: displayFont, fontSize: 18, margin: 0, fontWeight: 600 }}>Live Market Links<InfoTip id="sec_market" tip="Quick links to Yahoo Finance for each stock in your watchlist. Click any card for real-time quotes, option chains, and news. The highlighted card is your currently selected stock." /></h3>
            <Badge>INDEXES</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {Object.entries(allStocks).map(([sym, data]) => (
              <a key={sym} href={data.url} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px",
                background: sym === symbol ? palette.accentDim : palette.inputBg,
                border: `1px solid ${sym === symbol ? palette.accent + "44" : palette.border}`,
                borderRadius: 8, textDecoration: "none", transition: "all 0.2s", cursor: "pointer",
              }}>
                <div>
                  <div style={{ color: sym === symbol ? palette.accent : palette.text, fontFamily: font, fontSize: 14, fontWeight: 700 }}>{sym}</div>
                  <div style={{ color: palette.textDim, fontFamily: font, fontSize: 10 }}>{data.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: palette.text, fontFamily: font, fontSize: 14, fontWeight: 600 }}>${data.price.toFixed(2)}</div>
                  <div style={{ color: palette.accent, fontSize: 10 }}>↗ View</div>
                </div>
              </a>
            ))}
          </div>
        </Card>

        {/* ── Save & Export ───────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={() => setShowSaveModal(true)} style={{
            background: `linear-gradient(135deg, ${palette.gradientA}, ${palette.gradientB})`,
            color: palette.bg, border: "none",
            padding: "12px 28px", borderRadius: 8, cursor: "pointer",
            fontFamily: font, fontSize: 13, fontWeight: 700, letterSpacing: "0.5px",
          }}>
            💾 Save &amp; Export to Google Docs
          </button>
        </div>
      </div>

      {/* ── Save Modal ───────────────────────────────────────────────── */}
      {showSaveModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }} onClick={() => setShowSaveModal(false)}>
          <div style={{
            background: palette.card,
            border: `1px solid ${palette.accent}44`,
            borderRadius: 16, padding: 32, maxWidth: 500, width: "90%",
            boxShadow: `0 0 60px ${palette.accentDim}`,
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: palette.text, fontFamily: displayFont, fontSize: 20, margin: "0 0 8px 0" }}>Save Transaction</h3>
            <p style={{ color: palette.textDim, fontFamily: font, fontSize: 12, marginBottom: 20 }}>Log this covered call position and export to Google Docs</p>
            <div style={{ background: palette.inputBg, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: font, fontSize: 12 }}>
                <div><span style={{ color: palette.textDim }}>Symbol:</span> <span style={{ color: palette.accent }}>{symbol}</span></div>
                <div><span style={{ color: palette.textDim }}>Shares:</span> <span style={{ color: palette.text }}>{shares}</span></div>
                <div><span style={{ color: palette.textDim }}>Strike:</span> <span style={{ color: palette.text }}>${strikePrice}</span></div>
                <div><span style={{ color: palette.textDim }}>Expiry:</span> <span style={{ color: palette.text }}>{expirationDate}</span></div>
                <div><span style={{ color: palette.textDim }}>Premium:</span> <span style={{ color: palette.profit }}>${totalPremium.toFixed(2)}</span></div>
                <div><span style={{ color: palette.textDim }}>Buyback:</span> <span style={{ color: palette.warning }}>${buybackLimit}/c</span></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { handleSaveTransaction(); copyToClipboard(generateGoogleDocsText()); }} style={{
                flex: 1, background: palette.accent, color: palette.bg, border: "none",
                padding: "12px", borderRadius: 8, cursor: "pointer",
                fontFamily: font, fontSize: 13, fontWeight: 700,
              }}>📋 Log &amp; Copy to Clipboard</button>
              <button onClick={() => setShowSaveModal(false)} style={{
                background: palette.inputBg, color: palette.textDim,
                border: `1px solid ${palette.border}`, padding: "12px 20px",
                borderRadius: 8, cursor: "pointer", fontFamily: font, fontSize: 13,
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
