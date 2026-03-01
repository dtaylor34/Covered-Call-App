// ─── src/contexts/AnalyticsProvider.jsx ──────────────────────────────────────
// Wraps the app to provide automatic analytics tracking.
//
// Responsibilities:
//   - Initialize analytics with current user on auth state change
//   - Auto-track page views on every route change
//   - Destroy analytics session on logout
//   - Provides analytics instance to children via context (optional)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { analytics } from "../services/analytics";

export default function AnalyticsProvider({ children }) {
  const { user, uid, email } = useAuth();
  const location = useLocation();
  const prevPath = useRef(null);

  // ── Init/destroy on auth state change ──
  useEffect(() => {
    if (uid && email) {
      analytics.init(uid, email);
    } else {
      analytics.destroy();
    }

    return () => analytics.destroy();
  }, [uid, email]);

  // ── Auto-track page views on route change ──
  useEffect(() => {
    const path = location.pathname;
    if (path !== prevPath.current && uid) {
      analytics.pageView(path, {
        search: location.search || null,
      });
      prevPath.current = path;
    }
  }, [location.pathname, location.search, uid]);

  // ── Global error handlers ──
  useEffect(() => {
    const handleWindowError = (event) => {
      analytics.error(event.error || new Error(event.message), {
        context: "window_error",
        severity: "critical",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const handleUnhandledRejection = (event) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
      analytics.error(error, {
        context: "unhandled_promise_rejection",
        severity: "critical",
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return children;
}
