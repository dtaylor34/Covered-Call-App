# Branching & Prototyping Workflow

## The Problem

You want to:
- Keep `main` stable and deployable at all times
- Work on bug fixes and small updates to `main` without interruption
- Simultaneously develop experimental features that may take weeks
- Keep experiments aligned with `main` so they don't fall behind
- Merge experiments into `main` cleanly when they're ready

---

## Branch Types

| Branch | Purpose | Lifetime | Example |
|--------|---------|----------|---------|
| `main` | Production. Always deployable. | Permanent | — |
| `fix/*` | Bug fixes, small tweaks | Hours to days | `fix/mobile-overflow` |
| `feature/*` | New functionality | Days to weeks | `feature/backtesting` |
| `prototype/*` | Experimental concepts | Weeks to months | `prototype/ai-recommendations` |

---

## Day-to-Day: Quick Fixes to Main

For small changes (bug fix, style tweak, copy change):

```bash
git checkout main
git pull origin main
git checkout -b fix/search-bar-padding

# Make your fix
git add .
git commit -m "Fix search bar padding on mobile"

# Merge and deploy
git checkout main
git merge fix/search-bar-padding
npm run build && firebase deploy --only hosting

# Tag if it's significant
git tag -a v1.0.1 -m "Fix search bar padding"
git push origin main --tags

# Clean up
git branch -d fix/search-bar-padding
```

---

## Long-Running Features

For features that take days or weeks:

### Start the Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/backtesting
```

### Work on It

Commit as often as you want. This branch is yours — it doesn't affect anyone:

```bash
git add .
git commit -m "Add backtesting engine skeleton"

# ... next day ...
git add .
git commit -m "Wire up historical data fetching"

# ... next day ...
git add .
git commit -m "Build backtesting results chart"
```

### Keep It Aligned with Main

This is the critical part. While you're building your feature, you're also
pushing fixes to `main`. Your feature branch falls behind. To sync it:

```bash
# From your feature branch
git checkout feature/backtesting

# Pull latest main into your branch
git merge main
```

Do this at least **once a week**, or whenever you push something significant
to `main`. This prevents painful merge conflicts later.

If there are conflicts, Git will tell you which files. Open them, resolve
the conflicts (keep both changes where possible), then:

```bash
git add .
git commit -m "Merge main into feature/backtesting"
```

### When It's Ready

```bash
# Final sync with main
git checkout feature/backtesting
git merge main

# Test everything works
npm run dev
# ... verify locally ...

# Merge to main
git checkout main
git merge feature/backtesting

# Deploy
npm run build && firebase deploy --only hosting

# Tag
git tag -a v1.2.0 -m "Add backtesting panel"
git push origin main --tags

# Clean up
git branch -d feature/backtesting
```

---

## Prototypes (Experimental / Long-Term)

For concepts you're exploring that might take weeks or months, and might
never ship. Same workflow as features, but with extra discipline.

### Start the Prototype

```bash
git checkout main
git pull origin main
git checkout -b prototype/ai-recommendations
```

### Keep a Prototype Journal

Add a file to track what you're exploring. This helps you (and Claude)
pick up where you left off:

```bash
# Create at the root of your prototype branch
touch PROTOTYPE_NOTES.md
```

Example content:

```markdown
# Prototype: AI Recommendations

## Goal
Use Claude API to analyze covered call positions and suggest optimal strategies.

## Status
- [x] Basic API integration
- [x] Prompt engineering for options analysis
- [ ] Response parsing and display
- [ ] User feedback loop

## Decisions Made
- Using Claude Sonnet for speed, Opus for deep analysis
- Caching recommendations for 1 hour
- Showing confidence scores alongside suggestions

## Open Questions
- How to handle rate limits?
- Should this be a Cloud Function or client-side?
```

### Sync with Main Regularly

```bash
# Every week or after any main deploy
git merge main
```

### If You Abandon It

That's fine. The branch stays in Git history forever. You can revisit it:

```bash
# See all branches including old ones
git branch -a

# Jump back to an old prototype
git checkout prototype/ai-recommendations
```

### If You Want to Ship It

Same as feature merge — sync with main, test, merge, tag, deploy.

---

## Visual Overview

```
main          ●───●───●───●───●───●───●───●───●
               \       ↑       \       ↑
fix/mobile      ●───●──┘        \      │
                                 \     │
feature/backtesting               ●──●──●──●──┘
                                       ↑
                              (merge main in periodically)
```

The arrows pointing up (↑) are merges back to `main`.
The arrows pointing down are syncing `main` into your branch.

---

## Commands Cheat Sheet

```bash
# ── Branching ──
git checkout -b feature/name          # Create and switch to new branch
git checkout main                      # Switch back to main
git branch                             # List local branches
git branch -d feature/name             # Delete merged branch
git branch -D feature/name             # Force delete unmerged branch

# ── Syncing ──
git pull origin main                   # Update local main from GitHub
git merge main                         # Pull main changes into current branch
git merge feature/name                 # Merge feature into current branch (main)

# ── Checking Status ──
git status                             # What's changed
git log --oneline -10                  # Last 10 commits
git log --oneline --graph --all        # Visual branch history
git diff main                          # What's different from main

# ── Tags ──
git tag                                # List all tags
git tag -a v1.0.0 -m "Description"     # Create annotated tag
git push origin main --tags            # Push commits and tags

# ── Rollback ──
git checkout v1.0.0                    # Go to tagged version
git checkout main                      # Go back to latest

# ── Stashing (save work temporarily) ──
git stash                              # Save uncommitted changes
git stash pop                          # Restore stashed changes
```

---

## Rules

1. **Never commit directly to `main`** — always use a branch
2. **Sync feature/prototype branches with `main` at least weekly**
3. **Test locally before merging to `main`**
4. **Tag every production deploy**
5. **Keep `main` deployable at all times** — if it's broken, rollback immediately
6. **Prototype branches can be messy** — that's fine, clean up before merging
7. **One branch per concept** — don't mix unrelated changes in one branch
