# Cursor IDE Workflow — How to Make Updates

> This document explains how Cursor is configured to work with this project,
> how to make changes safely, and how those changes reach your users.

---

## How Cursor Is Locked to the PRD

The file `.cursorrules` in the project root is read by Cursor **automatically**
on every interaction — every prompt, every code suggestion, every edit.

It forces Cursor to:
1. **Read `docs/PRD.md`** before making any code change
2. **Read `docs/CHANGELOG.md`** to know the current version
3. **Read `docs/DEPLOYMENT.md`** to follow the release process
4. **Read `docs/DATA_LAYER.md`** before touching any market data, options, or provider code
5. **Follow the code change protocol** (version bump, changelog entry, schema check)
6. **Never violate architecture rules** (file responsibilities, schema discipline, security)

You don't need to remind it. The rules are injected into every Cursor session.

### What Happens When You Ask Cursor to Make a Change

```
You: "Add a search bar to the admin user list"
       ↓
Cursor reads .cursorrules
       ↓
Cursor reads docs/PRD.md → finds Section 4.5 (Admin Panel)
       ↓
Cursor reads docs/CHANGELOG.md → sees current version is 1.0.0
       ↓
Cursor writes the code change
       ↓
Cursor provides:
  - Which PRD section it relates to
  - Version bump recommendation (1.0.0 → 1.0.1 PATCH)
  - The code diff
  - A ready-to-paste CHANGELOG entry
  - Deploy instructions
```

---

## Making an Update: Step by Step

### 1. Tell Cursor What You Want

Open Cursor and describe the change in plain English:

> "Add a search bar to the admin users table that filters by email and name"

Cursor will:
- Check the PRD to understand the admin panel architecture
- Check the changelog to know the current version
- Write the code change
- Suggest a version bump
- Give you a changelog entry

### 2. Review the Change

Cursor shows you the code diff. Check:
- Does it follow the theme (uses `T` tokens from theme.js)?
- Does it work with the existing AuthContext?
- Does it add any Firestore schema changes?
- Does it look correct?

### 3. Test Locally

```bash
# Terminal 1
firebase emulators:start

# Terminal 2
npm run dev
```

Go to localhost:3000, sign in, navigate to /admin, verify the change works.

### 4. Update the Changelog

Add an entry to `docs/CHANGELOG.md`:

```markdown
## [1.0.1] — 2026-02-28

### Added
- Search bar in admin Users view (filters by email and name)

### Deploy Notes
- No schema changes
- PATCH release
```

### 5. Deploy

```bash
# Option A: Preview first (recommended for new features)
bash scripts/preview.sh
# → Test at the preview URL
# → Then:
bash scripts/deploy.sh

# Option B: Direct deploy (for small patches)
bash scripts/deploy.sh
```

### 6. Verify

Visit your production URL. The change is live. All users see it on their next page load.

---

## Common Update Scenarios

### "Fix a bug"
```
Tell Cursor → it writes the fix → test locally → deploy.sh
Version: PATCH (1.0.0 → 1.0.1)
```

### "Add a new feature"
```
Tell Cursor → it writes the feature → test locally → preview.sh → verify → deploy.sh
Version: MINOR (1.0.1 → 1.1.0)
Update PRD.md if it's a significant feature.
```

### "Change the design / rebrand"
```
Tell Cursor → it updates theme.js + components → test locally → preview.sh → deploy.sh
Version: MINOR (1.1.0 → 1.2.0)
```

### "Update the Firestore schema"
```
Tell Cursor → it checks PRD Section 5 → only ADDS new fields (never renames/removes)
→ Updates PRD.md with new fields → writes migration script if needed → test → deploy
Version: MINOR or MAJOR depending on scope
```

### "Something broke in production"
```
bash scripts/rollback.sh
→ Previous version restored in seconds
→ Debug the issue locally
→ Fix it → test → redeploy
```

---

## Updating the PRD Itself

The PRD is a living document. When requirements change:

1. **Tell Cursor** what's changing:
   > "We're adding an annual subscription option at $89.99/year. Update the PRD."

2. **Cursor updates PRD.md** — adds the new requirement, updates the data model
   if needed, updates the roadmap.

3. **Then implement** — with the PRD updated, Cursor will write code that's
   consistent with the new requirement.

**Always update the PRD before implementing.** The PRD is the source of truth.
If the PRD says one thing and the code says another, the PRD wins.

---

## Branching Strategy (Optional but Recommended)

For features that take multiple sessions:

```bash
# Create a feature branch
git checkout -b feature/annual-plan

# Make changes with Cursor across multiple sessions
# Cursor always reads the PRD, so it stays consistent

# When ready, merge and deploy
git checkout main
git merge feature/annual-plan
bash scripts/deploy.sh
```

For quick patches, working directly on `main` is fine.

---

## What Users Experience

```
Timeline:
  Monday    → You deploy v1.1.0 (new feature)
  Tuesday   → User opens app → sees v1.1.0 automatically
  Wednesday → You find a bug → rollback to v1.0.1
  Wednesday → User refreshes → sees v1.0.1 (bug gone)
  Thursday  → You fix the bug → deploy v1.1.1
  Thursday  → User refreshes → sees v1.1.1 (fixed version)
```

Users never:
- Download an update
- Click an "update" button
- Wait for app store approval
- See a "new version available" popup

They just use the app, and it's always the latest version.

---

## File Map: What Lives Where

```
Project Root
├── .cursorrules          ← Cursor reads this on every interaction
├── .cursor/              ← Cursor workspace config
├── firebase.json         ← Hosting config (cache headers, rewrites)
├── firestore.rules       ← Security rules (role enforcement)
├── deployments.log       ← Auto-generated deployment history
│
├── docs/
│   ├── PRD.md            ← Product requirements (source of truth)
│   ├── CHANGELOG.md      ← Version history (Cursor checks this)
│   ├── DEPLOYMENT.md     ← Release process (Cursor follows this)
│   └── CURSOR_WORKFLOW.md ← This file (your reference)
│
├── scripts/
│   ├── deploy.sh         ← Build + version + deploy to production
│   ├── rollback.sh       ← Restore previous version instantly
│   └── preview.sh        ← Deploy to temp preview URL for testing
│
└── src/                  ← Application code (managed by Cursor)
```
