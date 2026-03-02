// ─── src/views/AdminPanel.jsx ────────────────────────────────────────────────
// Admin panel that reads/writes real Firestore data.
// Gated by role field in user's Firestore document.

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  collection, getDocs, doc, updateDoc, addDoc, query, orderBy, limit, deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { ROLES, hasPermission, STATUS_STYLES } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import AdminAnalytics from "../components/AdminAnalytics";

// ── Helpers ──
const relTime = (iso) => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const trialLeft = (ts) => Math.max(0, Math.ceil(7 - (Date.now() - new Date(ts).getTime()) / 864e5));

// ── Small reusable components ──
function Pill({ label, color, bg }) {
  const { T } = useTheme();
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 5, background: bg, color, fontSize: 10, fontWeight: 700, fontFamily: T.fontMono, letterSpacing: 0.8 }}>{label}</span>;
}

function Btn({ children, onClick, disabled, variant = "accent", style: xs }) {
  const { T } = useTheme();
  const [h, setH] = useState(false);
  const v = { accent: { bg: T.accent, c: "#06090f", hbg: "#00e8bb" }, outline: { bg: "transparent", c: T.accent, hbg: T.accentDim, bdr: T.accent }, pro: { bg: T.pro, c: "#fff", hbg: "#6366f1" }, warn: { bg: T.warn, c: "#fff", hbg: "#d97706" }, danger: { bg: T.danger, c: "#fff", hbg: "#dc2626" }, ghost: { bg: "transparent", c: T.textDim, hbg: "rgba(255,255,255,0.04)" } }[variant];
  return <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 20px", borderRadius: T.r, background: h ? v.hbg : v.bg, color: v.c, border: v.bdr ? `1px solid ${v.bdr}` : "none", fontSize: 13, fontWeight: 700, fontFamily: T.fontBody, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, transition: "all 0.15s", ...xs }}>{children}</button>;
}

function SmallBtn({ label, color, onClick }) {
  const { T } = useTheme();
  const [h, setH] = useState(false);
  return <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ padding: "5px 12px", borderRadius: 5, background: h ? `${color}20` : "rgba(255,255,255,0.02)", border: `1px solid ${h ? `${color}40` : T.border}`, color: h ? color : T.textDim, fontSize: 10, fontWeight: 600, fontFamily: T.fontBody, cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}>{label}</button>;
}

