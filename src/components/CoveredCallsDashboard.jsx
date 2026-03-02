// ─── src/components/CoveredCallsDashboard.jsx ───────────────────────────────
// Main covered calls interface. Users enter a symbol and see:
//   1. Current stock quote
//   2. Ranked covered call recommendations with scores
//   3. Expandable details showing Greeks, score breakdown, and education
//
// Research tracking:
//   - Every search auto-saves to history
//   - Selecting (expanding) a contract row saves that selection to the history entry
//   - Coming back from /history restores the last selected contract
//   - Changing the selection auto-updates the history entry
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useStockQuote, useCoveredCalls } from "../hooks/useMarketData";
import { useAuth } from "../contexts/AuthContext";
import { AnalyticsEvents } from "../services/analytics";
import { useTheme } from "../contexts/ThemeContext";

const POPULAR = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "SPY"];

export default function CoveredCallsDashboard({ onPositionChange }) {
  const { T } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Restore context from navigation state (from history page) or URL param
  const navState = location.state || {};
  const initialSymbol = searchParams.get("symbol")?.toUpperCase().trim()
    || navState.symbol || null;
  const restoredContract = navState.selectedContract || null;

  const [inputValue, setInputValue] = useState(initialSymbol || "");
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const [expandedRow, setExpandedRow] = useState(null);
  const [selectedContract, setSelectedContract] = useState(restoredContract);

  const { addToSearchHistory, updateSearchHistoryEntry, searchHistory } = useAuth();
  const { quote, loading: quoteLoading, error: quoteError } = useStockQuote(activeSymbol);
  const { scores, loading: scoresLoading, error: scoresError, refresh } = useCoveredCalls(activeSymbol);

  // Debounce ref to avoid rapid Firestore writes
  const saveTimeout = useRef(null);

  // ── Propagate active position to parent (for Working tab, etc.) ──
  useEffect(() => {
    if (onPositionChange) {
      onPositionChange({
        symbol: activeSymbol,
        contract: selectedContract ? {
          strike: selectedContract.strike,
          premium: selectedContract.premium != null ? selectedContract.premium * 100 : null,
          expiration: selectedContract.expiration,
          score: selectedContract.compositeScore,
          stockPrice: quote?.price || scores?.underlyingPrice || 0,
        } : null,
      });
    }
  }, [activeSymbol, selectedContract, quote?.price]); // eslint-disable-line

  // ── On initial load from history, clean URL params ──
  useEffect(() => {
    if (initialSymbol && /^[A-Z]{1,5}$/.test(initialSymbol)) {
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line

  // ── When scores load and we have a restored contract, find & expand that row ──
  useEffect(() => {
    if (scores?.recommendations && restoredContract) {
      const idx = scores.recommendations.findIndex(
        (r) => r.strike === restoredContract.strike && r.expiration === restoredContract.expiration
      );
      if (idx >= 0) {
        setExpandedRow(idx);
        setSelectedContract(scores.recommendations[idx]);
      }
    }
  }, [scores]); // eslint-disable-line

  // ── Save stock price to history entry once quote loads ──
  useEffect(() => {
    if (activeSymbol && quote && quote.price && !quote.error) {
      updateSearchHistoryEntry(activeSymbol, { stockPrice: quote.price });
    }
  }, [activeSymbol, quote?.price]); // eslint-disable-line

  // ── Auto-save selected contract to history (debounced) ──
  const saveContractToHistory = useCallback((symbol, contract, price) => {
    if (!symbol || !contract) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      updateSearchHistoryEntry(symbol, {
        stockPrice: price,
        selectedContract: {
          contractSymbol: contract.contractSymbol,
          strike: contract.strike,
          expiration: contract.expiration,
          premium: contract.premium,
          compositeScore: contract.compositeScore,
          annualizedReturn: contract.annualizedReturn,
          premiumYield: contract.premiumYield,
          probabilityOTM: contract.probabilityOTM,
          delta: contract.delta,
          daysToExpiration: contract.daysToExpiration,
        },
      });
    }, 600); // Wait 600ms to avoid rapid writes when clicking through rows
  }, [updateSearchHistoryEntry]);

  // ── Handle row expand/select ──
  const handleRowToggle = (idx) => {
    if (expandedRow === idx) {
      // Collapsing — don't clear selection, just close detail view
      setExpandedRow(null);
      return;
    }
    setExpandedRow(idx);
    const rec = scores?.recommendations?.[idx];
    if (rec) {
      const prevStrike = selectedContract?.strike;
      setSelectedContract(rec);
      saveContractToHistory(activeSymbol, rec, scores?.underlyingPrice);

      if (prevStrike != null && prevStrike !== rec.strike) {
        AnalyticsEvents.contractChanged(activeSymbol, prevStrike, rec.strike);
      } else {
        AnalyticsEvents.contractSelected(activeSymbol, rec.strike, rec.expiration, rec.compositeScore);
      }
    }
  };

  // Recent symbols for quick picks
  const recentSymbols = (searchHistory || [])
    .map((h) => h.symbol)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, 8);

  const handleSearch = (e) => {
    e.preventDefault();
    const sym = inputValue.toUpperCase().trim();
    if (sym && /^[A-Z]{1,5}$/.test(sym)) {
      setActiveSymbol(sym);
      setExpandedRow(null);
      setSelectedContract(null);
      addToSearchHistory(sym);
      AnalyticsEvents.symbolSearched(sym);
    }
  };

  const handleQuickPick = (sym) => {
    setInputValue(sym);
    setActiveSymbol(sym);
    setExpandedRow(null);
    setSelectedContract(null);
    addToSearchHistory(sym);
    AnalyticsEvents.symbolSearched(sym);
  };

  return (
    <div>
      {/* ── Search Bar ── */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
        padding: "20px 24px", marginBottom: 16,
      }}>
        <form role="search" aria-label="Search stock symbols" onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="text"
            aria-label="Stock ticker symbol"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            placeholder="Enter ticker symbol (e.g. AAPL)"
            maxLength={5}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 8,
              background: T.surface, border: `1px solid ${T.border}`,
              color: T.text, fontSize: 15, fontFamily: T.fontMono,
              outline: "none",
            }}
          />
          <button type="submit" aria-label="Analyze covered calls" disabled={quoteLoading || scoresLoading} style={{
            padding: "10px 24px", borderRadius: 8, border: "none",
            background: T.accent, color: T.bg, fontSize: 13, fontWeight: 700,
            fontFamily: T.fontDisplay, cursor: "pointer",
            opacity: (quoteLoading || scoresLoading) ? 0.6 : 1,
          }}>
            {scoresLoading ? "Analyzing..." : "Analyze"}
          </button>
        </form>

        {/* Quick picks */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.textDim, lineHeight: "28px", marginRight: 4 }}>Popular:</span>
          {POPULAR.map((sym) => (
            <button key={sym} aria-label={`Analyze ${sym}`} onClick={() => handleQuickPick(sym)} style={{
              padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
              background: activeSymbol === sym ? T.accentDim : "transparent",
              color: activeSymbol === sym ? T.accent : T.textDim,
              fontSize: 11, fontFamily: T.fontMono, cursor: "pointer",
              fontWeight: activeSymbol === sym ? 700 : 400,
            }}>
              {sym}
            </button>
          ))}
        </div>

        {/* Recent searches */}
        {recentSymbols.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.textDim, lineHeight: "28px", marginRight: 4 }}>Recent:</span>
            {recentSymbols.map((sym) => (
              <button key={sym} aria-label={`Re-analyze ${sym}`} onClick={() => handleQuickPick(sym)} style={{
                padding: "4px 12px", borderRadius: 6,
                border: `1px solid ${activeSymbol === sym ? "rgba(129,140,248,0.3)" : T.border}`,
                background: activeSymbol === sym ? T.proDim : "transparent",
                color: activeSymbol === sym ? T.pro : T.textDim,
                fontSize: 11, fontFamily: T.fontMono, cursor: "pointer",
                fontWeight: activeSymbol === sym ? 700 : 400,
              }}>
                {sym}
              </button>
            ))}
            {searchHistory.length > recentSymbols.length && (
              <a href="/history" aria-label="View full search history" style={{
                fontSize: 11, color: T.pro, textDecoration: "none",
                fontFamily: T.fontMono, marginLeft: 4,
              }}>
                +{searchHistory.length - recentSymbols.length} more →
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Error Display ── */}
      {(quoteError || scoresError) && (
        <div style={{
          padding: "12px 20px", marginBottom: 16, borderRadius: T.r,
          background: T.dangerDim, border: "1px solid rgba(239,68,68,0.2)",
          color: "#fca5a5", fontSize: 13,
        }}>
          {quoteError || scoresError}
        </div>
      )}

      {/* ── Stock Quote Card ── */}
      {quote && !quote.error && (
        <QuoteCard quote={quote} loading={quoteLoading} />
      )}

      {/* ── Active Selection Banner ── */}
      {selectedContract && activeSymbol && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 18px", marginBottom: 12, borderRadius: T.r,
          background: "rgba(0,212,170,0.06)", border: "1px solid rgba(0,212,170,0.15)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <span style={{ color: T.accent, fontWeight: 700, fontFamily: T.fontDisplay }}>SELECTED</span>
            <span style={{ color: T.text, fontFamily: T.fontMono, fontWeight: 600 }}>
              ${selectedContract.strike?.toFixed(2)} strike
            </span>
            <span style={{ color: T.textDim }}>·</span>
            <span style={{ color: T.text, fontFamily: T.fontMono }}>
              {selectedContract.expiration?.slice(5)} exp
            </span>
            <span style={{ color: T.textDim }}>·</span>
            <span style={{ color: T.accent, fontWeight: 700, fontFamily: T.fontMono }}>
              ${selectedContract.premium?.toFixed(2)} premium
            </span>
            <span style={{ color: T.textDim }}>·</span>
            <span style={{ fontFamily: T.fontMono, fontWeight: 700,
              color: selectedContract.compositeScore >= 70 ? T.success : selectedContract.compositeScore >= 40 ? T.accent : T.warn,
            }}>
              Score {selectedContract.compositeScore}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>auto-saved</span>
            <span style={{ fontSize: 10, color: T.accent }}>✓</span>
          </div>
        </div>
      )}

      {/* ── Loading State ── */}
      {scoresLoading && !scores && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
          padding: 40, textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ color: T.textDim, fontSize: 14 }}>
            Fetching options data and calculating scores...
          </div>
          <div style={{ color: T.textMuted, fontSize: 12, marginTop: 4 }}>
            This may take a few seconds on first load
          </div>
        </div>
      )}

      {/* ── Recommendations Table ── */}
      {scores && scores.recommendations && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "16px 24px", borderBottom: `1px solid ${T.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <h3 style={{
                margin: 0, fontSize: 15, fontWeight: 700, color: T.text,
                fontFamily: T.fontDisplay,
              }}>
                Covered Call Recommendations
              </h3>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 2, fontFamily: T.fontMono }}>
                {scores.recommendations.length} opportunities · {scores.provider} · {scores.delay}min delay
                {scores._stale && <span style={{ color: T.warn }}> · STALE DATA</span>}
              </div>
            </div>
            <button aria-label="Refresh covered call data" onClick={() => { refresh(); AnalyticsEvents.scoresRefreshed(activeSymbol); }} disabled={scoresLoading} style={{
              padding: "6px 14px", borderRadius: 6, border: `1px solid ${T.border}`,
              background: "transparent", color: T.textDim, fontSize: 11,
              cursor: "pointer", fontFamily: T.fontMono,
              opacity: scoresLoading ? 0.5 : 1,
            }}>
              {scoresLoading ? "..." : "↻ Refresh"}
            </button>
          </div>

          {scores.recommendations.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontSize: 14 }}>
              No covered call opportunities found for {scores.symbol} in the 7–60 day range.
              This can happen with low-volume or low-IV stocks.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table aria-label="Covered call recommendations" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["Score", "Strike", "Exp", "DTE", "Premium", "Yield", "Annual", "Prob OTM", "Δ Delta", "IV"].map((h) => (
                      <th key={h} scope="col" style={{
                        padding: "10px 12px", textAlign: "right", fontSize: 10, fontWeight: 600,
                        color: T.textDim, fontFamily: T.fontMono, letterSpacing: 0.5,
                        textTransform: "uppercase", whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.recommendations.map((rec, i) => (
                    <RecommendationRow
                      key={rec.contractSymbol}
                      rec={rec}
                      rank={i + 1}
                      isExpanded={expandedRow === i}
                      isSelected={selectedContract?.strike === rec.strike && selectedContract?.expiration === rec.expiration}
                      onToggle={() => handleRowToggle(i)}
                      underlyingPrice={scores.underlyingPrice}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Empty State ── */}
      {!activeSymbol && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
          padding: 48, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 8 }}>
            Find Covered Call Opportunities
          </h2>
          <p style={{ fontSize: 14, color: T.textDim, maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
            Enter a stock symbol above to see ranked covered call recommendations
            with premium yields, Greeks, probability analysis, and composite scores.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Stock Quote Card ───────────────────────────────────────────────────────

function QuoteCard({ quote, loading }) {
  const { T } = useTheme();
  const isUp = quote.change >= 0;
  const changeColor = isUp ? T.success : T.danger;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
      padding: "16px 24px", marginBottom: 16,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12,
      opacity: loading ? 0.7 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>
            {quote.symbol}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {quote.shortName}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontMono }}>
            ${quote.price?.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: changeColor, fontFamily: T.fontMono }}>
            {isUp ? "+" : ""}{quote.change?.toFixed(2)} ({isUp ? "+" : ""}{quote.changePercent?.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <QuoteStat label="Volume" value={formatNumber(quote.volume)} />
        <QuoteStat label="Mkt Cap" value={formatLargeNumber(quote.marketCap)} />
        <QuoteStat label="52W Range" value={`$${quote.fiftyTwoWeekLow?.toFixed(0)} – $${quote.fiftyTwoWeekHigh?.toFixed(0)}`} />
        <QuoteStat label="Div Yield" value={quote.dividendYield ? `${(quote.dividendYield * 100).toFixed(2)}%` : "—"} />
      </div>

      <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>
        {quote.delay}min delay · {quote.provider}
      </div>
    </div>
  );
}

function QuoteStat({ label, value }) {
  const { T } = useTheme();
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: T.textDim, fontFamily: T.fontMono, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Recommendation Row ─────────────────────────────────────────────────────

function RecommendationRow({ rec, rank, isExpanded, isSelected, onToggle, underlyingPrice }) {
  const { T } = useTheme();
  const scoreColor = rec.compositeScore >= 75 ? T.success
    : rec.compositeScore >= 50 ? T.accent
    : rec.compositeScore >= 30 ? T.warn
    : T.danger;

  // Highlight row if it's the user's current selection (even if collapsed)
  const selectedBorder = isSelected && !isExpanded
    ? `2px solid ${T.accent}33` : undefined;

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${rec.strike?.toFixed(2)} strike, ${rec.expiration?.slice(5)} expiry, score ${rec.compositeScore}. Click to ${isExpanded ? "collapse" : "expand"} details.`}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        style={{
          borderBottom: `1px solid ${T.border}`,
          cursor: "pointer",
          background: isExpanded ? T.surface : isSelected ? "rgba(0,212,170,0.03)" : "transparent",
          borderLeft: selectedBorder,
        }}
        onMouseOver={(e) => { if (!isExpanded) e.currentTarget.style.background = T.cardHover; }}
        onMouseOut={(e) => { if (!isExpanded) e.currentTarget.style.background = isSelected ? "rgba(0,212,170,0.03)" : "transparent"; }}
      >
        <Cell>
          <span style={{
            display: "inline-block", width: 36, height: 24, borderRadius: 6,
            background: `${scoreColor}22`, color: scoreColor,
            fontSize: 12, fontWeight: 800, fontFamily: T.fontMono,
            textAlign: "center", lineHeight: "24px",
          }}>
            {rec.compositeScore}
          </span>
        </Cell>
        <Cell mono>${rec.strike.toFixed(2)}</Cell>
        <Cell mono>{rec.expiration?.slice(5)}</Cell>
        <Cell mono>{rec.daysToExpiration}d</Cell>
        <Cell mono>${rec.premium.toFixed(2)}</Cell>
        <Cell mono accent>{(rec.premiumYield * 100).toFixed(2)}%</Cell>
        <Cell mono accent>{(rec.annualizedReturn * 100).toFixed(1)}%</Cell>
        <Cell mono>{(rec.probabilityOTM * 100).toFixed(0)}%</Cell>
        <Cell mono>{rec.delta?.toFixed(3)}</Cell>
        <Cell mono>{(rec.impliedVolatility * 100).toFixed(1)}%</Cell>
      </tr>

      {isExpanded && (
        <tr style={{ background: T.surface }}>
          <td colSpan={10} style={{ padding: "16px 20px" }}>
            <ExpandedDetails rec={rec} underlyingPrice={underlyingPrice} />
          </td>
        </tr>
      )}
    </>
  );
}

