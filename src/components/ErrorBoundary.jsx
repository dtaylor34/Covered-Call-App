// ─── src/components/ErrorBoundary.jsx ────────────────────────────────────────
// Catches unhandled React render errors.
// Reports them to the analytics service, shows a recovery UI.
// ─────────────────────────────────────────────────────────────────────────────

import { Component } from "react";
import { AnalyticsEvents } from "../services/analytics";
import { T } from "../theme";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Report to analytics
    const componentName = errorInfo?.componentStack
      ?.split("\n")
      ?.find((line) => line.trim().startsWith("at "))
      ?.trim()
      ?.replace(/^at\s+/, "")
      ?.split(" ")[0] || "Unknown";

    AnalyticsEvents.renderError(componentName, error);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: T.bg, fontFamily: T.fontBody, color: T.text,
        }}>
          <div style={{
            maxWidth: 480, width: "100%", padding: 32,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.rL, textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{
              fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay,
              marginBottom: 8,
            }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 14, color: T.textDim, marginBottom: 20, lineHeight: 1.6 }}>
              An unexpected error occurred. This has been logged and our team will look into it.
            </p>

            {/* Error details (collapsed) */}
            <details style={{ textAlign: "left", marginBottom: 20 }}>
              <summary style={{
                fontSize: 12, color: T.textMuted, cursor: "pointer",
                fontFamily: T.fontMono, marginBottom: 8,
              }}>
                Error details
              </summary>
              <div style={{
                padding: "12px 14px", borderRadius: 8,
                background: T.dangerDim, border: "1px solid rgba(239,68,68,0.2)",
                fontSize: 12, fontFamily: T.fontMono, color: "#fca5a5",
                wordBreak: "break-all", maxHeight: 200, overflow: "auto",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {this.state.error?.name}: {this.state.error?.message}
                </div>
                {this.state.error?.stack && (
                  <pre style={{ fontSize: 10, color: T.textMuted, whiteSpace: "pre-wrap", margin: 0 }}>
                    {this.state.error.stack.slice(0, 600)}
                  </pre>
                )}
              </div>
            </details>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: "12px 24px", borderRadius: T.r,
                  background: T.accent, color: T.bg, border: "none",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = "/"}
                style={{
                  padding: "12px 24px", borderRadius: T.r,
                  background: "transparent", color: T.textDim,
                  border: `1px solid ${T.border}`,
                  fontSize: 13, cursor: "pointer",
                }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
