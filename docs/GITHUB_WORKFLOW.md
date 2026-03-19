# GitHub Branching Workflow — Solo Dev

**Project:** Covered Calls Manager  
**Repo:** github.com/dtaylor34/Covered-Call-App  
**Last updated:** March 2026

---

## The core mental model

Your local project folder is a **shell**. Whatever branch you are on in Cursor determines which version of the files you see. Switching branches swaps the file contents instantly — no downloading, no copying, no fresh install needed.

```
Covered-Call-App/       ← one folder on your OS
  branch: main          ← switch to this and you see production code
  branch: feature/xyz   ← switch to this and you see feature code
```

Git stores every branch's files internally inside the `.git/` folder. It swaps them in and out when you switch. Nothing is ever lost.

---

## Folder setup — two folders, two Cursor windows

For this project we use **two separate local folders** pointing at the same GitHub repo on different branches. This lets you have both open simultaneously in Cursor without switching.

```
~/dev/
├── Covered-Call-App/         ← Cursor window 1 → always main
└── Covered-Call-App-API/     ← Cursor window 2 → always feature/api-integration
```

Both folders push and pull from the same GitHub repo:
`github.com/dtaylor34/Covered-Call-App`

They just target different branches.

---

## Initial setup

### Cloning the second folder (one-time)

```bash
# Clone the repo into a second folder pointed at the api branch
git clone https://github.com/dtaylor34/Covered-Call-App.git Covered-Call-App-API
cd Covered-Call-App-API
git checkout feature/api-integration

# Install dependencies
npm install
```

You now have two independent local folders. Open each in its own Cursor window.

---

## Branch rules

| Branch | Purpose | Who deploys it | Merges into |
|---|---|---|---|
| `main` | Production — always stable and deployable | Firebase deploy | — |
| `feature/api-integration` | Schwab API integration | Preview channel only | `main` via PR |
| `feature/xyz` | Any future feature | Preview channel only | `main` via PR |

**Never commit directly to main.** All work goes on a feature branch and merges via Pull Request.

---

## Daily workflow

### Working on main

```bash
# In Covered-Call-App/ folder (Cursor window 1)

git checkout main
git pull origin main          # grab any updates first

# make changes in Cursor
# test with npm run dev

git add .
git commit -m "fix: description of what you changed"
git push origin main
```

### Working on the API branch

```bash
# In Covered-Call-App-API/ folder (Cursor window 2)

# Always start by syncing with main — keeps branches from drifting
git pull origin main --rebase

# make changes, drag in new files, edit in Cursor
# test with npm run dev

git add .
git commit -m "feat: description of what you added"
git push origin feature/api-integration
```

### Dragging and dropping files

When you drag new files into the API folder:

1. Confirm the branch first — check the bottom-left corner of Cursor
2. Drag the files in
3. Commit immediately — this is what saves them to the branch

```bash
git add .
git commit -m "feat: add APITab and useBrokerConnection hook"
git push origin feature/api-integration
```

Files added to the API folder only exist on `feature/api-integration`. Main never sees them until you merge.

---

## Keeping the two folders in sync with main

The API folder can drift from main if main gets new commits and the API folder doesn't know about them. Fix this with one command at the start of every API work session:

```bash
# In Covered-Call-App-API/
git pull origin main --rebase
```

This replays your API commits on top of the latest main code. Run it every time you sit down to work on the API folder. It takes 3 seconds and prevents hours of merge conflicts later.

If you get a conflict during rebase:

```bash
# Git pauses and tells you which file has a conflict
# Open that file in Cursor — you'll see conflict markers:
# <<<<<<< HEAD
# (your api version)
# =======
# (main's version)
# >>>>>>> origin/main

# Edit the file to keep the correct version (usually both sets of changes)
# Then:
git add .
git rebase --continue

# Push once resolved
git push origin feature/api-integration --force-with-lease
```

---

## Keeping your branch aligned with main (merge vs rebase)

Use one of these approaches to bring `main`’s latest changes into your feature branch so you don’t drift and hit big merge conflicts later.

### Option 1: Merge main into your branch (recommended)

Brings the latest `main` into your branch without rewriting history. Safe and simple.

```bash
git checkout api-integration
git fetch origin
git merge origin/main
```

Resolve any conflicts if Git reports them, then push:

```bash
git push origin api-integration
```

### Option 2: Rebase your branch onto main

Replays your commits on top of the latest `main` for a linear history. Only use if you’re the only one working on this branch (rebasing rewrites history).

```bash
git checkout api-integration
git fetch origin
git rebase origin/main
```

If there are conflicts, fix them, then:

```bash
git add .
git rebase --continue
git push --force-with-lease origin api-integration
```

### When to do it

- **Regularly:** e.g. once a day or at the start of each work session.
- **Before opening a PR:** run it once more so the PR is up to date with `main`.

### One-liner (merge approach)

```bash
git checkout api-integration && git fetch origin && git merge origin/main
```

---

## Saving work in progress before switching

If you need to context-switch mid-task and your changes aren't ready to commit:

