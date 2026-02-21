# PlanFlow Launch Checklist

> **Status:** Ready to Launch
> **Date:** 2026-02-21
> **Task:** T9.7 - Launch!

---

## Pre-Launch Verification (Completed)

- [x] API is healthy (api.planflow.tools)
- [x] Landing page is live (planflow.tools)
- [x] Product Hunt submission prepared
- [x] Social media announcements prepared
- [x] Deployment documentation ready
- [x] Sentry monitoring configured (T9.3)
- [x] PostHog analytics ready (T9.4)

---

## Launch Day Execution

### Phase 1: Product Hunt (12:01 AM PST)

- [ ] **Submit to Product Hunt**
  - URL: https://www.producthunt.com/posts/new
  - Use content from: `PRODUCT_HUNT_SUBMISSION.md`

- [ ] **Product Hunt Details:**
  - Name: `PlanFlow`
  - Tagline: `AI-native project management for Claude Code developers`
  - Description: See PRODUCT_HUNT_SUBMISSION.md
  - Categories: Developer Tools, Productivity, Task Management, AI, SaaS

- [ ] **Immediately after posting:**
  - Post maker's first comment (see PRODUCT_HUNT_SUBMISSION.md)
  - Copy the Product Hunt URL for sharing

### Phase 2: Twitter/X (12:10 AM PST)

- [ ] **Post launch thread** (9 tweets)
  - See: `SOCIAL_MEDIA_ANNOUNCEMENTS.md` → Twitter/X Launch Thread section
  - Include Product Hunt link in main tweet
  - Attach demo GIF to Tweet 7

- [ ] **Schedule follow-up tweets:**
  - 2 hours: Quick peek post
  - 4 hours: Behind-the-scenes
  - 6 hours: Feature spotlight
  - 8 hours: User quote (if available)
  - End of day: Summary with stats

### Phase 3: LinkedIn (12:15 AM PST)

- [ ] **Post main announcement**
  - See: `SOCIAL_MEDIA_ANNOUNCEMENTS.md` → LinkedIn section
  - Add Product Hunt link in first comment

### Phase 4: Email Beta Users (6:00 AM PST)

- [ ] **Send launch email**
  - Subject: "We're live on Product Hunt! Your support means everything"
  - See: `SOCIAL_MEDIA_ANNOUNCEMENTS.md` → Email to Beta Users
  - Personalize [NAME] if possible

### Phase 5: Community Posts (8:00 AM - 6:00 PM PST)

- [ ] **Reddit** (space these out):
  - 8:00 AM: r/SideProject
  - 10:00 AM: r/webdev
  - 6:00 PM: r/startups

- [ ] **Discord/Slack communities:**
  - Developer communities you're part of
  - Indie Hackers

- [ ] **Optional:**
  - Hacker News (only if doing well on PH)
  - Dev.to article

### Phase 6: Monitor & Engage (All Day)

- [ ] **Product Hunt:**
  - Respond to every comment within 30 minutes
  - Thank supporters publicly
  - Answer questions thoroughly

- [ ] **Technical Monitoring:**
  - Sentry dashboard: https://sentry.io
  - PostHog analytics: Check traffic spikes
  - API logs: `railway logs -f`

- [ ] **Track metrics:**
  - Product Hunt upvotes
  - Sign-ups (check PostHog or database)
  - Any errors or issues

---

## Quick Reference Links

| Service | Dashboard |
|---------|-----------|
| Product Hunt | https://www.producthunt.com/posts/[your-post] |
| Sentry | https://sentry.io |
| PostHog | https://app.posthog.com |
| Railway | https://railway.app |
| Vercel | https://vercel.com |
| Neon | https://console.neon.tech |

---

## UTM Parameters for Tracking

```
Landing Page from PH: https://planflow.tools?ref=producthunt
Sign Up from PH: https://app.planflow.tools/register?utm_source=producthunt&utm_medium=launch&utm_campaign=feb2026
```

---

## Emergency Contacts

If something breaks:

1. **API Issues:** Check Railway logs
   ```bash
   railway logs -f
   ```

2. **Database Issues:** Check Neon dashboard
   ```bash
   curl https://api.planflow.tools/health/db
   ```

3. **Web Issues:** Check Vercel deployment
   - Rollback if needed from Vercel dashboard

4. **Quick Fixes:**
   ```bash
   # Restart API on Railway
   railway redeploy

   # Check error tracking
   # Open Sentry dashboard
   ```

---

## Post-Launch (Day 2-7)

- [ ] Write launch retrospective
- [ ] Thank supporters individually
- [ ] Add "Featured on Product Hunt" badge to website
- [ ] Analyze which messages resonated
- [ ] Follow up with engaged commenters
- [ ] Plan next feature based on feedback

---

## Success Metrics

| Metric | Good | Great | Excellent |
|--------|------|-------|-----------|
| PH Position | Top 10 | Top 5 | #1 Product |
| PH Upvotes | 200+ | 500+ | 1000+ |
| Sign-ups (Day 1) | 50+ | 100+ | 200+ |

---

**Good luck with the launch!**

*Run `bash scripts/launch.sh` to verify everything is ready.*
