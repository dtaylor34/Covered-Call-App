# Deployment Strategy — Covered Calls Manager

> **Cursor:** Read this before suggesting any deployment commands.
> Never use raw `firebase deploy`. Always use the scripts below.

---

## How Updates Reach Users

This is a **web application** hosted on Firebase Hosting. Updates work like this:

```
You make a code change
       ↓
Build the app (npm run build)
       ↓
Deploy to Firebase Hosting
       ↓
Firebase replaces the hosted files instantly
       ↓
Every user gets the new version on their next page load
       ↓
No app store review. No download. No update button.
       ↓
If something breaks → rollback in under 60 seconds
```

Firebase Hosting serves your app as static files from a global CDN. When you
deploy, the CDN updates everywhere within seconds. Users don't need to do
anything — the next time they load the page or refresh, they get the new code.

Their **data is not affected** by deployments. Firestore data (users, audit logs,
subscriptions) lives separately from the frontend code. A code deploy only
changes the UI/logic that runs in the browser.

---

## The Three-Step Release Process

Every change follows this flow. No exceptions.

### Step 1: Test Locally (Required)

```bash
# Terminal 1 — Firebase Emulators
firebase emulators:start

# Terminal 2 — Vite Dev Server
npm run dev

# Or both at once:
npm run dev:full
```

Verify:
- [ ] The change works as expected
- [ ] Existing features still work (auth, trial, admin panel)
- [ ] No console errors
- [ ] Emulator UI (localhost:4000) shows correct Firestore data

### Step 2: Preview Channel (Required for MINOR and MAJOR)

A preview channel creates a temporary URL where you can see the production
build without affecting real users.

```bash
bash scripts/preview.sh
```

This:
1. Runs `npm run build` (creates production bundle)
2. Deploys to a Firebase preview channel (not the live site)
3. Outputs a temporary URL like: `https://your-project--preview-abc123.web.app`
4. Preview channels auto-expire after 7 days

Verify at the preview URL:
- [ ] App loads correctly
- [ ] Auth works (this hits the REAL Firebase, not emulators)
- [ ] Admin panel works
- [ ] No broken routes or missing assets

> **For PATCH releases** (small bug fixes, typos), you can skip preview
> and go straight to deploy — but only if you tested locally.

### Step 3: Deploy to Production

```bash
bash scripts/deploy.sh
```

This:
1. Reads the current version from `docs/CHANGELOG.md`
2. Runs `npm run build`
3. Deploys to Firebase Hosting live channel
4. Tags the release with the version number (e.g., `v1.0.0`)
5. Records the deployment in `deployments.log`
6. The old version is preserved — you can rollback to it anytime

After deploying:
- [ ] Visit the production URL and verify
- [ ] Check that auth and admin still work
- [ ] The previous version is saved and can be restored

---

## Rollback

If a deploy breaks something, roll back immediately:

### Rollback to Previous Version
```bash
bash scripts/rollback.sh
```
This restores the version that was live right before your latest deploy.

### Rollback to a Specific Version
```bash
bash scripts/rollback.sh v1.0.0
```
This restores the exact build from version 1.0.0.

### How Rollback Works
Firebase Hosting stores every deployment as a named "version". The rollback
script uses `firebase hosting:clone` to copy a previous version's files back
to the live channel. It happens in seconds.

```
Current live: v1.2.0 (has a bug)
       ↓
Run: bash scripts/rollback.sh v1.1.0
       ↓
Firebase copies v1.1.0's files to the live channel
       ↓
All users now see v1.1.0 on next page load
       ↓
Total time: ~10 seconds
```

### What Rollback Does NOT Undo
- **Firestore data changes** — if you added new fields to user documents in
  the broken version, those fields stay. This is fine because we only ADD
  fields (never rename or remove). The old code simply ignores fields it
  doesn't know about.
- **Cloud Function changes** — functions are deployed separately. Roll those
  back with `firebase deploy --only functions` using the old function code.

---

## Version Numbering

We use [Semantic Versioning](https://semver.org/):

```
v MAJOR . MINOR . PATCH
  1     . 2     . 3
```

| Type  | When to Use | Example |
|-------|-------------|---------|
| PATCH | Bug fix, typo, style tweak | v1.0.0 → v1.0.1 |
| MINOR | New feature, new component | v1.0.1 → v1.1.0 |
| MAJOR | Breaking change, schema migration | v1.1.0 → v2.0.0 |

### Rules
- Every deploy gets a version number
- The version is recorded in `docs/CHANGELOG.md` BEFORE deploying
- The deploy script reads the version from CHANGELOG and uses it as the tag
- Never deploy without incrementing the version

---

## Deployment Log

Every deploy is recorded in `deployments.log` at the project root:

```
2026-02-27T14:30:00Z | v1.0.0 | darrell | Initial release
2026-02-28T10:15:00Z | v1.0.1 | darrell | Fixed trial banner color
2026-03-01T09:00:00Z | v1.1.0 | darrell | Added covered calls dashboard
```

This is a local file. It helps you remember what was deployed when, without
having to read the full changelog every time.

---

## Environment Matrix

| Environment | Firebase Auth   | Firestore       | Hosting                    | Purpose          |
|-------------|-----------------|-----------------|----------------------------|------------------|
| Local       | Emulator :9099  | Emulator :8080  | localhost:3000 (Vite)      | Development      |
| Preview     | Production      | Production      | preview-{id}.web.app       | Pre-deploy check |
| Production  | Production      | Production      | your-domain.com            | Live users       |

**Important:** Preview channels hit the REAL Firebase project (not emulators).
This means preview tests use real user data. Be careful with admin actions
in preview — they affect the same Firestore as production.

---

## Firebase Hosting Configuration

The `firebase.json` hosting section should include:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "index.html",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      }
    ]
  }
}
```

Key settings:
- **`rewrites`** — all routes serve index.html (SPA behavior for React Router)
- **JS/CSS caching** — immutable with long max-age (Vite adds hashes to filenames)
- **index.html no-cache** — ensures users always get the latest version on reload
  (the HTML loads the latest hashed JS/CSS files)

This is what makes instant updates work. The HTML file is never cached, so the
browser always fetches the newest version. The JS/CSS files have content hashes
in their filenames, so new deploys get new filenames and old cached files don't
interfere.

---

## Cloud Functions Deployment

Cloud Functions are deployed separately from the frontend:

```bash
# Deploy only functions
cd functions
npm run deploy
# or
firebase deploy --only functions
```

Functions have their own versioning in `functions/package.json`. When updating
functions, note it in the CHANGELOG under the frontend version that depends on it.

### Function Rollback
Firebase doesn't version functions the same way as hosting. To rollback:
1. Use `git log` to find the previous function code
2. `git checkout <commit> -- functions/`
3. `firebase deploy --only functions`

This is why we use Git — it's the versioning system for Cloud Functions.

---

## Checklist: Before Every Deploy

- [ ] Code tested locally with emulators
- [ ] CHANGELOG.md updated with new version and description
- [ ] PRD.md updated if requirements changed
- [ ] No hardcoded colors (use theme.js)
- [ ] No API keys in frontend code
- [ ] No Firestore field renames or removals
- [ ] Preview channel tested (for MINOR/MAJOR)
- [ ] Git committed with descriptive message
- [ ] Deploy script used (not raw `firebase deploy`)
