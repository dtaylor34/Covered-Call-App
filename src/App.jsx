// ─── src/App.jsx ────────────────────────────────────────────────────────────
// Root router: auth → onboarding → trial gate → dashboard OR admin panel
// Everything gated by AuthContext.
//
// Flow for new users:
//   1. /login (AuthScreen) — create account with email/password
//   2. /onboarding (OnboardingScreen) — profile, preferences, promo code
//   3. / (Dashboard) — 7-day trial begins
//   4. /upgrade (PaywallScreen) — after trial expires
//
// Flow for returning users:
//   1. /login → / (Dashboard) — onboarding already complete

import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import AuthScreen from "./views/AuthScreen";
import OnboardingScreen from "./views/OnboardingScreen";
import Dashboard from "./views/Dashboard";
import AdminPanel from "./views/AdminPanel";
import PaywallScreen from "./views/PaywallScreen";
import CheckoutScreen from "./views/CheckoutScreen";
import SearchHistory from "./views/SearchHistory";

// ── Loading Screen ──
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#05070b", color: "#00d4aa", fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "3px solid rgba(0,212,170,0.2)",
          borderTopColor: "#00d4aa", borderRadius: "50%",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        Loading...
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

// ── Admin Floating Link ──
function AdminLink() {
  const { isAdmin, role } = useAuth();
  if (!isAdmin) return null;

  const roleColors = {
    owner: "#f59e0b",
    admin: "#818cf8",
    moderator: "#22c55e",
  };

  return (
    <Link to="/admin" style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 100,
      padding: "10px 18px", borderRadius: 10,
      background: `${roleColors[role]}15`,
      border: `1px solid ${roleColors[role]}33`,
      color: roleColors[role],
      fontSize: 12, fontWeight: 700, textDecoration: "none",
      fontFamily: "'JetBrains Mono', monospace",
      backdropFilter: "blur(12px)",
      transition: "all 0.2s",
    }}>
      ⚙ Admin Panel
    </Link>
  );
}

// ── Route Guards ──

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function RequireCheckout({ children }) {
  const { user, userData, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!userData?.stripeCustomerId) return <Navigate to="/checkout" replace />;
  return children;
}

function RequireOnboarding({ children }) {
  const { user, onboardingComplete, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;
  return children;
}

function RequireAccess({ children }) {
  const { user, hasAccess, isTrialExpired, onboardingComplete, userData, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // Must complete checkout (card collection) before onboarding
  if (!userData?.stripeCustomerId) return <Navigate to="/checkout" replace />;
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;
  if (isTrialExpired) return <Navigate to="/upgrade" replace />;
  return children;
}

// ── Main App ──
export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Routes>
        {/* ── Public: Auth ── */}
        <Route path="/login" element={
          user ? <Navigate to="/" replace /> : <AuthScreen />
        } />

        {/* ── Onboarding (auth required, shown once after signup) ── */}
        <Route path="/onboarding" element={
          <RequireCheckout><OnboardingScreen /></RequireCheckout>
        } />

        {/* ── Checkout (auth required, collect card after signup) ── */}
        <Route path="/checkout" element={
          <RequireAuth><CheckoutScreen /></RequireAuth>
        } />

        {/* ── Paywall ── */}
        <Route path="/upgrade" element={
          <RequireOnboarding><PaywallScreen /></RequireOnboarding>
        } />

        {/* ── Admin Panel (role-gated) ── */}
        <Route path="/admin/*" element={
          <RequireAdmin><AdminPanel /></RequireAdmin>
        } />

        {/* ── Search History ── */}
        <Route path="/history" element={
          <RequireAccess>
            <SearchHistory />
            <AdminLink />
          </RequireAccess>
        } />

        {/* ── Main Dashboard (onboarding + subscription gated) ── */}
        <Route path="/*" element={
          <RequireAccess>
            <Dashboard />
            <AdminLink />
          </RequireAccess>
        } />
      </Routes>
    </>
  );
}
