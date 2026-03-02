// ─── src/components/TransactionsTab.jsx ───────────────────────────────────────
// Transaction log. Users can log positions from their search history or
// the active position, view logged trades, and copy all for Google Docs.

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePersistedState } from "../hooks/usePersistedState";
import { useTheme } from "../contexts/ThemeContext";

const Card = ({ children, style }) => {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: "20px 24px", marginBottom: 16, ...style,
    }}>{children}</div>
  );
};

const Badge = ({ children, color }) => {
  const { T } = useTheme();
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      fontFamily: T.fontMono, letterSpacing: 0.5, background: color + "18", color,
    }}>{children}</span>
  );
};

export default function TransactionsTab({ activePosition }) {
  const { T } = useTheme();
  const { searchHistory } = useAuth();
  const [transactions, setTransactions] = usePersistedState("cc:transactions", []);
  const [copied, setCopied] = useState(false);

  const logFromSearch = (entry) => {
    const tx = {
      id: Date.now(),
      symbol: entry.symbol,
      stockPrice: entry.stockPrice,
      strike: entry.selectedContract?.strike,
      premium: entry.selectedContract?.premium,
      expiration: entry.selectedContract?.expiration,
      score: entry.selectedContract?.score,
      loggedAt: new Date().toISOString(),
      status: "open",
    };
    setTransactions((prev) => [tx, ...prev]);
  };

  const logFromActive = () => {
    if (!activePosition?.symbol || !activePosition?.contract) return;
    const c = activePosition.contract;
    const tx = {
      id: Date.now(),
      symbol: activePosition.symbol,
      stockPrice: c.stockPrice,
      strike: c.strike,
      premium: c.premium,
      expiration: c.expiration,
      score: c.score,
      loggedAt: new Date().toISOString(),
      status: "open",
    };
    setTransactions((prev) => [tx, ...prev]);
  };

  const toggleStatus = (id) => {
    setTransactions((prev) => prev.map((tx) =>
      tx.id === id ? { ...tx, status: tx.status === "open" ? "closed" : "open" } : tx
    ));
  };

  const deleteTx = (id) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  const copyAll = () => {
    const lines = transactions.map((tx) =>
      `${tx.symbol} | Strike: $${tx.strike} | Premium: $${tx.premium} | Exp: ${tx.expiration} | Status: ${tx.status.toUpperCase()} | Logged: ${new Date(tx.loggedAt).toLocaleDateString()}`
    );
    const text = `COVERED CALLS TRANSACTION LOG\n${"=".repeat(40)}\n${lines.join("\n")}\n\nGenerated: ${new Date().toLocaleString()}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const loggableSearches = (searchHistory || []).filter((h) => h.selectedContract);
  const openCount = transactions.filter((tx) => tx.status === "open").length;
  const closedCount = transactions.filter((tx) => tx.status === "closed").length;

  return (
    <div>
      {/* Header + Quick Log */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}>📝</span>
          <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Transaction Log</h3>
          {transactions.length > 0 && (
            <>
              <Badge color={T.success}>{openCount} open</Badge>
              <Badge color={T.textDim}>{closedCount} closed</Badge>
            </>
          )}
        </div>

        {/* Log from active position */}
        {activePosition?.symbol && activePosition?.contract && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>
              Active position
            </div>
            <button aria-label={`Log position: ${activePosition.symbol} $${activePosition.contract.strike}`} onClick={logFromActive} style={{
              padding: "10px 16px", borderRadius: 8, cursor: "pointer",
              background: T.accentDim, border: `1px solid ${T.accent}33`, color: T.accent,
              fontSize: 12, fontWeight: 700, fontFamily: T.fontMono, transition: "all 0.2s",
            }}>
              + Log {activePosition.symbol} ${activePosition.contract.strike} ({activePosition.contract.expiration?.slice(5)})
            </button>
          </div>
        )}

        {/* Log from search history */}
        {loggableSearches.length > 0 && (
          <div>
            <div style={{ color: T.textDim, fontSize: 10, fontFamily: T.fontMono, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>
              From recent searches
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {loggableSearches.slice(0, 8).map((entry, i) => (
                <button key={i} aria-label={`Log ${entry.symbol} $${entry.selectedContract.strike} position`} onClick={() => logFromSearch(entry)} style={{
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  background: T.card, border: `1px solid ${T.border}`, color: T.text,
                  fontSize: 11, fontFamily: T.fontMono, transition: "border-color 0.2s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = T.borderActive}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = T.border}
                >
                  + {entry.symbol} ${entry.selectedContract.strike}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Transaction List */}
      {transactions.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <div style={{ color: T.text, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No transactions logged yet</div>
            <div style={{ color: T.textDim, fontSize: 12 }}>Search a symbol, select a contract, then log it here to track your positions.</div>
          </div>
        </Card>
      ) : (
        <>
          {transactions.map((tx) => (
            <Card key={tx.id} style={{ padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge color={T.accent} style={{ fontSize: 12, padding: "5px 12px" }}>{tx.symbol}</Badge>
                  <Badge color={T.pro}>${tx.strike} strike</Badge>
                  {tx.premium && <Badge color={T.success}>${tx.premium} premium</Badge>}
                  {tx.expiration && <Badge color={T.textDim}>{tx.expiration?.slice(5)}</Badge>}
                  <button aria-label={`Mark ${tx.symbol} as ${tx.status === "open" ? "closed" : "open"}`} onClick={() => toggleStatus(tx.id)} style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    fontFamily: T.fontMono, border: "none",
                    background: tx.status === "open" ? T.successDim : T.textMuted + "22",
                    color: tx.status === "open" ? T.success : T.textDim,
                  }}>
                    {tx.status === "open" ? "● OPEN" : "○ CLOSED"}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: T.textMuted, fontSize: 10, fontFamily: T.fontMono }}>
                    {new Date(tx.loggedAt).toLocaleDateString()}
                  </span>
                  <button aria-label={`Delete ${tx.symbol} transaction`} onClick={() => deleteTx(tx.id)} style={{
                    padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer",
                    background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted,
                  }}>✕</button>
                </div>
              </div>
            </Card>
          ))}

          {/* Copy All */}
          <Card style={{ padding: "12px 20px" }}>
            <button aria-label="Copy all transactions to clipboard" onClick={copyAll} style={{
              width: "100%", padding: "12px", borderRadius: 8, cursor: "pointer",
              background: copied ? T.successDim : T.accentDim,
              border: `1px solid ${copied ? T.success : T.accent}33`,
              color: copied ? T.success : T.accent,
              fontSize: 12, fontWeight: 700, fontFamily: T.fontMono, transition: "all 0.3s",
            }}>
              {copied ? "✓ Copied to Clipboard!" : "📋 Copy All for Google Docs"}
            </button>
          </Card>
        </>
      )}
    </div>
  );
}
