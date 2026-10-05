// ─── functions/bootstrap.js ───────────────────────────────────────────────────
// One-time owner bootstrap. New user docs are created without a role (→ viewer),
// so the very first owner has to be granted server-side. This callable promotes
// ONLY the known project owner email, and ONLY if no other owner exists yet, so
// it can't be used to escalate privileges. Safe to leave deployed (double-gated);
// can be removed once ownership is established.
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// The sole account allowed to claim ownership (the project operator).
const OWNER_EMAIL = "dtaylor34@gmail.com";

exports.claimOwnership = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const email = String(request.auth.token?.email || "").toLowerCase();
  if (email !== OWNER_EMAIL) {
    throw new HttpsError("permission-denied", "This account can't claim ownership.");
  }

  const db = admin.firestore();
  const uid = request.auth.uid;

  // Only bootstrap when no OTHER account already holds owner.
  const existing = await db.collection("users").where("role", "==", "owner").limit(1).get();
  if (!existing.empty && existing.docs[0].id !== uid) {
    throw new HttpsError("already-exists", "An owner already exists for this project.");
  }

  await db.collection("users").doc(uid).set({ role: "owner" }, { merge: true });
  return { ok: true, role: "owner" };
});
