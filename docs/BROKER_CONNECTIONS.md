# Broker Connections — Security Model & Setup

> **Status:** Active — Schwab (Phase 1)
> **Applies to:** `functions/schwab.js`, `functions/crypto.js`, `src/components/APITab.jsx`,
> `src/hooks/useBrokerConnection.js`, `src/services/schwabApi.js`, `firestore.rules`
>
> **Read this before touching any broker/credential code.** The rules below are
> non-negotiable.

---

## 0. The one rule

**A user's broker credentials (App Key, App Secret, OAuth tokens) must NEVER be
visible to anyone but that user — not other users, not admins, not operators,
not anyone with database or console access. Ever.**

Everything in this document exists to make that true and to keep it true.

---

## 1. What we store, and where

Each connected user has **two** places their Schwab data lives. Only one is
readable by the browser, and it contains **no secrets**.

| Firestore path | Contents | Who can read | Who can write |
|----------------|----------|--------------|---------------|
| `users/{uid}/private/schwabSecret` | **Encrypted** appKey, appSecret, accessToken, refreshToken, expiries | **No one** via rules — Cloud Functions only (Admin SDK) | Cloud Functions only |
| `users/{uid}/brokerConnections/schwab` | Status only: `status`, `appKeyLast4`, `accountCount`, timestamps | The owner (`uid`) | **No client** — Cloud Functions only |
| `users/{uid}/brokerAccounts/{id}` | Non-sensitive account id + hash, `isDefault` | The owner | The owner (toggle default) + Functions |

The secrets never appear in `brokerConnections`. The most the client ever sees
about the key is the **last 4 characters** (`appKeyLast4`), for display.

---

## 2. Defense in depth — the four layers

A secret would have to defeat **all four** of these to leak:

1. **Never in the browser.** The client sends credentials to a Cloud Function
   over HTTPS and never writes them to Firestore, never reads them back. The
   `brokerConnections` doc it subscribes to has no secrets in it.
2. **Firestore Security Rules.** `private/**` is `read, write: if false` for
   every client. `brokerConnections` is `read: owner, write: false`. Rules are
   enforced by Firestore itself for all client SDK access.
3. **Encryption at rest (AES-256-GCM).** Even someone with raw database or
   Firebase console access sees ciphertext, not the key/secret/tokens. See
   `functions/crypto.js`.
4. **Key isolation (Secret Manager).** The AES key `SCHWAB_ENC_KEY` is a Google
   Secret Manager secret bound **only** to the Schwab Cloud Functions. It is not
   in source, not in Firestore, not in the client bundle. Decryption is only
   possible inside those functions at runtime.

> To read a user's App Secret you would need **both** Firestore access **and**
> the Secret Manager key **and** the ability to run code in the functions'
> service-account context. No user, admin, or support role has that.

---

## 3. Who can see what — threat model

| Actor | Can they see a user's App Secret / tokens? | Why not |
|-------|---------------------------------------------|---------|
| A different logged-in user | ❌ | Rules scope every path to `request.auth.uid == userId` |
| An admin / owner / support role | ❌ | `private/**` is `read: if false`; admins get **no** exception |
| The user's own browser (after entry) | ❌ (not read back) | Client never reads secrets; only sends them once to the function |
| Someone reading Firestore directly / console | ❌ (ciphertext only) | AES-256-GCM encrypted; key not in the database |
| The Cloud Function, acting for the signed-in user | ✅ (in memory, transiently) | This is the only place decryption happens — to call Schwab on the user's behalf |
| The user themselves | ✅ (they typed it) | It's their own credential |

---

## 4. Connection flow

