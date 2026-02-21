#!/bin/bash

# PlanFlow Pre-Deployment Check Script
# Run this before deploying to verify environment is ready

set -e

echo "=========================================="
echo "  PlanFlow Pre-Deployment Check"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

check_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
}

check_fail() {
  echo -e "  ${RED}✗${NC} $1"
  ERRORS=$((ERRORS + 1))
}

check_warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

# Check Node.js version
echo "Checking Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    check_pass "Node.js $(node -v)"
  else
    check_fail "Node.js 20+ required, found $(node -v)"
  fi
else
  check_fail "Node.js not found"
fi

# Check pnpm
echo ""
echo "Checking pnpm..."
if command -v pnpm &> /dev/null; then
  check_pass "pnpm $(pnpm -v)"
else
  check_fail "pnpm not found. Install with: npm install -g pnpm"
fi

# Check git status
echo ""
echo "Checking git status..."
if [ -d ".git" ]; then
  if [ -z "$(git status --porcelain)" ]; then
    check_pass "Working directory clean"
  else
    check_warn "Uncommitted changes present"
  fi

  BRANCH=$(git branch --show-current)
  if [ "$BRANCH" = "master" ] || [ "$BRANCH" = "main" ]; then
    check_pass "On $BRANCH branch"
  else
    check_warn "On $BRANCH branch (deploy targets master)"
  fi
else
  check_warn "Not a git repository"
fi

# Check required environment files
echo ""
echo "Checking environment files..."
if [ -f "apps/api/.env" ] || [ -f "apps/api/.env.local" ]; then
  check_pass "API environment file exists"
else
  check_warn "API environment file missing (apps/api/.env)"
fi

if [ -f "apps/web/.env" ] || [ -f "apps/web/.env.local" ]; then
  check_pass "Web environment file exists"
else
  check_warn "Web environment file missing (apps/web/.env)"
fi

# Check build
echo ""
echo "Checking build..."
if pnpm turbo build 2>&1 | tail -5; then
  check_pass "Build successful"
else
  check_fail "Build failed"
fi

# Check typecheck
echo ""
echo "Checking types..."
if pnpm typecheck 2>&1 | tail -3; then
  check_pass "Type check passed"
else
  check_fail "Type check failed"
fi

# Check lint
echo ""
echo "Checking lint..."
if pnpm lint 2>&1 | tail -3; then
  check_pass "Lint passed"
else
  check_warn "Lint warnings present"
fi

# Summary
echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}✗ $ERRORS error(s) found${NC}"
  echo ""
  echo "Please fix the errors above before deploying."
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
  echo ""
  echo "Warnings present, but deployment can proceed."
  echo "Consider addressing warnings for best results."
  exit 0
else
  echo -e "${GREEN}✓ All checks passed!${NC}"
  echo ""
  echo "Ready to deploy. Run:"
  echo "  git push origin master"
  exit 0
fi
