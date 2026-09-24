# Incident Response Runbook — Broker Credentials & User Data

> **Purpose:** exactly what to do if a Schwab credential, user data, or the app
> is (or might be) compromised. Read the top section first; it's the 60-second
> version. Companion to `docs/BROKER_CONNECTIONS.md`.

---

## 0. First, the facts that limit any incident

- **The app is READ-ONLY against Schwab.** It only reads positions, balances,
  quotes, and option chains — it **cannot place orders, cancel orders, or move
  money.** Worst-case exposure is *visibility* of holdings, never trading.
- **Credentials are encrypted at rest** (AES-256-GCM); the key lives in Secret
  Manager, not in the database, code, browser, or GitHub. A database breach
  yields **ciphertext only**.
- **You hold the master switch at Schwab** — regenerating the App Secret or
  revoking the app in Schwab's developer portal instantly voids any leaked key
  anywhere on the internet. This does not depend on us.
- **Per-user isolation** is enforced server-side and verified. One user cannot
  reach another's data.

---

## 1. 60-second response (any suspected credential exposure)

Do these in order. Steps 1–2 are the ones that matter most.

1. **Revoke at Schwab** (the definitive kill): Schwab Developer Portal → your app
   → **regenerate App Secret** (or delete/deactivate the app). Any leaked copy is
   now useless. *This is in your hands and works even if our systems are down.*
2. **Disconnect in-app:** APIs tab → **Disconnect**. This calls `schwabDisconnect`,
   which server-side deletes the encrypted secret, tokens, status, and linked
   accounts for your user.
3. **Rotate your Schwab account password** and confirm 2FA is on (defense in depth).
4. If more than your own account may be affected, jump to §3 (app-wide response).

---

## 2. Scenario playbook

### A. "I think my key/token leaked" or "I lost my device"
- Do §1 (revoke at Schwab → disconnect → rotate password).
- Your creds were never stored on the device (encrypted, server-side only), and
  a 30-minute inactivity logout ends unattended sessions. Nothing to wipe locally
  beyond a normal logout, which also clears local app state.

### B. Database breach (someone obtains Firestore data)
- What they got: **ciphertext**. Without `SCHWAB_ENC_KEY` (Secret Manager,
  IAM-protected) they cannot decrypt.
- Response:
  1. **Rotate the encryption key** (see §4). This alone makes all stored
     Schwab secrets undecryptable — a fast global kill switch for broker data.
  2. Ask users to **reconnect** Schwab (re-enter key/secret, re-encrypted under
     the new key).
  3. Advise users to **regenerate their App Secret at Schwab** to be safe.
  4. Review Firebase/GCP audit logs for the access path; close it.

### C. A code bug exposes data (e.g., a rules or scoping regression)
1. **Roll back immediately:** `bash scripts/rollback.sh` (hosting reverts in ~10s).
   For functions: `git checkout <good-commit> -- functions/ && firebase deploy --only functions`.
2. Confirm the exposure is closed (re-run the isolation checks in §5).
3. Hotfix forward; add a test that would have caught it.

### D. Suspected abuse / unusual access on the functions
- **Global broker kill switch:** rotate `SCHWAB_ENC_KEY` (§4) — every Schwab call
  fails closed instantly (decryption fails), stopping all broker data access
  while you investigate. Market-data (Yahoo) and the rest of the app keep working.
- Investigate in Firebase Console → Functions logs and Firestore usage.

---

## 3. App-wide response (multiple users possibly affected)

1. Rotate `SCHWAB_ENC_KEY` (§4) — stops all broker-secret decryption.
2. If the hosting/frontend is implicated, `bash scripts/rollback.sh`.
3. Notify affected users: what happened, that the app is read-only (no trading
   possible), and to **regenerate their Schwab App Secret** + reconnect.
4. Preserve logs (Firebase Console → Functions, Firestore, Auth) before they age
   out; capture the timeline.
5. File the post-incident note in this repo (date, cause, fix, prevention).

---

## 4. Rotate the encryption key (`SCHWAB_ENC_KEY`)

Ciphertext is versioned (`v1:…`), so rotation is safe to introduce.

```bash
# 1. New 32-byte key → new Secret Manager version
openssl rand -base64 32 | firebase functions:secrets:set SCHWAB_ENC_KEY --data-file - --project covered-calls-prod

# 2. Redeploy the functions so they pick up the new version
firebase deploy --only "functions:schwabInitiateOAuth,functions:schwabExchangeToken,functions:schwabRefreshToken,functions:schwabDisconnect,functions:schwabGetPositions,functions:schwabGetBuyingPower,functions:schwabGetQuotes,functions:schwabGetOptionChain" --project covered-calls-prod
```

- Effect: secrets encrypted under the **old** key can no longer be decrypted →
  Schwab calls fail closed until users **reconnect** (which re-encrypts under the
  new key). This is intentional and is the containment lever.
- For zero-downtime rotation (decrypt-old / re-encrypt-new migration), add a `v2`
  scheme in `functions/crypto.js` — not required for incident containment.

---

## 5. Verify isolation is intact (run after any incident or deploy)

Unauthenticated probes (should all deny):
```bash
FN=https://us-central1-covered-calls-prod.cloudfunctions.net
FS='https://firestore.googleapis.com/v1/projects/covered-calls-prod/databases/(default)/documents'
curl -s -o /dev/null -w "schwabInitiateOAuth unauth → %{http_code}\n" -X POST "$FN/schwabInitiateOAuth" -H 'Content-Type: application/json' -d '{"data":{}}'   # expect 401
curl -s -o /dev/null -w "private secret path → %{http_code}\n" "$FS/users/anyuid/private/schwabSecret"                                                          # expect 403
for c in positions lots closed brokerConnections; do curl -s -o /dev/null -w "$c → %{http_code}\n" "$FS/users/anyuid/$c/x"; done                                # expect 403
```
For authed cross-user checks, use the two-user emulator test pattern (create A + B, populate A, attack from B → all 403).

---

## 6. Detection (where to look)

- **Firebase Console → Functions → Logs** — errors, unusual call volume.
- **Firestore → Usage** — spikes in reads.
- **Authentication → Users** — unexpected sign-ups / sign-in patterns.
- **Provider status** — the app writes `marketData/meta_providerStatus`.
- Consider adding log-based alerts (error-rate spike) as a follow-up.

---

## 7. Owners & contacts

_Fill in for your team:_
- Incident owner: __________
- Firebase/GCP admin: __________
- Schwab developer account holder: __________
- Where post-incident notes live: `docs/` (this repo) / __________
