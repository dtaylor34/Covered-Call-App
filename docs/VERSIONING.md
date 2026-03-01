# Versioning & Release Workflow

## Quick Reference

```bash
# Tag current stable release
git tag -a v1.0.0 -m "Description of release"
git push origin main --tags

# Roll back to any version
git checkout v1.0.0
npm run build && firebase deploy --only hosting
```

---

## Semantic Versioning

All releases follow `vMAJOR.MINOR.PATCH`:

| Change Type | Example | When |
|-------------|---------|------|
| **PATCH** `v1.0.1` | Bug fix, typo, style tweak | Nothing new, just fixing |
| **MINOR** `v1.1.0` | New feature, UI improvement | Backward compatible addition |
| **MAJOR** `v2.0.0` | Breaking change, major redesign | Existing behavior changes |

---

## Development Workflow

### 1. Create a Feature Branch

Never work directly on `main`. Always branch:

```bash
git checkout main
git pull origin main
git checkout -b feature/mobile-layout
```

Branch naming conventions:
- `feature/description` — new functionality
- `fix/description` — bug fixes
- `refactor/description` — code cleanup, no behavior change

### 2. Work and Commit

Make changes, commit often with clear messages:

```bash
git add .
git commit -m "Fix dashboard card layout on mobile screens"
```

Good commit messages:
- `Fix search bar overflow on iPhone SE`
- `Add backtesting panel to pro tier`
- `Update Stripe webhook to handle plan upgrades`

### 3. Test Locally

```bash
npm run dev
# Verify everything works at http://localhost:3000
```

### 4. Merge to Main

```bash
git checkout main
git merge feature/mobile-layout
```

If there are merge conflicts, resolve them, then:

```bash
git add .
git commit -m "Merge feature/mobile-layout"
```

### 5. Deploy

```bash
# Frontend changes
npm run build
firebase deploy --only hosting

# Backend (Cloud Functions) changes
firebase deploy --only functions

# Firestore rules changes
firebase deploy --only firestore:rules

# Everything at once
npm run build
firebase deploy
```

### 6. Verify Production

Visit `https://covered-calls-prod.web.app` and test the changes.

### 7. Tag the Release

Only tag after you've confirmed it works in production:

```bash
git tag -a v1.1.0 -m "Mobile layout fixes — responsive dashboard, touch-friendly controls"
git push origin main --tags
```

### 8. Clean Up

```bash
git branch -d feature/mobile-layout
```

---

## Rollback Procedure

If a deploy breaks something:

### Instant Rollback (< 1 minute)

```bash
# See all tagged versions
git tag

# Check out the last stable version
git checkout v1.0.0

# Rebuild and redeploy
npm run build
firebase deploy --only hosting

# Go back to main when ready to fix
git checkout main
```

### Firebase Hosting Rollback (Alternative)

Firebase also keeps deploy history. You can roll back from the console:

1. Go to Firebase Console -> Hosting
2. Click the three dots on a previous deploy
3. Click "Rollback"

### Cloud Functions Rollback

If a functions deploy breaks the backend:

```bash
git checkout v1.0.0
cd functions && npm install && cd ..
firebase deploy --only functions
git checkout main
```

---

## Release History

| Version | Date | Description |
|---------|------|-------------|
| v1.0.0 | 2026-03-01 | Initial production release — auth, dashboard, Stripe payments, analytics, admin panel |
| | | |

---

## Feature Flags (For Future Tiers)

When you're ready to add multiple subscription tiers, use Firestore user fields
to control access — not separate codebases.

### Architecture

Add a `plan` field to the user document in Firestore:

```
User doc:
  subscriptionStatus: "active"
  plan: "pro"                    <- controls feature access
```

### Tier Definitions

Define tiers in a single config file:

```js
// src/config/tiers.js
export const TIERS = {
  free: {
    name: "Free Trial",
    searchesPerDay: 5,
    features: ["basic_recommendations"],
  },
  pro: {
    name: "Pro",
    price: 10,
    searchesPerDay: 50,
    features: ["basic_recommendations", "search_history", "analytics"],
  },
  premium: {
    name: "Premium",
    price: 25,
    searchesPerDay: Infinity,
    features: ["basic_recommendations", "search_history", "analytics", "backtesting", "alerts", "advanced_greeks"],
  },
};

export function hasFeature(plan, feature) {
  return TIERS[plan]?.features.includes(feature) || false;
}
```

### Usage in Components

```jsx
import { hasFeature } from "../config/tiers";
import { useAuth } from "../contexts/AuthContext";

function Dashboard() {
  const { plan } = useAuth();

  return (
    <div>
      {/* Everyone sees basic recommendations */}
      <CoveredCallsDashboard />

      {/* Pro and above */}
      {hasFeature(plan, "search_history") && <SearchHistory />}

      {/* Premium only */}
      {hasFeature(plan, "backtesting") ? (
        <BacktestingPanel />
      ) : (
        <LockedFeature name="Backtesting" requiredPlan="premium" />
      )}
    </div>
  );
}
```

### Stripe Setup for Multiple Tiers

Create separate Prices in Stripe Dashboard:

```
Pro     -> $10/mo -> price_pro_abc123
Premium -> $25/mo -> price_premium_def456
```

Update the checkout function to accept a `priceId` parameter, and update
the webhook to set the `plan` field based on which Price was purchased.

### When to Add Tiers

Don't build this until you have:
- 50+ active users on the single $10/mo plan
- Clear signal that users want features you'd put behind a higher tier
- At least 3 feature ideas that justify a premium price

Start simple. Tier later based on real demand.

---

## Checklist Before Every Deploy

- [ ] Feature branch merged to main
- [ ] Tested locally with `npm run dev`
- [ ] No console errors
- [ ] Mobile responsive (check on phone or dev tools)
- [ ] `git status` is clean
- [ ] Build succeeds: `npm run build`
- [ ] Deploy succeeds: `firebase deploy`
- [ ] Verified on production URL
- [ ] Tagged the release: `git tag -a vX.Y.Z -m "..."`
- [ ] Pushed tags: `git push origin main --tags`
- [ ] Updated release history table above
