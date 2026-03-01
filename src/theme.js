// ─── src/theme.js ───────────────────────────────────────────────────────────
// Shared design tokens. Import this in any component for consistent styling.

export const T = {
  bg: "#05070b",
  surface: "#0a0e16",
  card: "#0e1320",
  cardHover: "#121828",
  border: "rgba(255,255,255,0.05)",
  borderActive: "rgba(255,255,255,0.12)",
  text: "#e2e8f0",
  textDim: "#64748b",
  textMuted: "#334155",
  accent: "#00d4aa",
  accentDim: "rgba(0,212,170,0.12)",
  accentGlow: "rgba(0,212,170,0.3)",
  pro: "#818cf8",
  proDim: "rgba(129,140,248,0.12)",
  warn: "#f59e0b",
  warnDim: "rgba(245,158,11,0.1)",
  danger: "#ef4444",
  dangerDim: "rgba(239,68,68,0.1)",
  success: "#22c55e",
  successDim: "rgba(34,197,94,0.1)",
  slack: "#4A154B",
  slackDim: "rgba(74,21,75,0.15)",
  owner: "#f59e0b",
  // Fonts
  fontDisplay: "'Space Mono', 'JetBrains Mono', monospace",
  fontBody: "'IBM Plex Sans', -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  // Radius
  r: 10,
  rL: 16,
};

// ── Role definitions ──
export const ROLES = {
  owner: {
    label: "Owner", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", icon: "👑",
    permissions: [
      "view_stats", "view_users", "edit_users", "change_pricing",
      "create_promos", "manage_promos", "send_outreach", "manage_slack",
      "manage_team", "view_audit_log", "view_analytics", "export_data", "settings",
    ],
  },
  admin: {
    label: "Admin", color: "#818cf8", bg: "rgba(129,140,248,0.12)", icon: "🛡",
    permissions: [
      "view_stats", "view_users", "edit_users",
      "send_outreach", "manage_slack", "view_audit_log", "view_analytics",
    ],
  },
  moderator: {
    label: "Moderator", color: "#22c55e", bg: "rgba(34,197,94,0.12)", icon: "👁",
    permissions: [
      "view_stats", "view_users", "manage_slack",
    ],
  },
};

export function hasPermission(role, permission) {
  if (!role || !ROLES[role]) return false;
  return ROLES[role].permissions.includes(permission);
}

// ── Status badge styles ──
export const STATUS_STYLES = {
  active:   { label: "ACTIVE",   color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  trial:    { label: "TRIAL",    color: "#00d4aa", bg: "rgba(0,212,170,0.1)" },
  expired:  { label: "EXPIRED",  color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  canceled: { label: "CANCELED", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
};
