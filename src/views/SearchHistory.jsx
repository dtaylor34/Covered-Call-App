// ─── src/views/SearchHistory.jsx ─────────────────────────────────────────────
// Full search history with saved research context.
//
// Each row shows:
//   - Symbol badge (clickable → dashboard)
//   - Saved contract details (strike, premium, score, yield) if user selected one
//   - Stock price at time of research
//   - Timestamp (when searched, when last updated)
//
// Clicking ANYWHERE on the row content (symbol, contract details, price)
// navigates back to the dashboard with the full saved context restored:
//   - Symbol auto-loads
//   - Previously selected contract row auto-expands
//   - Any new selection auto-updates this history entry
//
// Management:
//   - Checkbox per row + Select All master toggle
//   - Individual delete (trash per row)
//   - Batch delete selected
//   - Clear all history
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AnalyticsEvents } from "../services/analytics";
import { T } from "../theme";

export default function SearchHistory() {
  const {
    searchHistory,
    deleteFromSearchHistory,
    clearSearchHistory,
  } = useAuth();
  const navigate = useNavigate();

  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const history = useMemo(() => searchHistory || [], [searchHistory]);
  const allSymbols = useMemo(() => history.map((h) => h.symbol), [history]);

  // ── Select All / Deselect All ──
  const allSelected = history.length > 0 && selected.size === history.length;
  const someSelected = selected.size > 0 && selected.size < history.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allSymbols));
    }
  };

  const toggleSelect = (symbol) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // ── Delete single item ──
  const handleDeleteOne = async (symbol) => {
    setDeleting(true);
    await deleteFromSearchHistory([symbol]);
    AnalyticsEvents.historyItemDeleted(symbol);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(symbol);
      return next;
    });
    setDeleting(false);
  };

  // ── Batch delete selected ──
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    const count = selected.size;
    await deleteFromSearchHistory([...selected]);
    AnalyticsEvents.historyBatchDeleted(count);
    setSelected(new Set());
    setDeleting(false);
  };

  // ── Clear all ──
  const handleClearAll = async () => {
    setDeleting(true);
    const count = history.length;
    await clearSearchHistory();
    AnalyticsEvents.historyCleared(count);
    setSelected(new Set());
    setConfirmClear(false);
    setDeleting(false);
  };

  // ── Navigate to dashboard with full saved context ──
  // Passes symbol + selectedContract via router state so the dashboard
  // can restore exactly where the user left off and auto-expand that row.
  const handleOpenEntry = (entry) => {
    AnalyticsEvents.historyEntryClicked(entry.symbol, !!entry.selectedContract);
    navigate("/", {
      state: {
        symbol: entry.symbol,
        selectedContract: entry.selectedContract || null,
        stockPrice: entry.stockPrice || null,
      },
    });
  };

  // ── Format timestamp ──
  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const formatFullDate = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontBody, padding: "20px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.textDim, fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ←
            </button>
            <div>
              <h1 style={{
                margin: 0, fontSize: 20, fontWeight: 800, color: T.text,
                fontFamily: T.fontDisplay,
              }}>
                Search History
              </h1>
              <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>
                {history.length} search{history.length !== 1 ? "es" : ""} saved
              </div>
            </div>
          </div>

          {/* Clear All button */}
          {history.length > 0 && (
            <div style={{ position: "relative" }}>
              {!confirmClear ? (
                <button
                  onClick={() => setConfirmClear(true)}
                  style={{
                    padding: "8px 16px", borderRadius: 8,
                    background: "transparent", border: `1px solid ${T.border}`,
                    color: T.textDim, fontSize: 12, cursor: "pointer",
                    fontFamily: T.fontBody,
                  }}
                >
                  Clear All History
                </button>
              ) : (
                <div style={{
                  display: "flex", gap: 6, alignItems: "center",
                  padding: "6px 10px", borderRadius: 8,
                  background: T.dangerDim, border: "1px solid rgba(239,68,68,0.3)",
                }}>
                  <span style={{ fontSize: 12, color: "#fca5a5" }}>Delete all {history.length} items?</span>
                  <button
                    onClick={handleClearAll}
                    disabled={deleting}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "none",
                      background: T.danger, color: "#fff", fontSize: 11,
                      fontWeight: 700, cursor: deleting ? "wait" : "pointer",
                    }}
                  >
                    {deleting ? "..." : "Yes, clear"}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, border: "none",
                      background: "transparent", color: T.textDim, fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Batch Actions Bar ── */}
        {selected.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", marginBottom: 12, borderRadius: T.r,
            background: "rgba(129,140,248,0.08)",
            border: "1px solid rgba(129,140,248,0.2)",
          }}>
            <span style={{ fontSize: 13, color: T.pro, fontWeight: 600 }}>
              {selected.size} item{selected.size !== 1 ? "s" : ""} selected
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSelected(new Set())}
                style={{
                  padding: "6px 14px", borderRadius: 6,
                  background: "transparent", border: "1px solid rgba(129,140,248,0.3)",
                  color: T.pro, fontSize: 12, cursor: "pointer",
                }}
              >
                Deselect
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                style={{
                  padding: "6px 14px", borderRadius: 6,
                  background: T.danger, border: "none",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: deleting ? "wait" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "Deleting..." : `Delete ${selected.size} item${selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* ── History List ── */}
        {history.length === 0 ? (
          <div style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
            padding: 48, textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 6 }}>
              No search history yet
            </h2>
            <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              Search for a stock symbol on the dashboard and it will appear here automatically.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: T.accent, color: T.bg, fontSize: 13,
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
            overflow: "hidden",
          }}>
            {/* ── Column Header with Select All ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 36px",
              alignItems: "center", gap: 12,
              padding: "10px 16px",
              borderBottom: `1px solid ${T.border}`,
              background: T.surface,
            }}>
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleSelectAll}
              />
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase",
              }}>
                {allSelected ? "Deselect all" : someSelected ? `${selected.size} selected` : "Select all"}
              </span>
              <span /> {/* spacer for delete col */}
            </div>

            {/* ── Rows ── */}
            {history.map((entry, i) => (
              <HistoryRow
                key={`${entry.symbol}-${entry.searchedAt}`}
                entry={entry}
                isChecked={selected.has(entry.symbol)}
                onToggleCheck={() => toggleSelect(entry.symbol)}
                onDelete={() => handleDeleteOne(entry.symbol)}
                onOpen={() => handleOpenEntry(entry)}
                formatTime={formatTime}
                formatFullDate={formatFullDate}
                deleting={deleting}
                isLast={i === history.length - 1}
              />
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        {history.length > 0 && (
          <div style={{
            textAlign: "center", marginTop: 16, fontSize: 11, color: T.textMuted,
            fontFamily: T.fontMono,
          }}>
            {history.length} of 50 max · Click any row to continue research on the dashboard
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY ROW — full research card
// ═══════════════════════════════════════════════════════════════════════════════

function HistoryRow({ entry, isChecked, onToggleCheck, onDelete, onOpen, formatTime, formatFullDate, deleting, isLast }) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const c = entry.selectedContract;
  const hasContract = c && c.strike != null;

  const scoreColor = !hasContract ? T.textMuted
    : c.compositeScore >= 75 ? T.success
    : c.compositeScore >= 50 ? T.accent
    : c.compositeScore >= 30 ? T.warn
    : T.danger;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr 36px",
        alignItems: "center", gap: 12,
        padding: "14px 16px",
        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
        background: isChecked
          ? "rgba(129,140,248,0.06)"
          : hovered ? T.cardHover : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* ── Checkbox ── */}
      <Checkbox checked={isChecked} onChange={onToggleCheck} />

      {/* ── Clickable content area → navigates to dashboard ── */}
      <button
        onClick={onOpen}
        style={{
          all: "unset", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 14,
          width: "100%", minWidth: 0,
        }}
      >
        {/* Symbol badge */}
        <span style={{
          display: "inline-block", flexShrink: 0,
          padding: "6px 14px", borderRadius: 6,
          background: T.accentDim,
          border: `1px solid ${hovered ? "rgba(0,212,170,0.35)" : "rgba(0,212,170,0.15)"}`,
          fontSize: 15, fontWeight: 800, fontFamily: T.fontMono,
          color: T.accent, letterSpacing: 0.5,
          minWidth: 60, textAlign: "center",
          transition: "border-color 0.15s",
        }}>
          {entry.symbol}
        </span>

        {/* Details area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasContract ? (
            /* ── Row with saved contract data ── */
            <div>
              {/* Top line: contract summary */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 4,
                  background: `${scoreColor}18`, color: scoreColor,
                  fontSize: 11, fontWeight: 800, fontFamily: T.fontMono,
                }}>
                  {c.compositeScore}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.fontMono }}>
                  ${c.strike?.toFixed(2)} strike
                </span>
                <span style={{ fontSize: 11, color: T.textDim }}>·</span>
                <span style={{ fontSize: 12, color: T.text, fontFamily: T.fontMono }}>
                  ${c.premium?.toFixed(2)} premium
                </span>
                <span style={{ fontSize: 11, color: T.textDim }}>·</span>
                <span style={{ fontSize: 12, color: T.accent, fontFamily: T.fontMono, fontWeight: 600 }}>
                  {c.annualizedReturn != null ? `${(c.annualizedReturn * 100).toFixed(1)}% ann.` : ""}
                </span>
              </div>
              {/* Bottom line: meta */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                  Exp {c.expiration?.slice(5)}
                </span>
                {c.daysToExpiration != null && (
                  <>
                    <span style={{ fontSize: 9, color: T.textMuted }}>·</span>
                    <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                      {c.daysToExpiration}d out
                    </span>
                  </>
                )}
                {c.probabilityOTM != null && (
                  <>
                    <span style={{ fontSize: 9, color: T.textMuted }}>·</span>
                    <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                      {(c.probabilityOTM * 100).toFixed(0)}% OTM
                    </span>
                  </>
                )}
                {entry.stockPrice != null && (
                  <>
                    <span style={{ fontSize: 9, color: T.textMuted }}>·</span>
                    <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                      Stock was ${entry.stockPrice.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ── Row without a saved contract — symbol-only search ── */
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: T.textDim }}>
                {entry.stockPrice != null
                  ? `Stock at $${entry.stockPrice.toFixed(2)}`
                  : "No contract selected"
                }
              </span>
              <span style={{
                padding: "2px 8px", borderRadius: 4,
                background: "rgba(255,255,255,0.04)",
                fontSize: 10, color: T.textMuted, fontFamily: T.fontMono,
              }}>
                search only
              </span>
            </div>
          )}
        </div>

        {/* Timestamp + hover hint */}
        <div style={{ flexShrink: 0, textAlign: "right", minWidth: 75 }}>
          {hovered ? (
            <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, whiteSpace: "nowrap" }}>
              Continue →
            </span>
          ) : (
            <div>
              <div
                title={formatFullDate(entry.lastUpdatedAt || entry.searchedAt)}
                style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, whiteSpace: "nowrap" }}
              >
                {formatTime(entry.lastUpdatedAt || entry.searchedAt)}
              </div>
              {entry.lastUpdatedAt && entry.lastUpdatedAt !== entry.searchedAt && (
                <div style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono }}>
                  updated
                </div>
              )}
            </div>
          )}
        </div>
      </button>

      {/* ── Delete button ── */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        {confirmDelete ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: T.danger, border: "none",
              color: "#fff", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Confirm delete"
          >
            ✓
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent",
              border: `1px solid ${hovered ? "rgba(239,68,68,0.3)" : "transparent"}`,
              color: hovered ? "#fca5a5" : "transparent",
              fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            title="Delete this search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKBOX
// ═══════════════════════════════════════════════════════════════════════════════

function Checkbox({ checked, indeterminate, onChange }) {
  const borderColor = checked || indeterminate ? T.accent : "rgba(255,255,255,0.15)";
  const bgColor = checked ? T.accent : indeterminate ? T.accent : "transparent";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
        padding: 0,
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke={T.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {indeterminate && !checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 6H9" stroke={T.bg} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}
