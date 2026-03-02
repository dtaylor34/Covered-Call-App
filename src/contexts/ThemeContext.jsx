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
    inputBg: "rgba(255,255,255,0.03)",
    overlay: "rgba(5,7,11,0.85)",
  },
  light: {
    bg: "#f8fafc",
    surface: "#ffffff",
    card: "#f1f5f9",
    cardHover: "#e2e8f0",
    border: "rgba(0,0,0,0.08)",
    borderActive: "rgba(0,0,0,0.15)",
    text: "#0f172a",
    textDim: "#64748b",
    textMuted: "#94a3b8",
    accent: "#059669",
    accentDim: "rgba(5,150,105,0.1)",
    accentGlow: "rgba(5,150,105,0.2)",
    pro: "#6366f1",
    proDim: "rgba(99,102,241,0.1)",
    warn: "#d97706",
    warnDim: "rgba(217,119,6,0.08)",
    danger: "#dc2626",
    dangerDim: "rgba(220,38,38,0.08)",
    success: "#16a34a",
    successDim: "rgba(22,163,74,0.08)",
    slack: "#4A154B",
    slackDim: "rgba(74,21,75,0.1)",
    owner: "#d97706",
    inputBg: "rgba(0,0,0,0.03)",
    overlay: "rgba(248,250,252,0.9)",
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
  { id: "dark", label: "Dark", icon: "🌙", preview: "#05070b" },
  { id: "light", label: "Light", icon: "☀️", preview: "#f8fafc" },
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

  // -- Sync document.body + meta theme-color to current palette --
  useEffect(() => {
    const palette = PALETTES[themeName] || PALETTES.dark;
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
