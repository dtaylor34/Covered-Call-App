// ─── src/components/SavedViewsList.jsx ───────────────────────────────────────
// Saved views organized in folders (collections).
// - User collections: manually named, drag items in/out
// - Auto folders: "CC Selects [Date]" for uncollected items
// - Drag handle on each tile to reorder within and between folders
// - Folder collapsed/expanded state persists to localStorage
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  getFirestore, collection as fbCol, onSnapshot,
  deleteDoc, doc, query, orderBy,
  addDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

function toDateStr(val) {
  if (!val) return null;
  if (typeof val === "string") return val.slice(0, 10);
  if (val?.toDate) return val.toDate().toISOString().slice(0, 10);
  return null;
}

function formatFolderDate(dateSlice) {
  if (!dateSlice) return "CC Selects";
  const d = new Date(dateSlice + "T12:00:00");
  return `CC Selects ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

function RemoveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor">
      <path d="M0 0h24v24H0z" fill="none"/>
      <path d="M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    </svg>
  );
}

function AddIcon({ size = 14 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height={size} viewBox="0 0 24 24" width={size} fill="currentColor">
      <path d="M0 0h24v24H0z" fill="none"/>
      <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    </svg>
  );
}

export default function SavedViewsList({ onEditView }) {
  const { T, isMobile } = useTheme();
  const { currentUser } = useAuth();
  const db = getFirestore();

  const [views, setViews]                           = useState([]);
  const [userCollections, setUserCollections]       = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [deletingId, setDeletingId]                 = useState(null);
  const [menuOpen, setMenuOpen]                     = useState(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName]   = useState("");
  const [dragViewId, setDragViewId]                 = useState(null);
  const [dragOverFolder, setDragOverFolder]         = useState(null);
  const [folderMenuOpen, setFolderMenuOpen]         = useState(null);
  const [editingFolderId, setEditingFolderId]       = useState(null);
  const [editingFolderName, setEditingFolderName]   = useState("");

  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cc:folders:collapsed") || "{}"); }
    catch { return {}; }
  });

  useEffect(() => {
    if (!currentUser?.uid) return;
    const ref = fbCol(db, "users", currentUser.uid, "savedViews");
    const unsub = onSnapshot(query(ref, orderBy("updatedAt", "desc")), (snap) => {
      setViews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const ref = fbCol(db, "users", currentUser.uid, "savedViewCollections");
    const unsub = onSnapshot(ref, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setUserCollections(docs);
    });
    return unsub;
  }, [currentUser?.uid]);

  const toggleCollapsed = useCallback((folderId) => {
    setCollapsed((prev) => {
      const next = { ...prev, [folderId]: !prev[folderId] };
      localStorage.setItem("cc:folders:collapsed", JSON.stringify(next));
      return next;
    });
  }, []);

  const viewsIn = (collId) =>
    views.filter((v) => v.collectionId === collId)
         .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const uncollected = views.filter((v) => !v.collectionId);
  const autoFolderMap = {};
  uncollected.forEach((v) => {
    const slice = toDateStr(v.createdAt) || toDateStr(v.updatedAt) || "unknown";
    if (!autoFolderMap[slice]) autoFolderMap[slice] = [];
    autoFolderMap[slice].push(v);
  });
  const autoFolders = Object.entries(autoFolderMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([slice, items]) => ({
      id: `auto-${slice}`,
      name: formatFolderDate(slice),
      type: "auto",
      views: items,
    }));

  const handleDelete = async (id) => {
    if (!currentUser?.uid) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "savedViews", id));
    setDeletingId(null);
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name || !currentUser?.uid) return;
    await addDoc(fbCol(db, "users", currentUser.uid, "savedViewCollections"), {
      name,
      order: userCollections.length,
      createdAt: serverTimestamp(),
    });
    setNewCollectionName("");
    setCreatingCollection(false);
  };

  const handleDeleteCollection = async (collId) => {
    if (!currentUser?.uid) return;
    await Promise.all(
      viewsIn(collId).map((v) =>
        updateDoc(doc(db, "users", currentUser.uid, "savedViews", v.id), { collectionId: null })
      )
    );
    await deleteDoc(doc(db, "users", currentUser.uid, "savedViewCollections", collId));
  };

  const handleRenameCollection = async (collId) => {
    const name = editingFolderName.trim();
    if (!name || !currentUser?.uid) return;
    await updateDoc(doc(db, "users", currentUser.uid, "savedViewCollections", collId), { name });
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDropOnFolder = async (targetFolderId) => {
    if (!dragViewId || !currentUser?.uid) return;
    const collectionId = targetFolderId.startsWith("auto-") ? null : targetFolderId;
    await updateDoc(doc(db, "users", currentUser.uid, "savedViews", dragViewId), {
      collectionId: collectionId ?? null,
      order: Date.now(),
    });
    setDragViewId(null);
    setDragOverFolder(null);
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontSize: 13 }}>
      Loading saved views...
    </div>
  );

  if (views.length === 0) return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📌</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>
        No saved views yet
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: T.textDim, lineHeight: 1.6 }}>
        Go to <strong style={{ color: T.accent }}>Position Finder</strong> and click the{" "}
        <strong style={{ color: T.accent }}>+</strong> icon next to any contract to save it here.
      </p>
    </div>
  );

  const allFolders = [
    ...userCollections.map((c) => ({ ...c, type: "user", views: viewsIn(c.id) })),
    ...autoFolders,
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>
            Saved Views
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
            {views.length} saved position{views.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setCreatingCollection(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8, cursor: "pointer",
            background: T.accentDim, border: `1px solid ${T.accent}33`,
            color: T.accent, fontSize: 12, fontWeight: 600, fontFamily: T.fontBody,
          }}
        >
          <AddIcon size={14} /> Create Collection
        </button>
      </div>

      {/* New Collection Input */}
      {creatingCollection && (
        <div style={{ marginBottom: 16, padding: 16, background: T.card, border: `1px solid ${T.accent}44`, borderRadius: T.rL }}>
          <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Collection Name
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCollection();
                if (e.key === "Escape") { setCreatingCollection(false); setNewCollectionName(""); }
              }}
              placeholder="e.g. High Yield Plays"
              style={{
                flex: 1, padding: "9px 14px", borderRadius: 8, fontSize: 13,
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.text, outline: "none", fontFamily: T.fontBody,
              }}
            />
            <button
              onClick={handleCreateCollection}
              disabled={!newCollectionName.trim()}
              style={{
                padding: "9px 18px", borderRadius: 8, cursor: "pointer",
                background: T.accent, border: "none", color: "#000",
                fontWeight: 700, fontSize: 12, opacity: newCollectionName.trim() ? 1 : 0.5,
              }}
            >
              Create
            </button>
            <button
              onClick={() => { setCreatingCollection(false); setNewCollectionName(""); }}
              style={{
                padding: "9px 14px", borderRadius: 8, cursor: "pointer",
                background: "transparent", border: `1px solid ${T.border}`,
                color: T.textDim, fontSize: 12,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folders */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allFolders.map((folder) => {
          const isCollapsed = collapsed[folder.id];
          const isDragTarget = dragOverFolder === folder.id;
          return (
            <div
              key={folder.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverFolder(null); }}
              onDrop={() => handleDropOnFolder(folder.id)}
              style={{
                border: `1px solid ${isDragTarget ? T.accent : T.border}`,
                borderRadius: T.rL, background: isDragTarget ? `${T.accent}08` : T.card,
                overflow: "hidden", transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {/* Folder Header */}
              <div
                onClick={() => toggleCollapsed(folder.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", cursor: "pointer", userSelect: "none",
                  background: T.surface,
                  borderBottom: isCollapsed ? "none" : `1px solid ${T.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    display: "inline-block", fontSize: 11, color: T.textDim,
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}>▾</span>
                  <span style={{ fontSize: 13 }}>{folder.type === "user" ? "📁" : "📅"}</span>
                  {editingFolderId === folder.id ? (
                    <input
                      autoFocus
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") handleRenameCollection(folder.id);
                        if (e.key === "Escape") { setEditingFolderId(null); setEditingFolderName(""); }
                      }}
                      style={{
                        fontSize: 13, fontWeight: 600, fontFamily: T.fontDisplay,
                        background: T.card, border: `1px solid ${T.accent}`,
                        borderRadius: 6, color: T.accent, padding: "2px 8px",
                        outline: "none", width: 180,
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: folder.type === "user" ? T.accent : T.text, fontFamily: T.fontDisplay }}>
                      {folder.name}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
                    ({folder.views.length})
                  </span>
                </div>
                {folder.type === "user" && (
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDeleteCollection(folder.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 11, padding: "2px 6px", borderRadius: 4, transition: "color 0.15s" }}
                      onMouseOver={(e) => e.currentTarget.style.color = T.danger}
                      onMouseOut={(e) => e.currentTarget.style.color = T.textMuted}
                    >
                      Remove folder
                    </button>
                    <button
                      onClick={() => setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id)}
                      aria-label="Folder options"
                      style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 18, padding: "2px 6px", borderRadius: 6, lineHeight: 1 }}
                    >
                      ⋯
                    </button>
                    {folderMenuOpen === folder.id && (
                      <>
                        <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setFolderMenuOpen(null)} />
                        <div style={{
                          position: "absolute", top: "100%", right: 0, zIndex: 50,
                          background: T.surface, border: `1px solid ${T.border}`,
                          borderRadius: 10, overflow: "hidden", minWidth: 160,
                          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                        }}>
                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                              setFolderMenuOpen(null);
                            }}
                            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, color: T.text, fontFamily: T.fontBody }}
                          >
                            ✏️  Rename
                          </button>
                          <button
                            onClick={() => { handleDeleteCollection(folder.id); setFolderMenuOpen(null); }}
                            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, color: T.danger, fontFamily: T.fontBody }}
                          >
                            🗑️  Delete folder
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Folder Items */}
              {!isCollapsed && (
                <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {folder.views.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: T.textMuted, fontSize: 12, border: `1px dashed ${T.border}`, borderRadius: 8, fontFamily: T.fontMono }}>
                      Drag items here to add them
                    </div>
                  ) : folder.views.map((view) => (
                    <ViewTile
                      key={view.id}
                      view={view}
                      isDragging={dragViewId === view.id}
                      menuOpen={menuOpen === view.id}
                      onMenuToggle={() => setMenuOpen(menuOpen === view.id ? null : view.id)}
                      onMenuClose={() => setMenuOpen(null)}
                      onEdit={() => { setMenuOpen(null); onEditView(view); }}
                      onDelete={() => { setMenuOpen(null); setDeletingId(view.id); }}
                      onDragStart={() => setDragViewId(view.id)}
                      onDragEnd={() => { setDragViewId(null); setDragOverFolder(null); }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirm */}
      {deletingId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setDeletingId(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: T.rL, padding: 24, width: "100%", maxWidth: 340 }}>
            <h4 style={{ margin: "0 0 8px", color: T.danger, fontSize: 16, fontFamily: T.fontDisplay }}>Delete View?</h4>
            <p style={{ margin: "0 0 20px", color: T.textDim, fontSize: 13, lineHeight: 1.5 }}>
              "{views.find((v) => v.id === deletingId)?.name}" will be permanently removed.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeletingId(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={() => handleDelete(deletingId)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: T.danger, border: "none", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewTile({ view, isDragging, menuOpen, onMenuToggle, onMenuClose, onEdit, onDelete, onDragStart, onDragEnd }) {
  const { T, isMobile } = useTheme();
  const contract = view.contract || {};
  const updatedAt = view.updatedAt?.toDate?.();
  const scoreColor = contract.score >= 70 ? T.success : contract.score >= 50 ? T.accent : contract.score >= 30 ? T.warn : T.danger;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.rL, padding: "14px 16px",
        display: "flex", alignItems: "flex-start", gap: 10,
        opacity: isDragging ? 0.35 : 1, transition: "opacity 0.15s",
      }}
    >
      {/* Drag Handle */}
      <div title="Drag to reorder" style={{ cursor: "grab", color: T.textMuted, fontSize: 18, paddingTop: 2, flexShrink: 0, userSelect: "none" }}>⠿</div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.accent, fontFamily: T.fontDisplay }}>{view.symbol}</span>
              {contract.score != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor, background: `${scoreColor}22`, borderRadius: 6, padding: "2px 8px", fontFamily: T.fontMono }}>
                  Score {contract.score}
                </span>
              )}
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontDisplay }}>{view.name}</p>
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              onClick={onDelete}
              aria-label="Remove from saved views"
              style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", color: T.textMuted, padding: 0, transition: "all 0.15s" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = T.danger; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMuted; }}
            >
              <RemoveIcon />
            </button>
            <button onClick={onMenuToggle} aria-label="View options" style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 18, padding: "2px 6px", borderRadius: 6 }}>⋯</button>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={onMenuClose} />
                <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 50, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                  <button onClick={onEdit} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, color: T.text }}>✏️  Edit View</button>
                  <button onClick={onDelete} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, color: T.danger }}>🗑️  Delete</button>
                </div>
              </>
            )}
          </div>
        </div>

        {contract.strike && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "8px 16px", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <Stat label="Strike"      value={`$${contract.strike?.toFixed(2)}`} />
            <Stat label="Expiry"      value={contract.expiration?.slice(5) || "—"} />
            <Stat label="Premium"     value={contract.premium != null ? `$${(contract.premium * 100).toFixed(0)}` : "—"} color={T.success} />
            <Stat label="Stock Price" value={view.stockPrice != null ? `$${view.stockPrice?.toFixed(2)}` : "—"} />
          </div>
        )}

        {updatedAt && (
          <p style={{ margin: "8px 0 0", fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>
            Saved {updatedAt.toLocaleDateString()} · {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
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
