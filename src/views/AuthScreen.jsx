// ─── src/views/AuthScreen.jsx ────────────────────────────────────────────────
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AnalyticsEvents, analytics } from "../services/analytics";
import { T } from "../theme";

export default function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup, error, setError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await signup(email, password, name);
        AnalyticsEvents.signupCompleted();
        navigate("/onboarding");
      } else {
        await login(email, password);
        AnalyticsEvents.loginCompleted();
        navigate("/");
      }
    } catch (err) {
      analytics.error(err, {
        context: "auth",
        severity: "warning",
        authMode: mode,
      });
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (focused) => ({
    width: "100%", padding: "12px 16px", borderRadius: T.r,
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${T.border}`,
    color: T.text, fontSize: 15, fontFamily: T.fontBody,
    outline: "none", transition: "all 0.2s",
  });

  return (
    <div style={{
      minHeight: "100vh", display: "flex", background: T.bg,
      fontFamily: T.fontBody, position: "relative",
    }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-30%", left: "-10%", width: "50vw", height: "50vw", background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`, opacity: 0.06, filter: "blur(80px)" }} />
      </div>

      {/* Left — branding */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px 48px", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 440 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent}, #00b894)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: T.bg, fontFamily: T.fontDisplay }}>CC</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>Covered Calls</div>
              <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>STRATEGY DASHBOARD</div>
            </div>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 800, color: T.text, lineHeight: 1.15, fontFamily: T.fontDisplay, marginBottom: 20 }}>
            Master covered calls<br /><span style={{ color: T.accent }}>without the risk.</span>
          </h1>
          <p style={{ fontSize: 15, color: T.textDim, lineHeight: 1.7, marginBottom: 36 }}>
            Paper trade, backtest strategies, and learn to write covered calls using real market data — all without risking a dime.
          </p>
          {["📊 Real-time options chain analysis", "📈 Historical strategy backtesting", "🎯 Strike price recommendations", "📋 Paper trade simulator", "💬 Private Slack community"].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>{f.slice(0, 2)}</span>
              <span style={{ fontSize: 14, color: T.text }}>{f.slice(3)}</span>
            </div>
          ))}
          <div style={{ marginTop: 32, padding: "14px 18px", background: T.accentDim, borderRadius: T.r, border: "1px solid rgba(0,212,170,0.15)" }}>
            <div style={{ fontSize: 13, color: T.accent, fontWeight: 700 }}>🎉 7-day free trial → then $10/mo</div>
            <div style={{ fontSize: 12, color: T.textDim }}>No credit card required. Full access to all features.</div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div style={{
        width: 440, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 36px", position: "relative", zIndex: 1,
        borderLeft: `1px solid ${T.border}`,
        background: "rgba(10,14,22,0.85)", backdropFilter: "blur(20px)",
      }}>
        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", marginBottom: 28, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4 }}>
            {["login", "signup"].map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 8,
                  background: mode === m ? T.accentDim : "transparent",
                  color: mode === m ? T.accent : T.textDim,
                  border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontBody,
                }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 6 }}>
            {mode === "login" ? "Welcome back" : "Start your free trial"}
          </h2>
          <p style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>
            {mode === "login" ? "Sign in to access your dashboard" : "7 days free, then $10/mo. Cancel anytime."}
          </p>

          {error && (
            <div style={{ padding: "10px 14px", marginBottom: 18, background: T.dangerDim, border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, color: T.danger, fontSize: 13 }}>{error}</div>
          )}

          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 1, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, textTransform: "uppercase" }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={inputStyle()} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 1, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, textTransform: "uppercase" }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required style={inputStyle()} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 1, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6, textTransform: "uppercase" }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={inputStyle()} />
          </div>

          <button type="submit" disabled={loading}
            style={{
              width: "100%", padding: "14px", borderRadius: T.r,
              background: T.accent, color: T.bg, border: "none",
              fontSize: 14, fontWeight: 700, fontFamily: T.fontBody,
              cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
              transition: "all 0.2s",
            }}>
            {loading ? "Working..." : mode === "login" ? "Sign In →" : "Start Free Trial →"}
          </button>
        </form>
      </div>
    </div>
  );
}
