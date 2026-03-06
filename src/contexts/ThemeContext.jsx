// ─── src/contexts/ThemeContext.jsx ────────────────────────────────────────────
// Canonical theme provider. All functional components use useTheme() to get T.
//
// Three palettes: dark (default), light, highContrast
// Persists to localStorage (instant) and Firestore (cross-device via AuthContext).
// Live switching — no page reload needed.
//
// Usage:
//   const { T, themeName, setTheme, isMobile, isTablet, isDesktop } = useTheme();
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const ThemeContext = createContext(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}

// ── Palettes ──
const PALETTES = {
  dark: {
    bg: "#0a0e17",
    surface: "#0e1420",
    card: "#111827",
    cardHover: "#1a2332",
    border: "#1f2937",
    borderActive: "#374151",
    text: "#e5e7eb",
    textDim: "#6b7280",
    textMuted: "#4b5563",
    accent: "#00d4aa",
    accentDim: "rgba(0,212,170,0.2)",
    accentGlow: "rgba(0,212,170,0.3)",
    accentBright: "#00ffcc",
    gradientB: "#0891b2",
    pro: "#818cf8",
    proDim: "rgba(129,140,248,0.12)",
    warn: "#f59e0b",
    warnDim: "rgba(245,158,11,0.12)",
    danger: "#ef4444",
    dangerDim: "rgba(239,68,68,0.2)",
    success: "#10b981",
    successDim: "rgba(16,185,129,0.2)",
    slack: "#4A154B",
    slackDim: "rgba(74,21,75,0.15)",
    owner: "#f59e0b",
    inputBg: "#0d1117",
    overlay: "rgba(10,14,23,0.85)",
  },
  light: {
    bg: "#f5f7fa",
    surface: "#ffffff",
    card: "#ffffff",
    cardHover: "#f0f2f5",
    border: "#e5e7eb",
    borderActive: "#d1d5db",
    text: "#111827",
    textDim: "#4b5563",
    textMuted: "#9ca3af",
    accent: "#0891b2",
    accentDim: "rgba(8,145,178,0.13)",
    accentGlow: "rgba(8,145,178,0.2)",
    accentBright: "#0e7490",
    gradientB: "#0d9488",
    pro: "#6366f1",
    proDim: "rgba(99,102,241,0.1)",
    warn: "#d97706",
    warnDim: "rgba(217,119,6,0.08)",
    danger: "#dc2626",
    dangerDim: "rgba(220,38,38,0.13)",
    success: "#059669",
    successDim: "rgba(5,150,105,0.13)",
    slack: "#4A154B",
    slackDim: "rgba(74,21,75,0.1)",
    owner: "#d97706",
    inputBg: "#f9fafb",
    overlay: "rgba(245,247,250,0.9)",
  },
  highContrast: {
    bg: "#000000",
    surface: "#0a0a0a",
    card: "#111111",
    cardHover: "#1a1a1a",
    border: "rgba(255,255,255,0.2)",
    borderActive: "rgba(255,255,255,0.4)",
    text: "#ffffff",
    textDim: "#a0a0a0",
    textMuted: "#666666",
    accent: "#00ff99",
    accentDim: "rgba(0,255,153,0.15)",
    accentGlow: "rgba(0,255,153,0.4)",
    accentBright: "#66ffcc",
    gradientB: "#0ea5e9",
    pro: "#a5b4fc",
    proDim: "rgba(165,180,252,0.15)",
    warn: "#fbbf24",
    warnDim: "rgba(251,191,36,0.15)",
    danger: "#f87171",
    dangerDim: "rgba(248,113,113,0.15)",
    success: "#4ade80",
    successDim: "rgba(74,222,128,0.15)",
    slack: "#7c3aed",
    slackDim: "rgba(124,58,237,0.15)",
    owner: "#fbbf24",
    inputBg: "rgba(255,255,255,0.08)",
    overlay: "rgba(0,0,0,0.9)",
  },
};

// ── Shared typography & radius ──
const TYPOGRAPHY = {
  fontDisplay: "'Space Mono', 'JetBrains Mono', monospace",
  fontBody: "'IBM Plex Sans', -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  r: 10,
  rL: 16,
};

// ── Breakpoints ──
const BREAKPOINTS = { mobile: 640, tablet: 1024 };

export const THEME_OPTIONS = [
  { id: "dark", label: "Dark", icon: "🌙", preview: "#0a0e17" },
  { id: "light", label: "Light", icon: "☀️", preview: "#f5f7fa" },
  { id: "highContrast", label: "High Contrast", icon: "◐", preview: "#000000" },
];

// ── Export palettes for external use (e.g. STATUS_STYLES in theme.js) ──
export { PALETTES };

export function ThemeProvider({ children }) {
  // Restore from localStorage for instant paint
  const [themeName, setThemeNameRaw] = useState(() => {
    try {
      const stored = localStorage.getItem("cc:theme");
      if (stored && PALETTES[stored]) return stored;
    } catch {}
    return "dark";
  });

  // Responsive state
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const setTheme = useCallback((name) => {
    if (!PALETTES[name]) return;
    setThemeNameRaw(name);
    try {
      localStorage.setItem("cc:theme", name);
    } catch {}
  }, []);

  // -- Sync theme to DOM: CSS variables (so index.html body uses them), body inline fallback, meta theme-color --
  useEffect(() => {
    const palette = PALETTES[themeName] || PALETTES.dark;
    const root = document.documentElement;
    root.style.setProperty("--theme-bg", palette.bg);
    root.style.setProperty("--theme-text", palette.text);
    document.body.style.backgroundColor = palette.bg;
    document.body.style.color = palette.text;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", palette.bg);
  }, [themeName]);

  const isMobile = windowWidth < BREAKPOINTS.mobile;
  const isTablet = windowWidth >= BREAKPOINTS.mobile && windowWidth < BREAKPOINTS.tablet;
  const isDesktop = windowWidth >= BREAKPOINTS.tablet;

  // Build T = palette colors + typography (memoized to avoid re-renders)
  const T = useMemo(() => ({
    ...(PALETTES[themeName] || PALETTES.dark),
    ...TYPOGRAPHY,
  }), [themeName]);

  const value = useMemo(() => ({
    themeName,
    setTheme,
    T,
    isMobile,
    isTablet,
    isDesktop,
    windowWidth,
  }), [themeName, setTheme, T, isMobile, isTablet, isDesktop, windowWidth]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