```
User (APITab)                Cloud Functions                 Schwab / Firestore
─────────────                ───────────────                 ──────────────────
Enter App Key + Secret
      │  schwabInitiateOAuth({appKey, appSecret, redirectUri})   (HTTPS)
      ├──────────────────────────►  encrypt(appKey, appSecret)
      │                             write → users/{uid}/private/schwabSecret (ciphertext)
      │                             write → brokerConnections/schwab {status:"pending", appKeyLast4}
      │  ◄── { authUrl } ──────────
Open authUrl (popup) ─────────────────────────────────────────►  Schwab login + consent
Schwab redirects to /api/schwab/callback?code=...
      │  schwabExchangeToken({code, redirectUri})
      ├──────────────────────────►  getSecret(uid) → decrypt appKey/appSecret
      │                             POST Schwab token endpoint (Basic auth)
      │                             encrypt(access/refresh tokens) → private doc
      │                             write brokerConnections {status:"connected", accountCount}
      │  ◄── { success, accountCount }
```

Every later data call (`schwabGetPositions`, `schwabGetQuotes`, …) does:
`getSecret(uid)` → `ensureFreshToken(uid, secret)` (auto-refresh) → call Schwab.
Credentials are decrypted **only** in function memory, never returned to the client.

---

## 5. One-time setup (per Firebase project)

Credentials are encrypted with a 256-bit key held in Secret Manager. Create it
once per environment (prod, and any test project):

```bash
# 1. Generate a random 32-byte key, base64-encoded
openssl rand -base64 32
# → e.g. 9f2a...Xy=   (copy this)

# 2. Store it as a Firebase secret (paste the value when prompted)
firebase functions:secrets:set SCHWAB_ENC_KEY --project covered-calls-prod

# 3. Deploy the rules and the Schwab functions
firebase deploy --only firestore:rules --project covered-calls-prod
firebase deploy --only functions:schwabInitiateOAuth,functions:schwabExchangeToken,\
functions:schwabRefreshToken,functions:schwabDisconnect,functions:schwabGetPositions,\
functions:schwabGetBuyingPower,functions:schwabGetQuotes,functions:schwabGetOptionChain \
  --project covered-calls-prod
```

**Local / emulator:** put `SCHWAB_ENC_KEY=<base64 key>` in `functions/.env`
(gitignored). Any 32-byte base64 value works for local testing.

> ⚠️ If `SCHWAB_ENC_KEY` is missing, the Schwab functions fail closed — they
> throw on encrypt/decrypt rather than storing anything in plaintext.

---

## 6. Key rotation

The ciphertext is versioned (`v1:...`). To rotate:

1. Set a new `SCHWAB_ENC_KEY` (Secret Manager keeps versions).
2. Because Schwab refresh tokens are short-lived (~7 days) and re-issued on
   refresh, the simplest safe rotation is to have users **reconnect** (they
   re-enter their key/secret, which is re-encrypted under the new key).
3. For zero-touch rotation, add a `v2` scheme in `crypto.js` and a one-off
   re-encrypt migration. Not required for Phase 1.

---

## 7. Rules for developers (do / don't)

**Do**
- Keep all credential reads/writes inside `functions/schwab.js` via `getSecret`,
  `secretRef`, `writeStatus`.
- Store only non-sensitive status in `brokerConnections` (things safe to show).
- `encrypt()` every secret before it touches Firestore.

**Never**
- ❌ Write `appKey`, `appSecret`, `accessToken`, or `refreshToken` to any
  client-readable document.
- ❌ Read secrets from the browser, or return them from a callable.
- ❌ Log a credential, token, or a Schwab response body that may echo one.
- ❌ Relax `private/**` rules, or add an admin read exception to secrets.
- ❌ Put `SCHWAB_ENC_KEY` in source, `.env` that is committed, or the frontend.

If a change would touch any of the above, stop and update **this document** and
`firestore.rules` together, and get it reviewed.

---

## 8. File map

| File | Responsibility |
|------|----------------|
| `functions/crypto.js` | AES-256-GCM encrypt/decrypt using `SCHWAB_ENC_KEY` |
| `functions/schwab.js` | All Schwab calls; secret storage split (private vs status) |
| `firestore.rules` | Seals `private/**`; makes `brokerConnections` read-only to owner |
| `src/services/schwabApi.js` | Thin client → callable wrappers (no Firestore) |
| `src/hooks/useBrokerConnection.js` | Subscribes to **status only**; disconnect via function |
| `src/components/APITab.jsx` | UI; sends creds to the function once, never stores them |