function Modal({ open, onClose, title, children }) {
  const { T } = useTheme();
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, border: `1px solid ${T.borderActive}`, borderRadius: T.rL, padding: "28px 32px", width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>{title}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.04)", border: "none", color: T.textDim, width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  const { T } = useTheme();
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, padding: "18px 20px", flex: 1, minWidth: 140 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase" }}>{label}</span>
        {icon && <span style={{ fontSize: 14, opacity: 0.35 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || T.text, fontFamily: T.fontDisplay }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PANEL
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminPanel() {
  const { T } = useTheme();
  const { role, email: adminEmail, uid: adminUid, name: adminName, logout } = useAuth();
  const [view, setView] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);
  const [actUser, setActUser] = useState(null);
  const [formVal, setFormVal] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Invite modal state
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState("moderator");

  const showToast = (msg, color) => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };
  const roleConfig = ROLES[role] || ROLES.moderator;

  // ── Fetch all users from Firestore ──
  const fetchUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setUsers(list);
    } catch (e) {
      console.error("Error fetching users:", e);
      showToast("Failed to load users: " + e.message, T.danger);
    }
  }, []);

  // ── Fetch audit log ──
  const fetchAuditLog = useCallback(async () => {
    try {
      const q = query(collection(db, "auditLog"), orderBy("timestamp", "desc"), limit(50));
      const snap = await getDocs(q);
      setAuditLog(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching audit log:", e);
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      await Promise.all([fetchUsers(), fetchAuditLog()]);
      setLoadingData(false);
    }
    load();
  }, [fetchUsers, fetchAuditLog]);

  // ── Write audit log entry to Firestore ──
  const writeAudit = async (action, target, details) => {
    const entry = {
      action,
      performedBy: { uid: adminUid, email: adminEmail, role },
      target,
      details,
      timestamp: new Date().toISOString(),
    };
    try {
      await addDoc(collection(db, "auditLog"), entry);
      setAuditLog(prev => [{ ...entry, id: "local_" + Date.now() }, ...prev]);
    } catch (e) {
      console.error("Audit write failed:", e);
    }
  };

  // ── Update a user's Firestore document ──
  const updateUser = async (uid, fields) => {
    try {
      await updateDoc(doc(db, "users", uid), fields);
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...fields } : u));
      return true;
    } catch (e) {
      showToast("Update failed: " + e.message, T.danger);
      return false;
    }
  };

  // ── Admin actions ──
  const doAction = (action, user) => {
    setActUser(user);
    setFormVal(action === "changePrice" ? String(user.monthlyRate || 10) : "");
    setModal(action);
  };

  const confirm = async () => {
    if (!actUser) return;
    switch (modal) {
      case "changePrice": {
        const p = parseFloat(formVal);
        if (isNaN(p) || p < 0) return;
        if (await updateUser(actUser.uid, { monthlyRate: p })) {
          await writeAudit("price_change", { uid: actUser.uid, email: actUser.email }, { from: actUser.monthlyRate, to: p });
          showToast(`$${p.toFixed(2)}/mo → ${actUser.email}`, T.pro);
        }
        break;
      }
      case "extendTrial": {
        const newStart = new Date().toISOString();
        if (await updateUser(actUser.uid, { trialStart: newStart, subscriptionStatus: "trial" })) {
          await writeAudit("trial_extended", { uid: actUser.uid, email: actUser.email }, { extraDays: 7 });
          showToast(`Trial extended for ${actUser.email}`, T.warn);
        }
        break;
      }
      case "comp": {
        if (await updateUser(actUser.uid, { subscriptionStatus: "active", monthlyRate: 0, subscribedAt: new Date().toISOString() })) {
          await writeAudit("comp_given", { uid: actUser.uid, email: actUser.email }, {});
          showToast(`Comp activated for ${actUser.email}`, T.success);
        }
        break;
      }
      case "cancel": {
        if (await updateUser(actUser.uid, { subscriptionStatus: "canceled", canceledAt: new Date().toISOString() })) {
          await writeAudit("subscription_canceled", { uid: actUser.uid, email: actUser.email }, {});
          showToast(`Canceled ${actUser.email}`, T.danger);
        }
        break;
      }
      case "setRole": {
        const newRole = formVal || null;
        if (await updateUser(actUser.uid, { role: newRole })) {
          await writeAudit("role_change", { uid: actUser.uid, email: actUser.email }, { from: actUser.role, to: newRole });
          showToast(`${actUser.email} → ${newRole || "regular user"}`, T.pro);
        }
        break;
      }
    }
    setModal(null);
  };

  // ── Invite team member ──
  const handleInvite = async () => {
    if (!invEmail.includes("@")) return;
    // For now, the person must sign up themselves first.
    // Then you find them in the user list and assign a role.
    // This creates a placeholder doc if they haven't signed up yet.
    showToast(`To add ${invEmail}: have them sign up first, then assign their role from the Users tab.`, T.accent);
    setModal(null);
    setInvEmail(""); setInvName("");
  };

  // ── Filtered users ──
  const regularUsers = users.filter(u => !u.role);
  const teamMembers = users.filter(u => u.role);
  const filteredUsers = (view === "team" ? teamMembers : regularUsers).filter(u => {
    if (view !== "team" && filter !== "all" && u.subscriptionStatus !== filter) return false;
    if (search && !u.email?.toLowerCase().includes(search.toLowerCase()) && !(u.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: regularUsers.length,
    active: regularUsers.filter(u => u.subscriptionStatus === "active").length,
    trial: regularUsers.filter(u => u.subscriptionStatus === "trial").length,
    churned: regularUsers.filter(u => u.subscriptionStatus === "expired" || u.subscriptionStatus === "canceled").length,
    mrr: regularUsers.filter(u => u.subscriptionStatus === "active").reduce((s, u) => s + (u.monthlyRate || 10), 0),
  };

  // ── Nav items (permission-gated) ──
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◈", perm: "view_stats" },
    { id: "users", label: "Users", icon: "◉", perm: "view_users" },
    { id: "analytics", label: "Analytics", icon: "▣", perm: "view_analytics" },
    { id: "team", label: "Team", icon: "◎", perm: "manage_team" },
    { id: "audit", label: "Activity Log", icon: "◌", perm: "view_audit_log" },
  ].filter(n => hasPermission(role, n.perm));

  if (loadingData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.accent, fontFamily: T.fontMono, fontSize: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid rgba(0,212,170,0.2)", borderTopColor: T.accent, borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 12px" }} />
          Loading admin data from Firestore...
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.fontBody, color: T.text }}>
      {/* ── SIDEBAR ── */}
      <div style={{ width: 220, minHeight: "100vh", background: T.surface, borderRight: `1px solid ${T.border}`, padding: "20px 0", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0 }}>
        <div style={{ padding: "0 20px", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #ef4444, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff", fontFamily: T.fontDisplay }}>⚙</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>Admin</div>
              <div style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono, letterSpacing: 1.5 }}>COVERED CALLS</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "0 10px" }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", marginBottom: 2, borderRadius: 8, border: "none", cursor: "pointer",
              background: view === item.id ? T.accentDim : "transparent", color: view === item.id ? T.accent : T.textDim,
              fontSize: 13, fontWeight: view === item.id ? 700 : 500, fontFamily: T.fontBody, textAlign: "left", transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 14, fontFamily: T.fontDisplay, width: 20, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div style={{ margin: "16px 4px", borderTop: `1px solid ${T.border}` }} />

          <Link to="/" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8,
            color: T.textDim, fontSize: 13, textDecoration: "none", transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 14 }}>←</span> Back to App
          </Link>
        </div>

        {/* Admin user */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: roleConfig.bg, color: roleConfig.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{roleConfig.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{adminName}</div>
              <Pill label={roleConfig.label.toUpperCase()} color={roleConfig.color} bg={roleConfig.bg} />
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, marginLeft: 220, padding: "28px 36px", maxWidth: 1100 }}>

        {/* ═══ DASHBOARD VIEW ═══ */}
        {view === "dashboard" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay, marginBottom: 4 }}>Dashboard</h2>
            <p style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>
              {users.length === 0
                ? "No users yet. Sign up a test account to see data here."
                : `${stats.total} users across your covered calls app`}
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <StatCard label="Users" value={stats.total} icon="👥" />
              <StatCard label="Active" value={stats.active} color={T.success} icon="✓" sub={`${stats.trial} in trial`} />
              <StatCard label="MRR" value={`$${stats.mrr.toFixed(0)}`} color={T.accent} icon="📈" />
              <StatCard label="Churned" value={stats.churned} color={T.danger} icon="↩" />
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {hasPermission(role, "change_pricing") && (
                <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 200, padding: 20, borderRadius: T.rL, background: "rgba(99,91,255,0.06)", border: "1px solid rgba(99,91,255,0.15)", textDecoration: "none" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>💳</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#635bff" }}>Stripe Dashboard</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>Payments & subscriptions</div>
                </a>
              )}
              <button onClick={() => setView("users")} style={{ flex: 1, minWidth: 200, padding: 20, borderRadius: T.rL, background: T.accentDim, border: "1px solid rgba(0,212,170,0.15)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>👥</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>Manage Users</div>
                <div style={{ fontSize: 11, color: T.textDim }}>View, edit, assign roles</div>
              </button>
            </div>

            {auditLog.length > 0 && hasPermission(role, "view_audit_log") && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: T.textDim, fontFamily: T.fontMono }}>RECENT ACTIVITY</span>
                  <button onClick={() => setView("audit")} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, cursor: "pointer", fontFamily: T.fontMono }}>View all →</button>
                </div>
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, overflow: "hidden" }}>
                  {auditLog.slice(0, 4).map((e, i) => (
                    <div key={e.id || i} style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 12, color: T.textDim }}>
                        <span style={{ color: T.text, fontWeight: 600 }}>{e.performedBy?.email?.split("@")[0]}</span>{" "}
                        {e.action?.replace(/_/g, " ")} → <span style={{ fontFamily: T.fontMono }}>{e.target?.email}</span>
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>{relTime(e.timestamp)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ USERS VIEW ═══ */}
        {view === "users" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay, marginBottom: 24 }}>Users</h2>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, overflow: "hidden" }}>
              {/* Toolbar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {["all", "active", "trial", "expired", "canceled"].map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      padding: "5px 11px", borderRadius: 6, background: filter === f ? T.accentDim : "transparent", border: "none", color: filter === f ? T.accent : T.textDim,
                      fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.fontMono, textTransform: "uppercase",
                    }}>{f}</button>
                  ))}
                </div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ padding: "6px 12px", borderRadius: 6, width: 180, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.fontBody, outline: "none" }} />
              </div>

              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.7fr 0.7fr 0.6fr 0.5fr 36px", padding: "8px 16px", background: "rgba(255,255,255,0.01)", borderBottom: `1px solid ${T.border}`, alignItems: "center", gap: 8 }}>
                {["User", "Status", "Role", "Rate", "Active", ""].map(h => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.textMuted, fontFamily: T.fontMono }}>{h}</div>
                ))}
              </div>

              {filteredUsers.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: T.textDim }}>
                  {users.length === 0
                    ? "No users yet. Create test accounts by signing up at the login page."
                    : "No users match this filter."}
                </div>
              )}

              {filteredUsers.map(u => {
                const sc = STATUS_STYLES[u.subscriptionStatus] || { label: "?", color: T.textDim, bg: "rgba(255,255,255,0.03)" };
                const dl = u.subscriptionStatus === "trial" ? trialLeft(u.trialStart) : null;
                const isExp = expanded === u.uid;
                const canEdit = hasPermission(role, "edit_users");
                const canPrice = hasPermission(role, "change_pricing");
                const canTeam = hasPermission(role, "manage_team");
                const uRole = u.role ? ROLES[u.role] : null;

                return (
                  <div key={u.uid} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "1.8fr 0.7fr 0.7fr 0.6fr 0.5fr 36px",
                      padding: "11px 16px", alignItems: "center", gap: 8, cursor: "pointer",
                      background: isExp ? "rgba(255,255,255,0.015)" : "transparent",
                    }} onClick={() => setExpanded(isExp ? null : u.uid)}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{u.name || u.email?.split("@")[0] || "—"}</div>
                        <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>{u.email}</div>
                      </div>
                      <div>
                        <Pill label={sc.label} color={sc.color} bg={sc.bg} />
                        {dl !== null && <div style={{ fontSize: 9, color: dl <= 2 ? T.warn : T.textDim, marginTop: 2 }}>{dl}d left</div>}
                      </div>
                      <div>
                        {uRole
                          ? <Pill label={uRole.label.toUpperCase()} color={uRole.color} bg={uRole.bg} />
                          : <span style={{ fontSize: 10, color: T.textMuted }}>user</span>}
                      </div>
                      <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text }}>
                        ${(u.monthlyRate || 10).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim }}>{relTime(u.lastActive)}</div>
                      <div style={{ fontSize: 10, color: T.textDim, transform: isExp ? "rotate(180deg)" : "", transition: "transform 0.15s" }}>▼</div>
                    </div>

                    {isExp && (
                      <div style={{ padding: "0 16px 14px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {canPrice && <SmallBtn label="✏ Price" color={T.pro} onClick={() => doAction("changePrice", u)} />}
                        {canEdit && u.subscriptionStatus === "trial" && <SmallBtn label="⏰ Extend Trial" color={T.warn} onClick={() => doAction("extendTrial", u)} />}
                        {canEdit && u.subscriptionStatus !== "active" && <SmallBtn label="🎫 Comp" color={T.success} onClick={() => doAction("comp", u)} />}
                        {canEdit && (u.subscriptionStatus === "active" || u.subscriptionStatus === "trial") && <SmallBtn label="✕ Cancel" color={T.danger} onClick={() => doAction("cancel", u)} />}
                        {canTeam && (
                          <SmallBtn label={u.role ? `🛡 Role: ${u.role}` : "🛡 Assign Role"} color={T.pro} onClick={() => { setFormVal(u.role || ""); doAction("setRole", u); }} />
                        )}
                        <div style={{ fontSize: 10, color: T.textMuted, padding: "4px 8px", fontFamily: T.fontMono }}>
                          UID: {u.uid.slice(0, 12)}...
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ TEAM VIEW ═══ */}
        {view === "team" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay, marginBottom: 4 }}>Team</h2>
                <p style={{ fontSize: 13, color: T.textDim }}>{teamMembers.length} team member{teamMembers.length !== 1 ? "s" : ""}</p>
              </div>
              <Btn onClick={() => setModal("invite")}>+ Invite Member</Btn>
            </div>

            {/* Role legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 24, padding: "16px 20px", background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL }}>
              {Object.entries(ROLES).map(([key, r]) => (
                <div key={key} style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span>{r.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
                    {key === "owner" && "Full access: billing, pricing, team."}
                    {key === "admin" && "Users, outreach, Slack. No billing."}
                    {key === "moderator" && "Read-only stats. Slack moderation."}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, overflow: "hidden" }}>
              {teamMembers.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: T.textDim }}>
                  No team members yet. Your account is the only admin. Use "Invite Member" or assign roles from the Users tab.
                </div>
              )}
              {teamMembers.map(m => {
                const rc = ROLES[m.role];
                return (
                  <div key={m.uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: rc?.bg, color: rc?.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{rc?.icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{m.name || m.email?.split("@")[0]}</div>
                        <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{m.email}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Pill label={rc?.label.toUpperCase()} color={rc?.color} bg={rc?.bg} />
                      {m.role !== "owner" && hasPermission(role, "manage_team") && (
                        <SmallBtn label="Change Role" color={T.pro} onClick={() => { setFormVal(m.role); doAction("setRole", m); }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ AUDIT LOG VIEW ═══ */}
        {view === "audit" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay, marginBottom: 4 }}>Activity Log</h2>
            <p style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>All admin actions recorded in Firestore</p>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL, overflow: "hidden" }}>
              {auditLog.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: T.textDim }}>No activity yet. Actions you take will appear here.</div>
              )}
              {auditLog.map((e, i) => (
                <div key={e.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 20px", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>
                      {e.action?.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: 11, color: T.textDim }}>
                      by {e.performedBy?.email} → {e.target?.email}
                      {e.details && Object.keys(e.details).length > 0 && (
                        <span style={{ color: T.textMuted }}> · {JSON.stringify(e.details)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: T.textMuted, whiteSpace: "nowrap", fontFamily: T.fontMono }}>{relTime(e.timestamp)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ANALYTICS VIEW ═══ */}
        {view === "analytics" && <AdminAnalytics />}
      </div>

      {/* ── MODALS ── */}
      <Modal open={modal === "changePrice"} onClose={() => setModal(null)} title={`Change Price — ${actUser?.email}`}>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>Current: <strong style={{ color: T.text }}>${(actUser?.monthlyRate || 10).toFixed(2)}/mo</strong></div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6 }}>NEW PRICE ($)</label>
          <input type="number" value={formVal} onChange={e => setFormVal(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, color: T.accent, fontSize: 16, fontFamily: T.fontMono, outline: "none" }} />
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>Set 0 for complimentary access.</div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="pro" onClick={confirm}>Update Price</Btn>
        </div>
      </Modal>

      <Modal open={modal === "extendTrial"} onClose={() => setModal(null)} title={`Extend Trial — ${actUser?.email}`}>
        <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20, lineHeight: 1.6 }}>Resets their trial to start today — fresh 7 days of access.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="warn" onClick={confirm}>Extend 7 Days</Btn>
        </div>
      </Modal>

      <Modal open={modal === "comp"} onClose={() => setModal(null)} title={`Comp — ${actUser?.email}`}>
        <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20, lineHeight: 1.6 }}>Free active membership at $0/mo.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn onClick={confirm}>Activate Free</Btn>
        </div>
      </Modal>

      <Modal open={modal === "cancel"} onClose={() => setModal(null)} title={`Cancel — ${actUser?.email}`}>
        <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20, lineHeight: 1.6 }}>Immediately cancels access for <strong style={{ color: T.danger }}>{actUser?.email}</strong>.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Keep Active</Btn>
          <Btn variant="danger" onClick={confirm}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={modal === "setRole"} onClose={() => setModal(null)} title={`Set Role — ${actUser?.email}`}>
        <p style={{ fontSize: 13, color: T.textDim, marginBottom: 16 }}>Current: <strong style={{ color: T.text }}>{actUser?.role || "regular user"}</strong></p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[{ value: "", label: "Regular User", desc: "No admin access" }, ...Object.entries(ROLES).filter(([k]) => k !== "owner").map(([k, v]) => ({ value: k, label: v.label, desc: k === "admin" ? "Manage users & outreach" : "Read-only + Slack" }))].map(opt => (
            <button key={opt.value} onClick={() => setFormVal(opt.value)} style={{
              flex: 1, minWidth: 120, padding: "12px 14px", borderRadius: T.r, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
              background: formVal === opt.value ? (ROLES[opt.value]?.bg || T.accentDim) : "rgba(255,255,255,0.02)",
              border: `1px solid ${formVal === opt.value ? (ROLES[opt.value]?.color || T.accent) + "44" : T.border}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: formVal === opt.value ? (ROLES[opt.value]?.color || T.accent) : T.textDim }}>{opt.label}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="pro" onClick={confirm}>Set Role</Btn>
        </div>
      </Modal>

      <Modal open={modal === "invite"} onClose={() => setModal(null)} title="Invite Team Member">
        <p style={{ fontSize: 13, color: T.textDim, marginBottom: 16, lineHeight: 1.6 }}>
          The person needs to <strong style={{ color: T.text }}>sign up first</strong> through the normal auth screen. Once they have an account, find them in the Users tab and click "Assign Role" to grant admin access.
        </p>
        <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>
          Their login is the same URL — they'll automatically see the Admin Panel link once a role is assigned.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Got It</Btn>
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          padding: "12px 20px", borderRadius: T.r,
          background: T.card, border: `1px solid ${toast.color}44`,
          color: toast.color, fontSize: 13, fontWeight: 600,
          fontFamily: T.fontBody, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "fadeUp .25s ease",
        }}>{toast.msg}
          <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
      )}
    </div>
  );
}
