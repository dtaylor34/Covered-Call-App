// ─── src/services/analytics.js ───────────────────────────────────────────────
// Lightweight analytics service that writes events to Firestore.
//
// Tracks three event types:
//   1. page_view   — route changes, time on page
//   2. event       — user interactions (search, select contract, expand row, etc.)
//   3. error       — caught errors, API failures, React boundary crashes
//
// Events are batched in memory and flushed every 5 seconds or when the
// batch reaches 20 events, whichever comes first. This keeps Firestore
// writes low while still capturing granular data.
//
// Usage:
//   import { analytics } from '../services/analytics';
//   analytics.init(uid, email);
//   analytics.pageView('/dashboard');
//   analytics.event('search', 'symbol_searched', { symbol: 'AAPL' });
//   analytics.error(err, { context: 'options_chain_fetch' });
// ─────────────────────────────────────────────────────────────────────────────

import { collection, addDoc, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const BATCH_SIZE = 20;
const FLUSH_INTERVAL = 5000; // 5 seconds
const COLLECTION = "analyticsEvents";

class AnalyticsService {
  constructor() {
    this._queue = [];
    this._flushTimer = null;
    this._uid = null;
    this._email = null;
    this._sessionId = this._generateSessionId();
    this._sessionStart = new Date().toISOString();
    this._currentPage = null;
    this._pageEnterTime = null;
    this._enabled = true;
  }

  // ── Initialize with current user ──
  init(uid, email) {
    this._uid = uid;
    this._email = email;

    // Start periodic flushing
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL);

    // Flush on page unload
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this._flush());
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this._flush();
      });
    }
  }

  // ── Disable (for admin impersonation, testing, etc.) ──
  disable() { this._enabled = false; }
  enable() { this._enabled = true; }

  // ── Destroy (on logout) ──
  destroy() {
    this._flush();
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._uid = null;
    this._email = null;
    this._queue = [];
  }

  // ── Track page view ──
  pageView(path, metadata = {}) {
    // Record time on previous page
    if (this._currentPage && this._pageEnterTime) {
      const timeOnPage = Math.round((Date.now() - this._pageEnterTime) / 1000);
      this._enqueue({
        type: "page_exit",
        page: this._currentPage,
        timeOnPageSeconds: timeOnPage,
      });
    }

    this._currentPage = path;
    this._pageEnterTime = Date.now();

    this._enqueue({
      type: "page_view",
      page: path,
      referrer: metadata.referrer || null,
      ...metadata,
    });
  }

  // ── Track user interaction event ──
  event(category, action, metadata = {}) {
    this._enqueue({
      type: "event",
      category,
      action,
      page: this._currentPage,
      ...metadata,
    });
  }

  // ── Track error ──
  error(error, context = {}) {
    const errorData = {
      type: "error",
      page: this._currentPage,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack?.slice(0, 500) || null,
      errorName: error?.name || "UnknownError",
      severity: context.severity || "error",
      ...context,
    };

    // Errors bypass batching — write immediately
    this._enqueue(errorData);
    this._flush();
  }

  // ── Internal: add event to queue ──
  _enqueue(event) {
    if (!this._enabled || !this._uid) return;

    this._queue.push({
      ...event,
      uid: this._uid,
      email: this._email,
      sessionId: this._sessionId,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      screenWidth: typeof window !== "undefined" ? window.innerWidth : null,
    });

    if (this._queue.length >= BATCH_SIZE) {
      this._flush();
    }
  }

  // ── Internal: write queued events to Firestore ──
  async _flush() {
    if (this._queue.length === 0) return;

    const events = [...this._queue];
    this._queue = [];

    try {
      if (events.length === 1) {
        // Single write
        await addDoc(collection(db, COLLECTION), events[0]);
      } else {
        // Batch write (max 500 per Firestore batch, we never exceed BATCH_SIZE)
        const batch = writeBatch(db);
        events.forEach((evt) => {
          const ref = doc(collection(db, COLLECTION));
          batch.set(ref, evt);
        });
        await batch.commit();
      }
    } catch (err) {
      // Don't re-enqueue to avoid infinite loops — just log
      console.warn("Analytics flush failed:", err.message);
      // Put events back if it's a transient failure (but cap at 100)
      if (this._queue.length + events.length < 100) {
        this._queue.unshift(...events);
      }
    }
  }

  // ── Internal: generate session ID ──
  _generateSessionId() {
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
}

// Singleton
export const analytics = new AnalyticsService();

// ── Pre-defined event helpers for common interactions ──
export const AnalyticsEvents = {
  // Search & research
  symbolSearched: (symbol) =>
    analytics.event("search", "symbol_searched", { symbol }),
  contractSelected: (symbol, strike, expiration, score) =>
    analytics.event("research", "contract_selected", { symbol, strike, expiration, score }),
  contractChanged: (symbol, fromStrike, toStrike) =>
    analytics.event("research", "contract_changed", { symbol, fromStrike, toStrike }),
  recommendationExpanded: (symbol, strike) =>
    analytics.event("research", "recommendation_expanded", { symbol, strike }),
  scoresRefreshed: (symbol) =>
    analytics.event("research", "scores_refreshed", { symbol }),

  // History
  historyOpened: () =>
    analytics.event("navigation", "history_opened"),
  historyEntryClicked: (symbol, hasContract) =>
    analytics.event("history", "entry_clicked", { symbol, hasContract }),
  historyItemDeleted: (symbol) =>
    analytics.event("history", "item_deleted", { symbol }),
  historyBatchDeleted: (count) =>
    analytics.event("history", "batch_deleted", { count }),
  historyCleared: (count) =>
    analytics.event("history", "cleared", { count }),

  // Onboarding
  onboardingStarted: () =>
    analytics.event("onboarding", "started"),
  onboardingStepCompleted: (step) =>
    analytics.event("onboarding", "step_completed", { step }),
  onboardingCompleted: (promoUsed) =>
    analytics.event("onboarding", "completed", { promoUsed }),
  onboardingSkipped: (atStep) =>
    analytics.event("onboarding", "skipped", { atStep }),

  // Auth
  signupCompleted: () =>
    analytics.event("auth", "signup_completed"),
  loginCompleted: () =>
    analytics.event("auth", "login_completed"),
  logoutClicked: () =>
    analytics.event("auth", "logout"),

  // Errors
  apiError: (endpoint, statusCode, message) =>
    analytics.error(new Error(message), { context: "api_call", endpoint, statusCode, severity: "warning" }),
  renderError: (componentName, error) =>
    analytics.error(error, { context: "react_render", component: componentName, severity: "critical" }),
};
