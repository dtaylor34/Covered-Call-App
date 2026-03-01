#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# preview.sh — Deploy to a Firebase preview channel for testing
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   bash scripts/preview.sh              # Auto-generated channel name
#   bash scripts/preview.sh my-feature   # Custom channel name
#
# What it does:
#   1. Builds the production bundle
#   2. Deploys to a temporary Firebase preview channel
#   3. Outputs a URL you can share and test
#   4. Preview auto-expires after 7 days
#
# IMPORTANT:
#   Preview channels use the REAL Firebase project (not emulators).
#   Auth, Firestore, and Functions all point to production.
#   Be careful with admin actions — they affect real data.
# ═══════════════════════════════════════════════════════════════════════════════

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Channel name (auto-generate or use argument)
if [ -n "$1" ]; then
  CHANNEL="$1"
else
  CHANNEL="preview-$(date +%Y%m%d-%H%M%S)"
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  COVERED CALLS MANAGER — PREVIEW DEPLOY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Channel: ${GREEN}${CHANNEL}${NC}"
echo -e "  Expires: 7 days"
echo ""

# ── Build ──
echo -e "${CYAN}► Building production bundle...${NC}"
npm run build

BUILD_SIZE=$(du -sh dist | cut -f1)
echo -e "  Build size: ${GREEN}${BUILD_SIZE}${NC}"
echo ""

# ── Deploy to preview channel ──
echo -e "${CYAN}► Deploying to preview channel...${NC}"
firebase hosting:channel:deploy "${CHANNEL}" --expires 7d

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Preview deployed${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}⚠ This preview uses REAL Firebase (not emulators).${NC}"
echo -e "  ${YELLOW}  Admin actions will affect production data.${NC}"
echo ""
echo -e "  When ready to go live: ${CYAN}bash scripts/deploy.sh${NC}"
echo ""
