// --- src/hooks/useFeatureAccess.js -------------------------------------------
// Tier-based feature gating. Reads user's plan from AuthContext and provides
// canAccess(feature) checks. Locked features show blurred preview + upgrade.
//
// Plans: "basic" (default/trial), "advanced", "expert", "family" (FAMILY34)
// Family code holders get expert-level access.
// -----------------------------------------------------------------------------

import { useAuth } from "../contexts/AuthContext";

// -- Feature -> minimum tier mapping --
const FEATURE_TIERS = {
  // Basic (default view — everyone)
  dashboard: "basic",
  selection: "basic",
  working: "basic",
  glossary: "basic",
  profile: "basic",
  searchHistory: "basic",

  // Advanced
  risk: "advanced",
  transactions: "advanced",
  unlimitedHistory: "advanced",

  // Expert
  setup: "expert",
  customThemes: "basic",
  brokerGuides: "expert",
};

// -- Tier hierarchy (higher index = more access) --
const TIER_LEVELS = {
  basic: 0,
  advanced: 1,
  expert: 2,
};

// -- Tier display info --
export const TIER_INFO = {
  basic: {
    label: "Basic",
    color: "#00d4aa",
    bg: "rgba(0,212,170,0.12)",
    icon: "\u{25C6}",
    features: ["Dashboard", "Working P&L Tab", "Glossary", "Profile", "Search History (10)"],
  },
  advanced: {
    label: "Advanced",
    color: "#818cf8",
    bg: "rgba(129,140,248,0.12)",
    icon: "\u{25C6}",
    features: ["Everything in Basic", "Risk Scenarios", "Transaction Log", "Unlimited Search History"],
  },
  expert: {
    label: "Expert",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    icon: "\u{25C6}",
    features: ["Everything in Advanced", "Broker Setup Guides", "Custom Themes", "Priority Support"],
  },
};

// -- Get the minimum tier required for a feature --
export function getRequiredTier(feature) {
  return FEATURE_TIERS[feature] || "basic";
}

// -- Check if a tier level can access a feature --
export function tierCanAccess(plan, feature) {
  const requiredTier = getRequiredTier(feature);
  const userLevel = TIER_LEVELS[plan] ?? 0;
  const requiredLevel = TIER_LEVELS[requiredTier] ?? 0;
  return userLevel >= requiredLevel;
}

// -- Hook --
export function useFeatureAccess() {
  const { userData, hasFreeAccessCode } = useAuth();

  // Family code holders get expert access
  const effectivePlan = hasFreeAccessCode
    ? "expert"
    : (userData?.plan || "basic");

  const canAccess = (feature) => tierCanAccess(effectivePlan, feature);

  const getUpgradeTier = (feature) => {
    const required = getRequiredTier(feature);
    return TIER_INFO[required] || TIER_INFO.advanced;
  };

  return {
    plan: effectivePlan,
    canAccess,
    getUpgradeTier,
    getRequiredTier,
    isBasic: effectivePlan === "basic",
    isAdvanced: effectivePlan === "advanced",
    isExpert: effectivePlan === "expert",
  };
}
