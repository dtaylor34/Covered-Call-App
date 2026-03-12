// ─── src/contexts/AuthContext.jsx ────────────────────────────────────────────
// Provides auth state + Firestore user data to the entire app.
// Handles: login, signup (email + Google + Apple), logout, trial tracking,
//          role detection, onboarding state, search history, watchlist,
//          and promo code access (e.g. FAMILY34 = free access).

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc,
} from "firebase/firestore";
import { auth, db, googleProvider, appleProvider } from "../firebase";
import { useTheme } from "./ThemeContext";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

const TRIAL_DAYS = 7;
const MAX_SEARCH_HISTORY = 50;

// Promo codes that grant permanent free access
const FREE_ACCESS_CODES = ["FAMILY34"];

function getTrialInfo(trialStartISO) {
  if (!trialStartISO) return { daysLeft: 0, expired: true, percentUsed: 100 };
  const start = new Date(trialStartISO);
  const now = new Date();
  const elapsed = (now - start) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
  return {
    daysLeft,
    expired: daysLeft <= 0,
    percentUsed: Math.min(100, (elapsed / TRIAL_DAYS) * 100),
  };
}

export function AuthProvider({ children }) {
  const { setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Sync Firestore theme to ThemeContext on login (cross-device) ──
  useEffect(() => {
    if (userData?.theme) {
      setTheme(userData.theme);
    }
  }, [userData?.theme, setTheme]);

  // ── Listen for auth state changes ──
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          let snap = await getDoc(userRef);
          // Race condition guard: signup writes the doc then auth fires immediately.
          // Retry once if the doc isn't committed yet.
          if (!snap.exists()) {
            await new Promise((r) => setTimeout(r, 1500));
            snap = await getDoc(userRef);
          }
          if (snap.exists()) {
            setUserData(snap.data());
            await updateDoc(userRef, { lastActive: new Date().toISOString() });
          } else {
            setUserData(null);
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Create Firestore user doc (shared by all signup methods) ──
  const createUserDoc = useCallback(async (uid, email, name) => {
    const userDoc = {
      email,
      name: name || email.split("@")[0],
      trialStart: new Date().toISOString(),
      subscriptionStatus: "trial",
      monthlyRate: 10,
      totalPaid: 0,
      slackJoined: false,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      onboardingComplete: false,
      experienceLevel: null,
      investmentGoal: null,
      portfolioSize: null,
      newsletterOptIn: true,
      updateFrequency: "weekly",
      notifyNewFeatures: true,
      notifyMarketAlerts: true,
      notifyEducation: true,
      promoCode: null,
      promoAppliedAt: null,
      plan: "basic",
      theme: "dark",
      searchHistory: [],
      watchlist: [],
    };
    await setDoc(doc(db, "users", uid), userDoc);
    setUserData(userDoc);
    return userDoc;
  }, []);

  // ── Email/Password Sign Up ──
  const signup = useCallback(async (email, password, name) => {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUserDoc(cred.user.uid, email, name);
      return cred.user;
    } catch (e) {
      const msg = {
        "auth/email-already-in-use": "This email is already registered",
        "auth/weak-password": "Password must be at least 6 characters",
        "auth/invalid-email": "Invalid email address",
      }[e.code] || e.message;
      setError(msg);
      throw e;
    }
  }, [createUserDoc]);

  // ── Email/Password Sign In ──
  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user;
    } catch (e) {
      const msg = {
        "auth/user-not-found": "No account found with this email",
        "auth/wrong-password": "Incorrect password",
        "auth/invalid-credential": "Invalid email or password",
        "auth/too-many-requests": "Too many attempts — please wait a moment",
      }[e.code] || e.message;
      setError(msg);
      throw e;
    }
  }, []);

  // ── Google Sign In ──
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const uid = result.user.uid;
      const email = result.user.email;
      const name = result.user.displayName || email.split("@")[0];

      // Check if user doc exists — if not, create one (first-time user)
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await createUserDoc(uid, email, name);
      } else {
        setUserData(snap.data());
      }
      return result.user;
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user") return null;
      const msg = {
        "auth/account-exists-with-different-credential": "An account already exists with this email using a different sign-in method",
        "auth/popup-blocked": "Sign-in popup was blocked. Please allow popups and try again.",
      }[e.code] || e.message;
      setError(msg);
      throw e;
    }
  }, [createUserDoc]);

  // ── Apple Sign In ──
  const signInWithApple = useCallback(async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, appleProvider);
      const uid = result.user.uid;
      const email = result.user.email;
      const name = result.user.displayName || email?.split("@")[0] || "User";

      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await createUserDoc(uid, email, name);
      } else {
        setUserData(snap.data());
      }
      return result.user;
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user") return null;
      const msg = {
        "auth/account-exists-with-different-credential": "An account already exists with this email using a different sign-in method",
        "auth/popup-blocked": "Sign-in popup was blocked. Please allow popups and try again.",
      }[e.code] || e.message;
      setError(msg);
      throw e;
    }
  }, [createUserDoc]);

  // ── Sign Out ──
  const logout = useCallback(async () => {
    await signOut(auth);
    setUserData(null);
  }, []);

  // ── Refresh user data ──
  const refreshUserData = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) setUserData(snap.data());
  }, [user]);

  // ── Add to search history ──
  const addToSearchHistory = useCallback(async (symbol, context = {}) => {
    if (!user || !symbol) return;
    const sym = symbol.toUpperCase().trim();
    try {
      const userRef = doc(db, "users", user.uid);
      const currentHistory = userData?.searchHistory || [];
      const existing = currentHistory.find((h) => h.symbol === sym);
      const filtered = currentHistory.filter((h) => h.symbol !== sym);

      const entry = {
        symbol: sym,
        searchedAt: existing?.searchedAt || new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        stockPrice: context.stockPrice ?? existing?.stockPrice ?? null,
        selectedContract: context.selectedContract ?? existing?.selectedContract ?? null,
      };

      const updated = [entry, ...filtered].slice(0, MAX_SEARCH_HISTORY);
      await updateDoc(userRef, { searchHistory: updated });
      setUserData((prev) => prev ? { ...prev, searchHistory: updated } : prev);
    } catch (err) {
      console.warn("Search history update failed:", err.message);
    }
  }, [user, userData?.searchHistory]);

  // ── Update an existing history entry's research context ──
  const updateSearchHistoryEntry = useCallback(async (symbol, context) => {
    if (!user || !symbol) return;
    const sym = symbol.toUpperCase().trim();
    try {
      const userRef = doc(db, "users", user.uid);
      const currentHistory = userData?.searchHistory || [];
      const idx = currentHistory.findIndex((h) => h.symbol === sym);
      if (idx === -1) {
        return addToSearchHistory(sym, context);
      }

      const updated = [...currentHistory];
      updated[idx] = {
        ...updated[idx],
        lastUpdatedAt: new Date().toISOString(),
        stockPrice: context.stockPrice ?? updated[idx].stockPrice,
        selectedContract: context.selectedContract ?? updated[idx].selectedContract,
      };

      await updateDoc(userRef, { searchHistory: updated });
      setUserData((prev) => prev ? { ...prev, searchHistory: updated } : prev);
    } catch (err) {
      console.warn("Search history entry update failed:", err.message);
    }
  }, [user, userData?.searchHistory, addToSearchHistory]);

  // ── Delete specific items from search history ──
  const deleteFromSearchHistory = useCallback(async (symbols) => {
    if (!user || !symbols || symbols.length === 0) return;
    const toRemove = new Set(symbols.map((s) => s.toUpperCase().trim()));
    try {
      const userRef = doc(db, "users", user.uid);
      const currentHistory = userData?.searchHistory || [];
      const updated = currentHistory.filter((h) => !toRemove.has(h.symbol));
      await updateDoc(userRef, { searchHistory: updated });
      setUserData((prev) => prev ? { ...prev, searchHistory: updated } : prev);
    } catch (err) {
      console.warn("Search history delete failed:", err.message);
    }
  }, [user, userData?.searchHistory]);

  // ── Clear entire search history ──
  const clearSearchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { searchHistory: [] });
      setUserData((prev) => prev ? { ...prev, searchHistory: [] } : prev);
    } catch (err) {
      console.warn("Search history clear failed:", err.message);
    }
  }, [user]);

  // ── Update watchlist ──
  const updateWatchlist = useCallback(async (symbols) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const watchlist = symbols.slice(0, 20);
      await updateDoc(userRef, { watchlist });
      setUserData((prev) => prev ? { ...prev, watchlist } : prev);
    } catch (err) {
      console.warn("Watchlist update failed:", err.message);
    }
  }, [user]);

  // ── Update plan tier ──
  const updatePlan = useCallback(async (plan) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { plan });
      setUserData((prev) => prev ? { ...prev, plan } : prev);
    } catch (err) {
      console.warn("Plan update failed:", err.message);
    }
  }, [user]);

  // ── Update theme preference (syncs to Firestore for cross-device) ──
  const updateUserTheme = useCallback(async (theme) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { theme });
      setUserData((prev) => prev ? { ...prev, theme } : prev);
    } catch (err) {
      console.warn("Theme update failed:", err.message);
    }
  }, [user]);

  // ── Mark onboarding complete (Firestore + local state in one shot) ──
  // Patches userData immediately so route guards see the change before navigate() fires.
  const markOnboardingComplete = useCallback(async (fields = {}) => {
    if (!user) return;
    const now = new Date().toISOString();
    const patch = { ...fields, onboardingComplete: true, onboardingCompletedAt: now };
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, patch);
    setUserData((prev) => prev ? { ...prev, ...patch } : patch);
  }, [user]);

  // ── Update profile fields ──
  const updateProfile = useCallback(async (fields) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const safeFields = {};
      const allowed = ["name", "experienceLevel", "investmentGoal", "portfolioSize",
        "newsletterOptIn", "updateFrequency", "notifyNewFeatures", "notifyMarketAlerts", "notifyEducation"];
      for (const key of allowed) {
        if (fields[key] !== undefined) safeFields[key] = fields[key];
      }
      if (Object.keys(safeFields).length === 0) return;
      await updateDoc(userRef, safeFields);
      setUserData((prev) => prev ? { ...prev, ...safeFields } : prev);
    } catch (err) {
      console.warn("Profile update failed:", err.message);
    }
  }, [user]);

  // ── Derived state ──
  const role = userData?.role || null;
  const isAdmin = role === "owner" || role === "admin" || role === "moderator";
  const isOwner = role === "owner";
  const trialInfo = getTrialInfo(userData?.trialStart);
  const subscriptionStatus = userData?.subscriptionStatus || "trial";
  const plan = userData?.plan || "basic";

  // Check if user has a free-access promo code
  const hasFreeAccessCode = FREE_ACCESS_CODES.includes(
    (userData?.promoCode || "").toUpperCase()
  );

  const isTrial = subscriptionStatus === "trial" || subscriptionStatus === "trialing";
  const isTrialExpired = isTrial && trialInfo.expired && !hasFreeAccessCode;
  const hasAccess = subscriptionStatus === "active" || hasFreeAccessCode ||
    (isTrial && !trialInfo.expired);
  const onboardingComplete = userData?.onboardingComplete ?? false;

  const value = {
    user, currentUser: user, userData, loading, error,
    signup, login, signInWithGoogle, signInWithApple, logout, refreshUserData, markOnboardingComplete, setError,
    addToSearchHistory, updateSearchHistoryEntry, deleteFromSearchHistory, clearSearchHistory,
    updateWatchlist, updatePlan, updateUserTheme, updateProfile,
    searchHistory: userData?.searchHistory || [],
    watchlist: userData?.watchlist || [],
    role, isAdmin, isOwner, trialInfo, plan,
    subscriptionStatus, isTrialExpired, hasAccess, hasFreeAccessCode, onboardingComplete,
    uid: user?.uid || null,
    email: user?.email || null,
    name: userData?.name || user?.displayName || user?.email?.split("@")[0] || null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