```bash
# Save unfinished work temporarily
git stash

# Do whatever else you need to do
# Come back and restore your work
git stash pop
```

Or just do a `wip` commit — cleaner and easier to track:

```bash
git add .
git commit -m "wip: saving progress on schwab oauth flow"
# Later, clean it up:
git commit --amend -m "feat: complete schwab oauth flow"
```

---

## Testing without touching production

### Level 1 — Local with emulators (daily dev)

Runs a fake local Firestore and Functions. Nothing touches your real Firebase project. Use this while actively building.

```bash
# In either folder
npm run dev:full
# App runs at localhost:3000
# Firestore and Functions are local emulators
```

### Level 2 — Local against real Firebase (integration testing)

Uses your real Firestore. Good for testing actual Schwab OAuth flow end-to-end.

```bash
npm run dev
# App runs at localhost:3000
# Uses real Firebase — your own account data
```

### Level 3 — Firebase preview channel (sharing for review)

Deploys the API branch to a temporary live URL. Isolated from production. Share this URL with anyone reviewing the feature.

```bash
# In Covered-Call-App-API/
npm run build
firebase hosting:channel:deploy api-preview --expires 7d

# Firebase returns a URL like:
# https://covered-calls-manager--api-preview-a1b2c3.web.app

# Share this URL — expires automatically in 7 days
# To remove early:
firebase hosting:channel:delete api-preview
```

### Level 4 — Production (main only)

Only ever deployed from the `main` branch after a PR is merged.

```bash
# In Covered-Call-App/ (main folder only)
npm run build:prod
firebase deploy
```

---

## Sharing for review (Pull Requests)

When a feature branch is ready for someone to look at:

```bash
# Make sure everything is pushed
git push origin feature/api-integration

# Go to github.com/dtaylor34/Covered-Call-App
# Click "Compare & pull request"
# Fill in:
#   Title:       feat: Phase 1 API integration — Schwab connection
#   Description: paste the summary from the proposal doc
#   Reviewers:   add anyone who needs to review
# Click "Create pull request"
```

Share the PR URL. Reviewer sees every file change, can comment line by line. Main is completely untouched until you click Merge.

After the PR is merged:

```bash
# Pull the merged changes into your main folder
cd Covered-Call-App
git pull origin main

# Sync the API folder to the new main baseline
cd ../Covered-Call-App-API
git pull origin main --rebase
```

---

## Commit message format

Keep commit messages consistent so the GitHub history is readable.

```
feat:     new feature or capability
fix:      bug fix
wip:      work in progress, not ready
refactor: restructuring code, no behavior change
docs:     documentation only
chore:    dependency updates, config changes
```

Examples:

```
feat: add Schwab OAuth connection flow
feat: add useBrokerConnection Firestore hook
fix: token refresh failing on page reload
fix: APITab not rendering on mobile
wip: saving progress on account switcher
docs: update API playbook with rate limits
chore: update firebase to v11.3.0
```

---

## Current active branches

| Branch | Folder | Status | Notes |
|---|---|---|---|
| `main` | `Covered-Call-App/` | Production | Stable, deployed |
| `feature/api-integration` | `Covered-Call-App-API/` | In progress | Phase 1 Schwab integration |

---

## Quick reference — commands you use every day

```bash
# Start of API work session
git pull origin main --rebase

# Save and push work
git add .
git commit -m "feat: your description"
git push origin feature/api-integration

# Deploy to preview for review
npm run build
firebase hosting:channel:deploy api-preview --expires 7d

# Check which branch you're on
git branch

# Check what files have changed
git status

# Undo the last commit (keeps your file changes)
git reset HEAD~1

# See recent commit history
git log --oneline -10
```

---

## What lives where

```
Covered-Call-App/                     ← main branch
├── src/
│   ├── views/Dashboard.jsx           ← original, no API tab
│   ├── App.jsx                       ← original routes
│   └── ...all other components
├── functions/index.js                ← original functions only
└── firestore.rules                   ← original rules

Covered-Call-App-API/                 ← feature/api-integration branch
├── src/
│   ├── views/Dashboard.jsx           ← modified: APIs tab added
│   ├── views/SchwabCallback.jsx      ← new
│   ├── App.jsx                       ← modified: callback route added
│   ├── components/APITab.jsx         ← new
│   ├── hooks/useBrokerConnection.js  ← new
│   └── services/schwabApi.js         ← new
├── functions/
│   ├── index.js                      ← modified: schwab exports added
│   └── schwab.js                     ← new
└── firestore.rules                   ← modified: broker collections added
```

---

## Reference docs in this project

| Document | Location | What it covers |
|---|---|---|
| Product requirements | `docs/PRD.md` | Full feature spec |
| Launch checklist | `docs/LAUNCH_CHECKLIST.md` | Setup and deployment |
| API proposal | `docs/API_PROPOSAL.html` | Broker integration architecture |
| API playbook | `docs/API_PLAYBOOK.html` | What the API does for users |
| This document | `docs/GITHUB_WORKFLOW.md` | Branching and dev workflow |
