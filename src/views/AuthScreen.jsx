// ─── src/views/AuthScreen.jsx ────────────────────────────────────────────────
// Responsive auth screen: side-by-side on desktop, stacked on mobile.
// Supports email/password, Google, and Apple sign-in.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AnalyticsEvents, analytics } from "../services/analytics";
import { useTheme } from "../contexts/ThemeContext";

export default function AuthScreen() {
  const { T } = useTheme();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // "google" | "apple" | null
  const { login, signup, signInWithGoogle, signInWithApple, userData, onboardingComplete } = useAuth();
  const [error, setError] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const navigate = useNavigate();

  // Track window width for responsive layout
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);



  const handleSubmit = async (e) => {
    e.preventDefault();
    setUserInteracted(true);
    setLoading(true);
    try {
      if (mode === "signup") {
        await signup(email, password, name);
        AnalyticsEvents.signupCompleted();
        navigate("/checkout");
      } else {
        await login(email, password);
        AnalyticsEvents.loginCompleted();
        navigate("/");
      }
    } catch (err) {
      setError(err?.friendlyMessage || err?.message || "Sign-in failed. Please try again.");
      analytics.error(err, { context: "auth", severity: "warning", authMode: mode });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    const providerName = provider === "google" ? "Google" : "Apple";
    setUserInteracted(true);
    setOauthLoading(provider);
    setError(null);
    try {
      const user = provider === "google"
        ? await signInWithGoogle()
        : await signInWithApple();

      if (!user) {
        setOauthLoading(null);
        return; // popup closed
      }

      AnalyticsEvents.loginCompleted();
      // OAuth users who are new go to onboarding, returning users go to dashboard
      // The route guards in App.jsx handle this automatically
      navigate("/");
    } catch (err) {
      const msg = err?.friendlyMessage
        || (err?.message?.includes("invalid_client") || err?.code === "auth/invalid-credential"
            ? "Apple Sign-In is not configured yet. Please use Google or email to sign in."
            : err?.message || "Sign-in failed. Please try again.");
      setError(msg);
      analytics.error(err, { context: "auth", severity: "warning", authMode: `oauth_${provider}` });
    } finally {
      setOauthLoading(null);
    }
  };

  const inputStyle = {
    width: "100%", padding: "12px 16px", borderRadius: T.r,
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${T.border}`,
    color: T.text, fontSize: 15, fontFamily: T.fontBody,
    outline: "none", transition: "all 0.2s",
    boxSizing: "border-box",
  };

  const oauthBtnStyle = (isLoading) => ({
    width: "100%", padding: "12px 16px", borderRadius: T.r,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${T.border}`,
    color: T.text, fontSize: 14, fontWeight: 600, fontFamily: T.fontBody,
    cursor: isLoading ? "wait" : "pointer",
    opacity: isLoading ? 0.6 : 1,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    transition: "all 0.2s",
  });

  const features = [
    "📊 Real-time options chain analysis",
    "📈 Historical strategy backtesting",
    "🎯 Strike price recommendations",
    "📋 Paper trade simulator",
    "💬 Private Slack community",
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      flexDirection: isMobile ? "column" : "row",
      background: T.bg, fontFamily: T.fontBody, position: "relative",
    }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-30%", left: "-10%",
          width: "50vw", height: "50vw",
          background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`,
          opacity: 0.06, filter: "blur(80px)",
        }} />
      </div>

      {/* ── Left / Top — Branding ── */}
      <div style={{
        flex: isMobile ? "none" : 1,
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: isMobile ? "40px 24px 24px" : "60px 48px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ maxWidth: 440 }}>
          {/* Logo */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: isMobile ? 20 : 32 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `linear-gradient(135deg, ${T.accent}, #00b894)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 900, color: T.bg, fontFamily: T.fontDisplay,
            }}>CC</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>Covered Calls</div>
              <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>STRATEGY DASHBOARD</div>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: isMobile ? 28 : 38, fontWeight: 800, color: T.text,
            lineHeight: 1.15, fontFamily: T.fontDisplay, marginBottom: isMobile ? 14 : 20,
          }}>
            Master covered calls<br />
            <span style={{ color: T.accent }}>without the risk.</span>
          </h1>

          <p style={{
            fontSize: isMobile ? 14 : 15, color: T.textDim, lineHeight: 1.7,
            marginBottom: isMobile ? 20 : 36,
          }}>
            Paper trade, backtest strategies, and learn to write covered calls using real market data — all without risking a dime.
          </p>

          {/* Feature list — hidden on mobile to save space */}
          {!isMobile && (
            <>
              {features.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <span style={{ fontSize: 16 }}>{f.slice(0, 2)}</span>
                  <span style={{ fontSize: 14, color: T.text }}>{f.slice(3)}</span>
                </div>
              ))}
              <div style={{
                marginTop: 32, padding: "14px 18px", background: T.accentDim,
                borderRadius: T.r, border: "1px solid rgba(0,212,170,0.15)",
              }}>
                <div style={{ fontSize: 13, color: T.accent, fontWeight: 700 }}>🎉 7-day free trial → then $10/mo</div>
                <div style={{ fontSize: 12, color: T.textDim }}>No credit card required. Full access to all features.</div>
              </div>
            </>
          )}

          {/* Compact trial badge on mobile */}
          {isMobile && (
            <div style={{
              padding: "10px 14px", background: T.accentDim,
              borderRadius: T.r, border: "1px solid rgba(0,212,170,0.15)",
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 13, color: T.accent, fontWeight: 700 }}>🎉 7-day free trial → then $10/mo</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right / Bottom — Auth Form ── */}
      <div style={{
        width: isMobile ? "100%" : 440,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: isMobile ? "24px 24px 40px" : "40px 36px",
        position: "relative", zIndex: 1,
        borderLeft: isMobile ? "none" : `1px solid ${T.border}`,
        borderTop: isMobile ? `1px solid ${T.border}` : "none",
        background: "rgba(10,14,22,0.85)", backdropFilter: "blur(20px)",
      }}>
        <div style={{ width: "100%", maxWidth: isMobile ? 400 : "100%" }}>
          {/* Tab switcher */}
          <div style={{
            display: "flex", marginBottom: 24,
            background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4,
          }}>
            {["login", "signup"].map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 8,
                  background: mode === m ? T.accentDim : "transparent",
                  color: mode === m ? T.accent : T.textDim,
                  border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                  fontFamily: T.fontBody,
                }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 6 }}>
            {mode === "login" ? "Welcome back" : "Start your free trial"}
          </h2>
          <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
            {mode === "login" ? "Sign in to access your dashboard" : "7 days free, then $10/mo. Cancel anytime."}
          </p>

          {/* ── OAuth Buttons ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <button type="button" onClick={() => handleOAuth("google")} disabled={!!oauthLoading}
              style={oauthBtnStyle(oauthLoading === "google")}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {oauthLoading === "google" ? "Connecting..." : "Continue with Google"}
            </button>

            <button type="button" disabled title="Apple Sign-In coming soon"
              style={{ ...oauthBtnStyle(false), opacity: 0.4, cursor: "not-allowed" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={T.text}>
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple <span style={{ fontSize: 10, opacity: 0.7 }}>(coming soon)</span>
            </button>
          </div>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
          }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>OR</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          {/* ── Email/Password Form ── */}
          {error && userInteracted && (
            <div style={{
              padding: "10px 14px", marginBottom: 16,
              background: T.dangerDim, border: `1px solid rgba(239,68,68,0.3)`,
              borderRadius: 8, color: T.danger, fontSize: 13,
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 1,
                  color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, textTransform: "uppercase",
                }}>Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name" style={inputStyle} />
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 1,
                color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, textTransform: "uppercase",
              }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com" required style={inputStyle} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 1,
                color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, textTransform: "uppercase",
              }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required style={inputStyle} />
            </div>

            <button type="submit" disabled={loading || !!oauthLoading}
              style={{
                width: "100%", padding: "14px", borderRadius: T.r,
                background: T.accent, color: T.bg, border: "none",
                fontSize: 14, fontWeight: 700, fontFamily: T.fontBody,
                cursor: loading ? "wait" : "pointer",
                opacity: (loading || oauthLoading) ? 0.6 : 1,
                transition: "all 0.2s",
              }}>
              {loading ? "Working..." : mode === "login" ? "Sign In →" : "Start Free Trial →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
