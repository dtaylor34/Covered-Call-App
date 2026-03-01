// ─── src/firebase.js ────────────────────────────────────────────────────────
// Firebase initialization with automatic emulator detection for local dev.
//
// HOW TO SET UP:
// 1. Go to https://console.firebase.google.com → Create Project
// 2. Enable Auth (Email/Password) under Build → Authentication
// 3. Create Firestore Database under Build → Firestore
// 4. Register a Web App under Project Settings → Your Apps
// 5. Copy the config values below
// ────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  REPLACE THESE WITH YOUR FIREBASE PROJECT CONFIG                        ║
// ║  Get them from: Firebase Console → Project Settings → Your Apps → Web   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FB_API_KEY            || "demo-api-key",
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN        || "demo-project.firebaseapp.com",
  projectId:         import.meta.env.VITE_FB_PROJECT_ID         || "demo-project",
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET     || "demo-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_ID       || "000000000000",
  appId:             import.meta.env.VITE_FB_APP_ID             || "1:000:web:000",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// If you see "Failed to load resource: Could not connect (iframe)" in the console,
// it's Firebase Auth's hidden iframe (used for session refresh). Browsers or
// extensions (e.g. privacy blockers) often block it on localhost. Sign-in and
// app behavior usually still work; you can ignore the message in dev.

// ── Connect to local emulators only when explicitly enabled ───────────────────
// Set VITE_USE_EMULATORS=true in .env when running firebase emulators:start.
// If you run on localhost without this flag, the app uses production Firebase
// (no "iframe could not connect" error from Auth trying to reach localhost:9099).
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true";

if (USE_EMULATORS) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log("🔧 Connected to Firebase Emulators (Auth:9099, Firestore:8080, Functions:5001)");
  } catch (e) {
    console.log("⚠ Emulators already connected or unavailable");
  }
}
export default app;
