#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# rollback.sh — Instantly restore a previous Firebase Hosting deployment
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   bash scripts/rollback.sh              # Rolls back to the previous deploy
#   bash scripts/rollback.sh v1.0.0       # Rolls back to a specific git tag
#
# How it works:
#   - Firebase Hosting stores every deployment as a "release"
#   - This script uses `firebase hosting:rollback` to revert to the previous one
#   - For specific versions, it checks out that git tag and redeploys
#   - Total time: ~10-30 seconds
#
# What it DOES roll back:
#   - Frontend code (HTML, JS, CSS served by Firebase Hosting)
#
# What it does NOT roll back:
#   - Firestore data (user docs, audit logs — these are separate)
#   - Cloud Functions (deploy those separately if needed)
# ═══════════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${RED}═══════════════════════════════════════════════════${NC}"
echo -e "${RED}  COVERED CALLS MANAGER — ROLLBACK${NC}"
echo -e "${RED}═══════════════════════════════════════════════════${NC}"
echo ""

TARGET_VERSION=$1

if [ -z "$TARGET_VERSION" ]; then
  # ── Rollback to previous release ──
  echo -e "${YELLOW}  Rolling back to the PREVIOUS deployment.${NC}"
  echo -e "  This restores whatever was live before your last deploy."
  echo ""

  # Show recent deployments for context
  if [ -f "deployments.log" ]; then
    echo -e "  ${CYAN}Recent deployments:${NC}"
    tail -5 deployments.log | while read line; do
      echo "    $line"
    done
    echo ""
  fi

  read -p "  Rollback to previous version? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}  Aborted.${NC}"
    exit 1
  fi

  echo ""
  echo -e "${CYAN}► Rolling back Firebase Hosting...${NC}"

  # Firebase CLI rollback — reverts to previous release
  firebase hosting:rollback --confirm

  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  DEPLOYER=$(git config user.email 2>/dev/null || whoami)
  echo "${TIMESTAMP} | ROLLBACK | ${DEPLOYER} | Reverted to previous release" >> deployments.log

  echo ""
  echo -e "${GREEN}  ✓ Rolled back to previous version${NC}"
  echo -e "  All users will see the old version on next page load."

else
  # ── Rollback to specific version ──
  echo -e "${YELLOW}  Rolling back to specific version: ${TARGET_VERSION}${NC}"
  echo ""

  # Check if git tag exists
  if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ Git not available. Cannot rollback to specific version.${NC}"
    echo "  Use 'bash scripts/rollback.sh' (no argument) to revert to previous."
    exit 1
  fi

  if ! git rev-parse --git-dir &> /dev/null; then
    echo -e "${RED}✗ Not a git repository. Cannot rollback to specific version.${NC}"
    exit 1
  fi

  if ! git tag -l | grep -q "^${TARGET_VERSION}$"; then
    echo -e "${RED}✗ Git tag '${TARGET_VERSION}' not found.${NC}"
    echo ""
    echo "  Available tags:"
    git tag -l --sort=-version:refname | head -10 | while read tag; do
      echo "    $tag"
    done
    exit 1
  fi

  echo -e "  This will:"
  echo -e "    1. Checkout the code at ${CYAN}${TARGET_VERSION}${NC}"
  echo -e "    2. Build it"
  echo -e "    3. Deploy it to production"
  echo -e "    4. Return to your current branch"
  echo ""

  read -p "  Proceed? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}  Aborted.${NC}"
    exit 1
  fi

  # Save current branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  echo -e "${CYAN}► Saving current branch: ${CURRENT_BRANCH}${NC}"

  # Checkout the target version
  echo -e "${CYAN}► Checking out ${TARGET_VERSION}...${NC}"
  git checkout "${TARGET_VERSION}" --quiet

  # Build
  echo -e "${CYAN}► Building ${TARGET_VERSION}...${NC}"
  npm run build

  # Deploy
  echo -e "${CYAN}► Deploying ${TARGET_VERSION} to production...${NC}"
  firebase deploy --only hosting --message "ROLLBACK to ${TARGET_VERSION}"

  # Return to original branch
  echo -e "${CYAN}► Returning to ${CURRENT_BRANCH}...${NC}"
  git checkout "${CURRENT_BRANCH}" --quiet

  # Log it
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  DEPLOYER=$(git config user.email 2>/dev/null || whoami)
  echo "${TIMESTAMP} | ROLLBACK | ${DEPLOYER} | Reverted to ${TARGET_VERSION}" >> deployments.log

  echo ""
  echo -e "${GREEN}  ✓ Rolled back to ${TARGET_VERSION}${NC}"
  echo -e "  You are still on branch: ${CYAN}${CURRENT_BRANCH}${NC}"
  echo -e "  All users will see ${TARGET_VERSION} on next page load."
fi

echo ""
echo -e "  ${CYAN}To redeploy the latest:${NC} bash scripts/deploy.sh"
echo ""
