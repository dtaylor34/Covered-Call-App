# v1.1.0 Update — Mobile Layout, OAuth, FAMILY34, Trial Messaging

## Files Changed (4 files)

Replace these files in your project:

```
firebase.js      → src/firebase.js
AuthContext.jsx   → src/contexts/AuthContext.jsx
AuthScreen.jsx    → src/views/AuthScreen.jsx
PaywallScreen.jsx → src/views/PaywallScreen.jsx
```

## What Changed

### 1. Mobile-Responsive Auth Screen
- Left branding / right form stacks vertically on screens < 768px
- Feature list hides on mobile to save space
- Compact trial badge shown on mobile instead
- All inputs and buttons properly sized for touch

### 2. Google & Apple Sign-In
- "Continue with Google" and "Continue with Apple" buttons
- Auto-creates Firestore user doc on first OAuth sign-in
- Returning OAuth users go straight to dashboard
- New OAuth users go through onboarding

### 3. FAMILY34 Promo Code
- Users who enter FAMILY34 during onboarding get permanent free access
- No trial expiration, no paywall — full access forever
- Checked client-side in AuthContext (FREE_ACCESS_CODES array)
- To add more codes, edit the array in AuthContext.jsx

### 4. Smart Paywall Messaging
- Shows trial days remaining with visual progress bar
- 3 messaging states:
  - Active trial (5+ days): "X Days Left in Your Trial"
  - Almost expired (1-2 days): "Only X Days Left!" with urgent styling
  - Expired: "Your Free Trial Has Ended"
- "Continue Free Trial" button when trial is still active
- Users can visit /upgrade during trial to subscribe early

## Firebase Console Setup Required

### Enable Google Sign-In
1. Firebase Console → Authentication → Sign-in method
2. Click "Google" → Enable → Save

### Enable Apple Sign-In
1. Firebase Console → Authentication → Sign-in method
2. Click "Apple" → Enable → Save
3. Requires Apple Developer account ($99/yr)
4. Follow: https://firebase.google.com/docs/auth/web/apple

Note: Apple Sign-In can be skipped initially. The button will show
an error if Apple isn't configured — Google is easier to set up first.

## Deploy

```bash
git checkout -b feature/v1.1-mobile-oauth
# Replace the 4 files
npm run build
npm run dev  # test locally first
git add .
git commit -m "v1.1 — mobile layout, Google/Apple auth, FAMILY34, trial messaging"
git checkout main
git merge feature/v1.1-mobile-oauth
npm run build
firebase deploy --only hosting
git tag -a v1.1.0 -m "Mobile layout, OAuth, FAMILY34 promo, smart paywall"
git push origin main --tags
```
