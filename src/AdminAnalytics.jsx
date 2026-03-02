// ─── src/components/AdminAnalytics.jsx ───────────────────────────────────────
// Analytics dashboard for the admin panel.
//
// Queries analyticsEvents from Firestore and aggregates:
//   - Page views by route (total + trend)
//   - Error log with severity, stack traces, frequency
//   - User activity (top searchers, most researched symbols)
//   - Session metrics (avg time on page, bounce rate)
//   - Real-time event stream (last 50 events)
//
// Designed to be rendered as a tab inside AdminPanel.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, query, orderBy, limit, getDocs, where, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useTheme } from "../contexts/ThemeContext";

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "All", hours: null },
];

export default function AdminAnalytics() {
  const { T } = useTheme();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(TIME_RANGES[1]); // Default 7d
  const [activeTab, setActiveTab] = useState("overview");

  // ── Fetch events from Firestore ──
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const ref = collection(db, "analyticsEvents");
      let q;

      if (timeRange.hours) {
        const cutoff = new Date(Date.now() - timeRange.hours * 3600000);
        q = query(ref, where("timestamp", ">=", cutoff.toISOString()), orderBy("timestamp", "desc"), limit(2000));
      } else {
        q = query(ref, orderBy("timestamp", "desc"), limit(2000));
      }

      const snap = await getDocs(q);
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── Aggregations ──
  const stats = useMemo(() => {
    const pageViews = events.filter((e) => e.type === "page_view");
    const userEvents = events.filter((e) => e.type === "event");
    const errors = events.filter((e) => e.type === "error");
    const pageExits = events.filter((e) => e.type === "page_exit");

    // Unique users
    const uniqueUsers = new Set(events.map((e) => e.uid)).size;

    // Unique sessions
    const uniqueSessions = new Set(events.map((e) => e.sessionId)).size;

    // Page view counts by route
    const pageViewCounts = {};
    pageViews.forEach((e) => {
      const p = e.page || "unknown";
      pageViewCounts[p] = (pageViewCounts[p] || 0) + 1;
    });

    // Avg time on page from page_exit events
    const pageTimes = {};
    const pageTimeCounts = {};
    pageExits.forEach((e) => {
      const p = e.page || "unknown";
      const t = e.timeOnPageSeconds || 0;
      pageTimes[p] = (pageTimes[p] || 0) + t;
      pageTimeCounts[p] = (pageTimeCounts[p] || 0) + 1;
    });
    const avgPageTimes = {};
    Object.keys(pageTimes).forEach((p) => {
      avgPageTimes[p] = Math.round(pageTimes[p] / pageTimeCounts[p]);
    });

    // Top searched symbols
    const symbolCounts = {};
    userEvents.filter((e) => e.action === "symbol_searched").forEach((e) => {
      const s = e.symbol || "?";
      symbolCounts[s] = (symbolCounts[s] || 0) + 1;
    });

    // Most active users
    const userActivity = {};
    events.forEach((e) => {
      if (!e.email) return;
      if (!userActivity[e.email]) userActivity[e.email] = { events: 0, errors: 0, searches: 0 };
      userActivity[e.email].events++;
      if (e.type === "error") userActivity[e.email].errors++;
      if (e.action === "symbol_searched") userActivity[e.email].searches++;
    });

    // Error frequency by message
    const errorGroups = {};
    errors.forEach((e) => {
      const key = e.errorMessage || "Unknown error";
      if (!errorGroups[key]) errorGroups[key] = { count: 0, severity: e.severity || "error", lastSeen: e.timestamp, context: e.context, page: e.page };
      errorGroups[key].count++;
      if (e.timestamp > errorGroups[key].lastSeen) errorGroups[key].lastSeen = e.timestamp;
    });

    // Event category breakdown
    const categoryCounts = {};
    userEvents.forEach((e) => {
      const c = e.category || "other";
      categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    });

    // Daily trend (page views per day)
    const dailyViews = {};
    pageViews.forEach((e) => {
      const day = e.timestamp?.slice(0, 10);
      if (day) dailyViews[day] = (dailyViews[day] || 0) + 1;
    });

    // Daily errors
    const dailyErrors = {};
    errors.forEach((e) => {
      const day = e.timestamp?.slice(0, 10);
      if (day) dailyErrors[day] = (dailyErrors[day] || 0) + 1;
    });

    return {
      totalEvents: events.length,
      pageViews: pageViews.length,
      userEvents: userEvents.length,
      errors: errors.length,
      uniqueUsers,
      uniqueSessions,
      pageViewCounts,
      avgPageTimes,
      symbolCounts,
      userActivity,
      errorGroups,
      categoryCounts,
      dailyViews,
      dailyErrors,
      allErrors: errors,
    };
  }, [events]);

  const tabs = [
    { id: "overview", label: "Overview", icon: "◈" },
    { id: "pages", label: "Pages", icon: "◉" },
    { id: "errors", label: "Errors", icon: "⚠" },
    { id: "users", label: "User Activity", icon: "◎" },
    { id: "stream", label: "Live Stream", icon: "◌" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay, marginBottom: 4 }}>
            Analytics
          </h2>
          <p style={{ fontSize: 13, color: T.textDim }}>
            Page metrics, error tracking, and user behavior
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Time range selector */}
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.label}
              onClick={() => setTimeRange(tr)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                fontFamily: T.fontMono,
                background: timeRange.label === tr.label ? T.accentDim : "transparent",
                border: `1px solid ${timeRange.label === tr.label ? "rgba(0,212,170,0.3)" : T.border}`,
                color: timeRange.label === tr.label ? T.accent : T.textDim,
                cursor: "pointer",
              }}
            >
              {tr.label}
            </button>
          ))}
          <button
            onClick={fetchEvents}
            disabled={loading}
            style={{
              padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
              background: "transparent", color: T.textDim, fontSize: 11, cursor: "pointer",
              fontFamily: T.fontMono, marginLeft: 8,
            }}
          >
            {loading ? "..." : "↻"}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: activeTab === tab.id ? T.surface : "transparent",
              border: `1px solid ${activeTab === tab.id ? T.borderActive : "transparent"}`,
              color: activeTab === tab.id ? T.text : T.textDim,
              cursor: "pointer", fontFamily: T.fontBody,
            }}
          >
            {tab.icon} {tab.label}
            {tab.id === "errors" && stats.errors > 0 && (
              <span style={{
                marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                background: T.dangerDim, color: T.danger, fontSize: 10, fontWeight: 800,
              }}>
                {stats.errors}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontSize: 14 }}>
          Loading analytics data...
        </div>
      ) : (
        <>
          {activeTab === "overview" && <OverviewTab stats={stats} />}
          {activeTab === "pages" && <PagesTab stats={stats} />}
          {activeTab === "errors" && <ErrorsTab stats={stats} />}
          {activeTab === "users" && <UsersTab stats={stats} />}
          {activeTab === "stream" && <StreamTab events={events} />}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ stats }) {
  const { T } = useTheme();
  const sortedDays = Object.keys(stats.dailyViews).sort();

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MiniStat label="Page Views" value={stats.pageViews} icon="👁" color={T.accent} />
        <MiniStat label="User Events" value={stats.userEvents} icon="🎯" color={T.pro} />
        <MiniStat label="Errors" value={stats.errors} icon="⚠" color={stats.errors > 0 ? T.danger : T.textMuted} />
        <MiniStat label="Unique Users" value={stats.uniqueUsers} icon="👤" color={T.text} />
        <MiniStat label="Sessions" value={stats.uniqueSessions} icon="📍" color={T.warn} />
        <MiniStat label="Total Events" value={stats.totalEvents} icon="📊" color={T.textDim} />
      </div>

      {/* Daily trend */}
      {sortedDays.length > 1 && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
          padding: "20px 24px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay, marginBottom: 14 }}>
            DAILY PAGE VIEWS
          </div>
          <BarChart
            data={sortedDays.map((day) => ({
              label: day.slice(5), // MM-DD
              value: stats.dailyViews[day] || 0,
              errorValue: stats.dailyErrors[day] || 0,
            }))}
          />
        </div>
      )}

      {/* Top categories */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
          padding: "16px 20px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay, marginBottom: 12 }}>
            TOP SEARCHED SYMBOLS
          </div>
          <RankedList
            items={Object.entries(stats.symbolCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([symbol, count]) => ({ label: symbol, value: count }))}
            emptyMessage="No searches recorded yet"
          />
        </div>

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
          padding: "16px 20px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.pro, fontFamily: T.fontDisplay, marginBottom: 12 }}>
            EVENT CATEGORIES
          </div>
          <RankedList
            items={Object.entries(stats.categoryCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => ({ label: cat, value: count }))}
            emptyMessage="No events recorded yet"
            color={T.pro}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function PagesTab({ stats }) {
  const { T } = useTheme();
  const pages = Object.entries(stats.pageViewCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([page, views]) => ({
      page,
      views,
      avgTime: stats.avgPageTimes[page] || null,
    }));

  const maxViews = pages.length > 0 ? pages[0].views : 1;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
      overflow: "hidden",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay, padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
        PAGE PERFORMANCE
      </div>

      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 100px 100px 1fr",
        padding: "10px 20px", borderBottom: `1px solid ${T.border}`,
        background: T.surface,
      }}>
        <HeaderCell>Route</HeaderCell>
        <HeaderCell align="right">Views</HeaderCell>
        <HeaderCell align="right">Avg Time</HeaderCell>
        <HeaderCell />
      </div>

      {pages.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: T.textDim, fontSize: 13 }}>
          No page view data yet. Views will appear here as users navigate the app.
        </div>
      ) : pages.map((p, i) => (
        <div key={p.page} style={{
          display: "grid", gridTemplateColumns: "1fr 100px 100px 1fr",
          padding: "12px 20px", borderBottom: i < pages.length - 1 ? `1px solid ${T.border}` : "none",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.fontMono }}>
            {p.page}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, textAlign: "right" }}>
            {p.views}
          </span>
          <span style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono, textAlign: "right" }}>
            {p.avgTime != null ? formatDuration(p.avgTime) : "—"}
          </span>
          <div style={{ paddingLeft: 12 }}>
            <div style={{ height: 6, borderRadius: 3, background: T.surface, overflow: "hidden" }}>
              <div style={{
                width: `${(p.views / maxViews) * 100}%`,
                height: "100%", borderRadius: 3, background: T.accent,
                transition: "width 0.3s",
              }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ErrorsTab({ stats }) {
  const { T } = useTheme();
  const [expanded, setExpanded] = useState(null);

  const errorList = Object.entries(stats.errorGroups)
    .sort((a, b) => b[1].count - a[1].count);

  const severityColors = {
    critical: T.danger,
    error: "#fb923c",
    warning: T.warn,
    info: T.textDim,
  };

  return (
    <div>
      {/* Error summary bar */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 16,
      }}>
        <MiniStat label="Total Errors" value={stats.errors} color={T.danger} icon="⚠" />
        <MiniStat label="Unique Errors" value={errorList.length} color="#fb923c" icon="🔍" />
        <MiniStat
          label="Error Rate"
          value={stats.totalEvents > 0 ? `${((stats.errors / stats.totalEvents) * 100).toFixed(1)}%` : "0%"}
          color={stats.errors > 0 ? T.warn : T.success}
          icon="📉"
        />
      </div>

      {/* Error list */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
        overflow: "hidden",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, fontFamily: T.fontDisplay, padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
          ERROR LOG
        </div>

        {errorList.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14, color: T.success, fontWeight: 700 }}>No errors recorded</div>
            <div style={{ fontSize: 12, color: T.textDim }}>All clear in the selected time range</div>
          </div>
        ) : errorList.map(([message, data], i) => (
          <div key={i} style={{ borderBottom: i < errorList.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <div
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px", cursor: "pointer",
                background: expanded === i ? T.surface : "transparent",
              }}
            >
              {/* Severity */}
              <span style={{
                width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                background: severityColors[data.severity] || T.danger,
              }} />

              {/* Count badge */}
              <span style={{
                padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                background: T.dangerDim, color: T.danger,
                fontSize: 11, fontWeight: 800, fontFamily: T.fontMono,
                minWidth: 28, textAlign: "center",
              }}>
                {data.count}x
              </span>

              {/* Message */}
              <span style={{
                flex: 1, fontSize: 13, color: T.text, fontFamily: T.fontMono,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {message}
              </span>

              {/* Context + time */}
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, flexShrink: 0 }}>
                {data.context || ""}
              </span>
              <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono, flexShrink: 0, whiteSpace: "nowrap" }}>
                {relTime(data.lastSeen)}
              </span>
              <span style={{ color: T.textMuted, fontSize: 10 }}>
                {expanded === i ? "▲" : "▼"}
              </span>
            </div>

            {expanded === i && (
              <div style={{ padding: "0 20px 16px 48px" }}>
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(239,68,68,0.04)",
                  border: "1px solid rgba(239,68,68,0.1)",
                  fontSize: 12, fontFamily: T.fontMono,
                }}>
                  <Row label="Severity" value={data.severity} color={severityColors[data.severity]} />
                  <Row label="Count" value={`${data.count} occurrences`} />
                  <Row label="Page" value={data.page || "—"} />
                  <Row label="Context" value={data.context || "—"} />
                  <Row label="Last seen" value={data.lastSeen ? new Date(data.lastSeen).toLocaleString() : "—"} />

                  {/* Show recent instances from raw errors */}
                  {stats.allErrors
                    .filter((e) => e.errorMessage === message)
                    .slice(0, 3)
                    .map((e, j) => (
                      <div key={j} style={{ marginTop: 8, padding: "8px 10px", background: T.surface, borderRadius: 6 }}>
                        <div style={{ fontSize: 10, color: T.textMuted }}>
                          {e.email} · {e.page} · {relTime(e.timestamp)}
                        </div>
                        {e.errorStack && (
                          <pre style={{ fontSize: 10, color: T.textMuted, whiteSpace: "pre-wrap", margin: "4px 0 0", maxHeight: 80, overflow: "auto" }}>
                            {e.errorStack.slice(0, 300)}
                          </pre>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USERS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function UsersTab({ stats }) {
  const { T } = useTheme();
  const users = Object.entries(stats.userActivity)
    .sort((a, b) => b[1].events - a[1].events)
    .slice(0, 30);

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
      overflow: "hidden",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.pro, fontFamily: T.fontDisplay, padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
        MOST ACTIVE USERS
      </div>

      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
        padding: "10px 20px", borderBottom: `1px solid ${T.border}`,
        background: T.surface,
      }}>
        <HeaderCell>User</HeaderCell>
        <HeaderCell align="right">Events</HeaderCell>
        <HeaderCell align="right">Searches</HeaderCell>
        <HeaderCell align="right">Errors</HeaderCell>
      </div>

      {users.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: T.textDim, fontSize: 13 }}>
          No user activity data yet.
        </div>
      ) : users.map(([email, data], i) => (
        <div key={email} style={{
          display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
          padding: "10px 20px", borderBottom: i < users.length - 1 ? `1px solid ${T.border}` : "none",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 12, color: T.text, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis" }}>
            {email}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.pro, fontFamily: T.fontMono, textAlign: "right" }}>
            {data.events}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.accent, fontFamily: T.fontMono, textAlign: "right" }}>
            {data.searches}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 600, fontFamily: T.fontMono, textAlign: "right",
            color: data.errors > 0 ? T.danger : T.textMuted,
          }}>
            {data.errors}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE STREAM TAB
// ═══════════════════════════════════════════════════════════════════════════════

function StreamTab({ events }) {
  const { T } = useTheme();
  const recent = events.slice(0, 100);

  const typeStyles = {
    page_view: { bg: T.accentDim, color: T.accent, label: "VIEW" },
    page_exit: { bg: "rgba(255,255,255,0.04)", color: T.textMuted, label: "EXIT" },
    event: { bg: T.proDim, color: T.pro, label: "EVENT" },
    error: { bg: T.dangerDim, color: T.danger, label: "ERROR" },
  };

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rL,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay,
        padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
      }}>
        <span>EVENT STREAM</span>
        <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 400 }}>
          Most recent {recent.length} events
        </span>
      </div>

      {recent.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: T.textDim, fontSize: 13 }}>
          No events yet. Activity will appear here in real-time.
        </div>
      ) : (
        <div style={{ maxHeight: 600, overflow: "auto" }}>
          {recent.map((evt, i) => {
            const style = typeStyles[evt.type] || typeStyles.event;
            return (
              <div key={evt.id || i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 20px",
                borderBottom: `1px solid ${T.border}`,
                fontSize: 12,
              }}>
                {/* Type badge */}
                <span style={{
                  padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                  background: style.bg, color: style.color,
                  fontSize: 9, fontWeight: 800, fontFamily: T.fontMono,
                  letterSpacing: 0.5, minWidth: 44, textAlign: "center",
                }}>
                  {style.label}
                </span>

                {/* Content */}
                <span style={{ flex: 1, color: T.text, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {evt.type === "page_view" && evt.page}
                  {evt.type === "page_exit" && `${evt.page} (${formatDuration(evt.timeOnPageSeconds)})`}
                  {evt.type === "event" && `${evt.category}/${evt.action}${evt.symbol ? ` [${evt.symbol}]` : ""}`}
                  {evt.type === "error" && evt.errorMessage?.slice(0, 80)}
                </span>

                {/* User */}
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, flexShrink: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {evt.email?.split("@")[0]}
                </span>

                {/* Time */}
                <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {relTime(evt.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function MiniStat({ label, value, icon, color }) {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: "14px 16px", flex: 1, minWidth: 120,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase" }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: 12, opacity: 0.4 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || T.text, fontFamily: T.fontDisplay }}>
        {value}
      </div>
    </div>
  );
}

function HeaderCell({ children, align }) {
  const { T } = useTheme();
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase",
      textAlign: align || "left",
    }}>
      {children}
    </span>
  );
}

function Row({ label, value, color }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span style={{ color: T.textDim }}>{label}</span>
      <span style={{ color: color || T.text, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function RankedList({ items, emptyMessage, color }) {
  const { T } = useTheme();
  if (items.length === 0) {
    return <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>{emptyMessage}</div>;
  }
  const max = items[0]?.value || 1;
  return (
    <div>
      {items.map((item, i) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ width: 18, fontSize: 10, color: T.textMuted, fontFamily: T.fontMono, textAlign: "right" }}>
            {i + 1}.
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: T.fontMono, minWidth: 50 }}>
            {item.label}
          </span>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.surface }}>
            <div style={{
              width: `${(item.value / max) * 100}%`, height: "100%", borderRadius: 2,
              background: color || T.accent,
            }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: color || T.accent, fontFamily: T.fontMono }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarChart({ data }) {
  const { T } = useTheme();
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(12, Math.min(40, Math.floor(600 / data.length)));

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", height: 80, justifyContent: "flex-end" }}>
            {/* Error bar (stacked on top) */}
            {d.errorValue > 0 && (
              <div style={{
                width: "80%", maxWidth: barWidth,
                height: Math.max(2, (d.errorValue / max) * 70),
                background: T.danger, borderRadius: "2px 2px 0 0",
              }} />
            )}
            {/* View bar */}
            <div style={{
              width: "80%", maxWidth: barWidth,
              height: Math.max(2, (d.value / max) * 70),
              background: T.accent,
              borderRadius: d.errorValue > 0 ? "0 0 2px 2px" : 2,
            }} />
          </div>
          <span style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono, marginTop: 4 }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──

function relTime(iso) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

function formatDuration(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
