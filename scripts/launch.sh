#!/bin/bash
# PlanFlow Launch Script
# Execute the final launch checklist for T9.7

echo "=================================================="
echo "   PlanFlow Launch Execution Script"
echo "   Date: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=================================================="
echo ""

# Counters
PASSED=0
FAILED=0
WARNINGS=0

check_status() {
    if [ "$1" = "pass" ]; then
        echo "[PASS] $2"
        PASSED=$((PASSED + 1))
    elif [ "$1" = "warn" ]; then
        echo "[WARN] $2"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "[FAIL] $2"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== Pre-Launch Verification ==="
echo ""

# 1. Check API Health
echo "Checking API health..."
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 https://api.planflow.tools/health 2>/dev/null || echo "000")
if [ "$API_CODE" = "200" ]; then
    check_status "pass" "API is healthy (api.planflow.tools)"
else
    check_status "fail" "API health check failed (HTTP $API_CODE)"
fi

# 2. Check Landing Page
echo "Checking landing page..."
LANDING_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 https://planflow.tools 2>/dev/null || echo "000")
if [ "$LANDING_CODE" = "200" ]; then
    check_status "pass" "Landing page is live (planflow.tools)"
else
    check_status "fail" "Landing page returned HTTP $LANDING_CODE"
fi

# 3. Check required files exist
echo "Checking launch materials..."
if [ -f "PRODUCT_HUNT_SUBMISSION.md" ]; then
    check_status "pass" "Product Hunt submission prepared"
else
    check_status "fail" "PRODUCT_HUNT_SUBMISSION.md missing"
fi

if [ -f "SOCIAL_MEDIA_ANNOUNCEMENTS.md" ]; then
    check_status "pass" "Social media announcements prepared"
else
    check_status "fail" "SOCIAL_MEDIA_ANNOUNCEMENTS.md missing"
fi

if [ -f "DEPLOYMENT.md" ]; then
    check_status "pass" "Deployment documentation ready"
else
    check_status "fail" "DEPLOYMENT.md missing"
fi

# 4. Check Git Status
echo "Checking git status..."
if git diff --quiet HEAD 2>/dev/null; then
    check_status "pass" "Git working directory is clean"
else
    check_status "warn" "Uncommitted changes in git (may be intentional)"
fi

echo ""
echo "=== Verification Summary ==="
echo "Passed: $PASSED"
echo "Warnings: $WARNINGS"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "Some checks failed. Review before launching."
else
    echo "All critical checks passed!"
fi

echo ""
echo "=================================================="
echo "   LAUNCH CHECKLIST"
echo "=================================================="
echo ""
echo "Execute these steps to launch PlanFlow:"
echo ""
echo "1. PRODUCT HUNT SUBMISSION"
echo "   - Go to: https://www.producthunt.com/posts/new"
echo "   - Use content from: PRODUCT_HUNT_SUBMISSION.md"
echo "   - Best time: Tuesday/Wednesday at 12:01 AM PST"
echo "   - Post maker comment immediately after launch"
echo ""
echo "2. SOCIAL MEDIA (Launch Day)"
echo "   - Twitter/X: Post launch thread (9 tweets)"
echo "   - LinkedIn: Main announcement"
echo "   - See: SOCIAL_MEDIA_ANNOUNCEMENTS.md"
echo ""
echo "3. EMAIL BETA USERS"
echo "   - Send launch announcement email"
echo "   - Ask for Product Hunt support"
echo ""
echo "4. COMMUNITY POSTS"
echo "   - Reddit: r/SideProject, r/webdev, r/startups"
echo "   - Discord/Slack communities"
echo "   - Indie Hackers"
echo ""
echo "5. MONITOR"
echo "   - Watch Product Hunt comments & respond"
echo "   - Monitor Sentry for errors"
echo "   - Check PostHog for traffic"
echo ""
echo "=================================================="
echo "   Ready to launch! Good luck!"
echo "=================================================="
