#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# deploy.sh — Build, version, and deploy to Firebase Hosting
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   bash scripts/deploy.sh
#
# What it does:
#   1. Reads the current version from docs/CHANGELOG.md
#   2. Builds the production bundle (npm run build)
#   3. Deploys to Firebase Hosting live channel
#   4. Tags the release with the version number
#   5. Logs the deployment to deployments.log
#
# Prerequisites:
#   - Firebase CLI installed and logged in
#   - CHANGELOG.md has a version in format [X.Y.Z]
#   - App builds successfully
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  COVERED CALLS MANAGER — PRODUCTION DEPLOY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Extract version from CHANGELOG ──
VERSION=$(grep -oP '## \[\K[0-9]+\.[0-9]+\.[0-9]+' docs/CHANGELOG.md | head -1)

if [ -z "$VERSION" ]; then
  echo -e "${RED}✗ Could not find version in docs/CHANGELOG.md${NC}"
  echo "  Make sure CHANGELOG has an entry like: ## [1.0.0] — 2026-02-27"
  exit 1
fi

echo -e "  Version:  ${GREEN}v${VERSION}${NC}"

# ── Step 2: Check for uncommitted changes ──
if command -v git &> /dev/null && git rev-parse --git-dir &> /dev/null; then
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}⚠ You have uncommitted changes.${NC}"
    read -p "  Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${RED}  Aborted.${NC}"
      exit 1
    fi
  fi
  GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")
else
  GIT_HASH="no-git"
fi

echo -e "  Git:      ${CYAN}${GIT_HASH}${NC}"

# ── Step 3: Confirm ──
echo ""
echo -e "${YELLOW}  This will deploy v${VERSION} to PRODUCTION.${NC}"
echo -e "${YELLOW}  All users will see this version on next page load.${NC}"
echo ""
read -p "  Deploy v${VERSION} to production? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}  Aborted.${NC}"
  exit 1
fi

# ── Step 4: Build ──
echo ""
echo -e "${CYAN}► Building production bundle...${NC}"
npm run build

if [ ! -d "dist" ]; then
  echo -e "${RED}✗ Build failed — no dist/ directory found${NC}"
  exit 1
fi

BUILD_SIZE=$(du -sh dist | cut -f1)
echo -e "  Build size: ${GREEN}${BUILD_SIZE}${NC}"

# ── Step 5: Deploy to Firebase Hosting ──
echo ""
echo -e "${CYAN}► Deploying to Firebase Hosting...${NC}"

# Deploy with a version message
firebase deploy --only hosting --message "v${VERSION} (${GIT_HASH})"

# ── Step 6: Log the deployment ──
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOYER=$(git config user.email 2>/dev/null || whoami)

echo "${TIMESTAMP} | v${VERSION} | ${DEPLOYER} | ${GIT_HASH} | ${BUILD_SIZE}" >> deployments.log

# ── Step 7: Git tag (if git is available) ──
if command -v git &> /dev/null && git rev-parse --git-dir &> /dev/null; then
  git tag -a "v${VERSION}" -m "Release v${VERSION}" 2>/dev/null || true
  echo -e "  Git tag:  ${GREEN}v${VERSION}${NC}"
fi

# ── Done ──
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ v${VERSION} deployed to production${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  To rollback: ${CYAN}bash scripts/rollback.sh${NC}"
echo ""
