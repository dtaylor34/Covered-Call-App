// ─── src/firebase.js ────────────────────────────────────────────────────────
// Firebase initialization.
// Emulators only connect when VITE_USE_EMULATORS=true is explicitly set.
// ────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FB_API_KEY            || "demo-api-key",
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN        || "demo-project.firebaseapp.com",
  projectId:         import.meta.env.VITE_FB_PROJECT_ID         || "demo-project",
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET     || "demo-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_ID       || "000000000000",
  appId:             import.meta.env.VITE_FB_APP_ID             || "1:000:web:000",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// ── OAuth Providers ──
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

// ── Emulators (explicit opt-in only) ──
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true";

if (USE_EMULATORS) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log("🔧 Connected to Firebase Emulators");
  } catch (e) {
    console.log("⚠ Emulators already connected or unavailable");
  }
}

export default app;
