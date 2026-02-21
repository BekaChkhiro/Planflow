# PlanFlow Deployment Guide

This guide covers deploying PlanFlow to production using Railway (API) and Vercel (Web).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Database Setup (Neon)](#database-setup-neon)
- [API Deployment (Railway)](#api-deployment-railway)
- [Web Deployment (Vercel)](#web-deployment-vercel)
- [Environment Variables](#environment-variables)
- [CI/CD Pipeline](#cicd-pipeline)
- [Post-Deployment Checklist](#post-deployment-checklist)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] Node.js 20+ installed locally
- [ ] pnpm 9+ installed (`npm install -g pnpm`)
- [ ] Git repository with latest code pushed
- [ ] Accounts on: [Railway](https://railway.app), [Vercel](https://vercel.com), [Neon](https://neon.tech)
- [ ] Domain names configured (e.g., `api.planflow.tools`, `app.planflow.tools`)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Production Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐ │
│  │   Vercel    │────▶│   Railway   │────▶│   Neon PostgreSQL      │ │
│  │  (Web App)  │     │   (API)     │     │   (Serverless DB)       │ │
│  │  Next.js 14 │     │   Hono      │     │   + Connection Pooling  │ │
│  └─────────────┘     └─────────────┘     └─────────────────────────┘ │
│        │                   │                                          │
│        │                   │                                          │
│        ▼                   ▼                                          │
│  ┌─────────────┐     ┌─────────────┐                                 │
│  │  Cloudflare │     │   Resend    │                                 │
│  │  (CDN/DNS)  │     │  (Email)    │                                 │
│  └─────────────┘     └─────────────┘                                 │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Services Used

| Service | Purpose | Tier |
|---------|---------|------|
| Railway | API hosting | Hobby/Pro |
| Vercel | Web hosting | Hobby/Pro |
| Neon | PostgreSQL database | Free/Pro |
| Resend | Transactional email | Free tier (3k/month) |
| LemonSqueezy | Payment processing | 5% + standard fees |
| Cloudflare | DNS & CDN | Free tier |

---

## Database Setup (Neon)

### 1. Create Neon Project

1. Go to [Neon Console](https://console.neon.tech)
2. Create a new project: `planflow-production`
3. Select region closest to your API server (e.g., `us-east-2`)

### 2. Get Connection Strings

From Neon dashboard, get both connection strings:

```bash
# Direct connection (for migrations)
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/planflow?sslmode=require

# Pooled connection (for application - REQUIRED for serverless)
DATABASE_URL_POOLED=postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/planflow?sslmode=require
```

### 3. Run Migrations

```bash
cd apps/api
DATABASE_URL="your-direct-connection-string" pnpm db:migrate
```

### 4. Verify Database

```bash
# Check tables were created
DATABASE_URL="your-connection-string" pnpm db:studio
```

---

## API Deployment (Railway)

### 1. Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project" → "Empty Project"
3. Name it: `planflow-production`

### 2. Create API Service

1. Click "Add Service" → "GitHub Repo"
2. Select your PlanFlow repository
3. Railway will auto-detect the Dockerfile

### 3. Configure Environment Variables

In Railway dashboard, add these variables:

```bash
# Required
NODE_ENV=production
PORT=3001
DATABASE_URL=<neon-direct-connection>
DATABASE_URL_POOLED=<neon-pooled-connection>
JWT_SECRET=<generate-with: openssl rand -base64 64>
JWT_EXPIRATION=86400
APP_URL=https://app.planflow.tools
API_URL=https://api.planflow.tools

# Email (Resend)
RESEND_API_KEY=<your-resend-api-key>
RESEND_FROM_EMAIL=PlanFlow <notifications@planflow.tools>

# Payments (LemonSqueezy)
LEMON_SQUEEZY_API_KEY=<your-api-key>
LEMON_SQUEEZY_STORE_ID=<your-store-id>
LEMON_SQUEEZY_PRO_VARIANT_ID=<pro-variant-id>
LEMON_SQUEEZY_TEAM_VARIANT_ID=<team-variant-id>
LEMON_SQUEEZY_WEBHOOK_SECRET=<webhook-secret>

# Optional: GitHub Integration
GITHUB_CLIENT_ID=<github-oauth-client-id>
GITHUB_CLIENT_SECRET=<github-oauth-client-secret>
GITHUB_REDIRECT_URI=https://api.planflow.tools/integrations/github/callback
```

### 4. Configure Domain

1. Go to Settings → Networking
2. Add custom domain: `api.planflow.tools`
3. Configure DNS (CNAME to Railway)

### 5. Deploy

```bash
# Manual deploy via CLI
railway link -p <project-id> -e production -s api
railway up
```

---

## Web Deployment (Vercel)

### Option A: Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && pnpm turbo build --filter=@planflow/web`
   - **Install Command**: `cd ../.. && pnpm install`

### Option B: Vercel CLI

```bash
cd apps/web
vercel --prod
```

### Environment Variables

Add in Vercel dashboard:

```bash
NEXT_PUBLIC_API_URL=https://api.planflow.tools
NEXT_PUBLIC_APP_URL=https://app.planflow.tools
NEXT_PUBLIC_APP_NAME=PlanFlow
NEXT_PUBLIC_WS_URL=wss://api.planflow.tools

# Analytics (optional)
NEXT_PUBLIC_POSTHOG_KEY=<your-posthog-key>
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

### Configure Domain

1. Go to Project Settings → Domains
2. Add: `app.planflow.tools`
3. Configure DNS (CNAME to Vercel)

---

## Environment Variables

### Complete List

#### API (Railway)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `3001` |
| `DATABASE_URL` | Yes | Neon direct connection |
| `DATABASE_URL_POOLED` | Yes | Neon pooled connection |
| `JWT_SECRET` | Yes | 64-char secret |
| `JWT_EXPIRATION` | No | Token TTL in seconds |
| `APP_URL` | Yes | Frontend URL |
| `API_URL` | Yes | API URL |
| `RESEND_API_KEY` | Yes | Email service key |
| `RESEND_FROM_EMAIL` | Yes | Sender email |
| `LEMON_SQUEEZY_*` | Yes | Payment config |
| `GITHUB_CLIENT_*` | No | GitHub OAuth |

#### Web (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | API endpoint |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL |
| `NEXT_PUBLIC_APP_NAME` | Yes | `PlanFlow` |
| `NEXT_PUBLIC_WS_URL` | No | WebSocket URL |
| `NEXT_PUBLIC_POSTHOG_*` | No | Analytics |

---

## CI/CD Pipeline

### GitHub Actions Workflow

The deployment is automated via `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    branches: [master]
```

### Required GitHub Secrets

Add these in GitHub Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Railway API token |
| `RAILWAY_PROJECT_ID` | Railway project ID |
| `DATABASE_URL` | For migrations |
| `API_URL` | For health checks |
| `APP_URL` | For health checks |

### Getting Railway Token

```bash
railway login
railway whoami  # Shows project info
# Get token from Railway dashboard → Account → Tokens
```

---

## Post-Deployment Checklist

### Immediate Verification

- [ ] API health check: `curl https://api.planflow.tools/health`
- [ ] Database health: `curl https://api.planflow.tools/health/db`
- [ ] Frontend loads: `https://app.planflow.tools`
- [ ] Login/Register works
- [ ] WebSocket connection established

### Integration Tests

- [ ] Create a test project
- [ ] Sync plan to cloud
- [ ] Payment flow (use LemonSqueezy test mode)
- [ ] Email notifications received
- [ ] GitHub integration (if configured)

### Security Verification

- [ ] HTTPS enforced on all endpoints
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] No sensitive data in logs

---

## Monitoring & Logging

### Railway Logs

```bash
# View live logs
railway logs -f

# View specific service
railway logs -s api -f
```

### Vercel Logs

View in Vercel dashboard → Deployments → Logs

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Basic API health |
| `GET /health/db` | Database connectivity |

### Recommended Monitoring Tools

1. **Sentry** - Error tracking (T9.3)
2. **PostHog/Plausible** - Analytics (T9.4)
3. **Better Uptime** - Uptime monitoring

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Fails

```
Error: Connection refused
```

**Solution**: Ensure you're using the pooled connection string for the application.

#### 2. CORS Errors

```
Access-Control-Allow-Origin header missing
```

**Solution**: Add your frontend domain to `CORS_ORIGINS` env variable.

#### 3. WebSocket Connection Fails

```
WebSocket connection failed
```

**Solution**: Ensure Railway allows WebSocket connections (enabled by default).

#### 4. Build Fails on Vercel

```
Module not found: @planflow/shared
```

**Solution**: Ensure monorepo structure is correct and `turbo.json` has proper dependencies.

### Debug Commands

```bash
# Check Railway service status
railway status

# Check environment variables
railway variables

# SSH into Railway container
railway shell

# Check Vercel deployment
vercel inspect <deployment-url>
```

---

## Rollback Procedures

### Railway Rollback

```bash
# List deployments
railway deployments

# Rollback to previous
railway rollback <deployment-id>
```

### Vercel Rollback

1. Go to Vercel Dashboard → Deployments
2. Find previous successful deployment
3. Click "..." → "Promote to Production"

### Database Rollback

```bash
# Generate rollback migration
cd apps/api
pnpm db:generate --name rollback_xxx

# Or restore from Neon backup
# Go to Neon Dashboard → Backups → Restore
```

---

## Cost Estimation

### Monthly Costs (Estimated)

| Service | Tier | Cost |
|---------|------|------|
| Railway | Hobby | $5/month |
| Vercel | Hobby | Free |
| Neon | Free | Free (up to 0.5GB) |
| Resend | Free | Free (3k emails) |
| Cloudflare | Free | Free |
| **Total** | | **~$5-20/month** |

For higher traffic, upgrade to:
- Railway Pro: $20/month
- Neon Pro: $19/month
- Vercel Pro: $20/month

---

## Support

- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **Neon**: [neon.tech/docs](https://neon.tech/docs)
- **PlanFlow Issues**: [GitHub Issues](https://github.com/planflow/planflow/issues)
