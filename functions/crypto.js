// ─── functions/crypto.js ─────────────────────────────────────────────────────
// Authenticated encryption for broker credentials (Schwab appKey/appSecret and
// OAuth access/refresh tokens) before they are written to Firestore.
//
// Algorithm: AES-256-GCM (confidentiality + integrity/tamper detection).
// Key:       32 bytes, base64-encoded, injected at runtime via the Secret
//            Manager secret SCHWAB_ENC_KEY (see docs/BROKER_CONNECTIONS.md).
//            The key never lives in source, in Firestore, or in the client.
//
// Ciphertext format (self-describing, colon-delimited, all base64):
//   v1:<iv>:<authTag>:<ciphertext>
//
// SECURITY: only Cloud Functions bind SCHWAB_ENC_KEY, so only server-side code
// can decrypt. Anyone with raw Firestore/console access sees ciphertext only.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, recommended for GCM

function getKey() {
  const raw = process.env.SCHWAB_ENC_KEY;
  if (!raw) {
    throw new Error(
      "SCHWAB_ENC_KEY is not configured. Set it with: firebase functions:secrets:set SCHWAB_ENC_KEY"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SCHWAB_ENC_KEY must decode to exactly 32 bytes (base64 of a 256-bit key).");
  }
  return key;
}

/**
 * Encrypt a UTF-8 string. Returns null for null/undefined input.
 * @param {string|null} plaintext
 * @returns {string|null} "v1:<iv>:<tag>:<ciphertext>" (all base64)
 */
function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Decrypt a value produced by encrypt(). Returns null for null/undefined input.
 * Throws if the ciphertext is malformed or fails the authentication tag check.
 * @param {string|null} payload
 * @returns {string|null}
 */
function decrypt(payload) {
  if (payload == null) return null;
  const parts = String(payload).split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed or unsupported ciphertext.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = { encrypt, decrypt };
