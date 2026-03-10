// ─── src/components/SavedViewsList.jsx ───────────────────────────────────────
// Displays saved position views from Firestore.
// Each tile shows symbol, contract details, score, and a ⋯ menu.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  getFirestore, collection, onSnapshot,
  deleteDoc, doc, query, orderBy,
} from "firebase/firestore";

export default function SavedViewsList({ onEditView }) {
  const { T, isMobile } = useTheme();
  const { currentUser } = useAuth();
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const db = getFirestore();
    const ref = collection(db, "users", currentUser.uid, "savedViews");
    const q = query(ref, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setViews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [currentUser?.uid]);

  const handleDelete = async (id) => {
    if (!currentUser?.uid) return;
    const db = getFirestore();
    await deleteDoc(doc(db, "users", currentUser.uid, "savedViews", id));
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontSize: 13 }}>
        Loading saved views...
      </div>
    );
  }

  if (views.length === 0) {
    return (
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.rL, padding: "48px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📌</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>
          No saved views yet
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: T.textDim, lineHeight: 1.6 }}>
          Go to <strong style={{ color: T.accent }}>Position Finder</strong>, select a contract,
          then click <strong style={{ color: T.accent }}>Save View</strong> to bookmark it here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>
            Saved Views
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
            {views.length} saved position{views.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {views.map((view) => (
          <ViewTile
            key={view.id}
            view={view}
            menuOpen={menuOpen === view.id}
            onMenuToggle={() => setMenuOpen(menuOpen === view.id ? null : view.id)}
            onMenuClose={() => setMenuOpen(null)}
            onEdit={() => { setMenuOpen(null); onEditView(view); }}
            onDelete={() => { setMenuOpen(null); setDeletingId(view.id); }}
          />
        ))}
      </div>

      {deletingId && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setDeletingId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: T.surface, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: T.rL, padding: 24, width: "100%", maxWidth: 340 }}
          >
            <h4 style={{ margin: "0 0 8px", color: T.danger, fontSize: 16, fontFamily: T.fontDisplay }}>Delete View?</h4>
            <p style={{ margin: "0 0 20px", color: T.textDim, fontSize: 13, lineHeight: 1.5 }}>
              "{views.find((v) => v.id === deletingId)?.name}" will be permanently removed.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeletingId(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", fontFamily: T.fontBody, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deletingId)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: T.danger, border: "none", color: "#fff", cursor: "pointer", fontFamily: T.fontBody, fontSize: 13, fontWeight: 700 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewTile({ view, menuOpen, onMenuToggle, onMenuClose, onEdit, onDelete }) {
  const { T, isMobile } = useTheme();
  const contract = view.contract || {};
  const updatedAt = view.updatedAt?.toDate?.();
  const scoreColor = contract.score >= 70 ? T.success : contract.score >= 50 ? T.accent : contract.score >= 30 ? T.warn : T.danger;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, padding: "16px 20px", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay }}>{view.symbol}</span>
            {contract.score != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor, background: `${scoreColor}22`, borderRadius: 6, padding: "2px 8px", fontFamily: T.fontMono }}>
                Score {contract.score}
              </span>
            )}
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontDisplay }}>{view.name}</p>
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={onMenuToggle} aria-label="View options" style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 20, padding: "2px 8px", fontFamily: T.fontBody, borderRadius: 6 }}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={onMenuClose} />
              <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 50, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                <button onClick={onEdit} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, color: T.text, fontFamily: T.fontBody }}>
                  ✏️  Edit View
                </button>
                <button onClick={onDelete} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, color: T.danger, fontFamily: T.fontBody }}>
                  🗑️  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {contract.strike && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "10px 16px", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <Stat label="Strike" value={`$${contract.strike?.toFixed(2)}`} />
          <Stat label="Expiry" value={contract.expiration?.slice(5) || "—"} />
          <Stat label="Premium" value={contract.premium != null ? `$${(contract.premium * 100).toFixed(0)}` : "—"} color={T.success} />
          <Stat label="Stock Price" value={view.stockPrice != null ? `$${view.stockPrice?.toFixed(2)}` : "—"} />
        </div>
      )}

      {updatedAt && (
        <p style={{ margin: "10px 0 0", fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>
          Saved {updatedAt.toLocaleDateString()} · {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  const { T } = useTheme();
  return (
    <div>
      <p style={{ margin: "0 0 3px", fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: T.fontMono }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: color || T.text, fontFamily: T.fontMono }}>{value}</p>
    </div>
  );
}