function Cell({ children, mono, accent }) {
  const { T } = useTheme();
  return (
    <td style={{
      padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap",
      fontFamily: mono ? T.fontMono : T.fontBody,
      color: accent ? T.accent : T.text,
      fontSize: 13,
    }}>
      {children}
    </td>
  );
}

// ─── Expanded Details Panel ─────────────────────────────────────────────────

function ExpandedDetails({ rec, underlyingPrice }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontSize: 12 }}>
      {/* Column 1: P&L */}
      <div style={{ background: T.card, borderRadius: T.r, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 10, fontFamily: T.fontDisplay }}>
          PROFIT & LOSS
        </div>
        <DetailRow label="Premium Income" value={`$${rec.premium.toFixed(2)} / share`} />
        <DetailRow label="Breakeven" value={`$${rec.breakeven.toFixed(2)}`} />
        <DetailRow label="Max Profit" value={`$${rec.maxProfit.toFixed(2)} (${(rec.maxProfitPercent * 100).toFixed(2)}%)`} />
        <DetailRow label="Downside Buffer" value={`${(rec.downProtection * 100).toFixed(2)}%`} />
        <div style={{ marginTop: 8, padding: "8px 10px", background: T.accentDim, borderRadius: 6, lineHeight: 1.5, color: T.textDim }}>
          If you own 100 shares at ${underlyingPrice?.toFixed(2)} and sell this call,
          you collect ${(rec.premium * 100).toFixed(0)} in premium. Your stock won't be called away
          unless it rises above ${rec.strike.toFixed(2)} by {rec.expiration?.slice(5)}.
        </div>
      </div>

      {/* Column 2: Greeks */}
      <div style={{ background: T.card, borderRadius: T.r, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 10, fontFamily: T.fontDisplay }}>
          GREEKS
        </div>
        <DetailRow label="Delta (Δ)" value={rec.delta?.toFixed(4)} />
        <DetailRow label="Gamma (Γ)" value={rec.gamma?.toFixed(4) || "—"} />
        <DetailRow label="Theta (Θ)" value={`${rec.theta?.toFixed(4)} / day`} />
        <DetailRow label="Vega (ν)" value={rec.vega?.toFixed(4) || "—"} />
        <DetailRow label="IV" value={`${(rec.impliedVolatility * 100).toFixed(1)}%`} />
        <div style={{ marginTop: 8, padding: "8px 10px", background: T.accentDim, borderRadius: 6, lineHeight: 1.5, color: T.textDim }}>
          Delta of {rec.delta?.toFixed(2)} means ~{(rec.probabilityOTM * 100).toFixed(0)}% chance this
          option expires worthless (you keep the premium + your shares).
        </div>
      </div>

      {/* Column 3: Score Breakdown */}
      <div style={{ background: T.card, borderRadius: T.r, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 10, fontFamily: T.fontDisplay }}>
          SCORE BREAKDOWN
        </div>
        <ScoreBar label="Yield (30%)" score={rec.scores.yield} />
        <ScoreBar label="Annualized (20%)" score={rec.scores.annualized} />
        <ScoreBar label="Probability (20%)" score={rec.scores.probability} />
        <ScoreBar label="Protection (15%)" score={rec.scores.protection} />
        <ScoreBar label="Time Value (15%)" score={rec.scores.timeValue} />
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: T.textDim }}>Composite</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.accent, fontFamily: T.fontMono }}>
            {rec.compositeScore}
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: T.textDim }}>
      <span>{label}</span>
      <span style={{ fontFamily: T.fontMono, color: T.text, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ScoreBar({ label, score }) {
  const { T } = useTheme();
  const color = score >= 70 ? T.success : score >= 40 ? T.accent : T.warn;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ color: T.textDim, fontSize: 11 }}>{label}</span>
        <span style={{ color, fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>{score}</span>
      </div>
      <div style={{ height: 4, background: T.surface, borderRadius: 2 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ─── Number Formatting ──────────────────────────────────────────────────────

function formatNumber(n) {
  if (!n) return "—";
  return n.toLocaleString();
}

function formatLargeNumber(n) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}
