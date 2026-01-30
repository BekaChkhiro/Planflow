# PlanFlow Security Audit Report

**Date:** 2026-01-30
**Version:** 0.0.1
**Auditor:** Claude Code Security Review

---

## Executive Summary

This security audit covers the PlanFlow application, an AI-native project management tool. The audit examined authentication mechanisms, input validation, API security, payment handling, and dependency vulnerabilities.

**Overall Assessment:** The application demonstrates solid foundational security practices. Several enhancements were implemented during this audit to strengthen the security posture.

---

## Audit Scope

| Component | Location |
|-----------|----------|
| Backend API | `apps/api/` |
| Web Frontend | `apps/web/` |
| MCP Server | `packages/mcp/` |
| Shared Types | `packages/shared/` |

---

## Security Measures Implemented

### 1. CORS Origin Restriction

**Before:** CORS was configured to accept all origins (`cors()`)

**After:** Implemented `secureCors` middleware with:
- Origin whitelist based on environment
- Production-only strict origin validation
- Configurable allowed origins via `ALLOWED_ORIGINS` env var
- Support for `NEXT_PUBLIC_APP_URL` and `APP_URL` configuration

**File:** `apps/api/src/middleware/security.ts`

### 2. Rate Limiting

Implemented rate limiting middleware to prevent brute force attacks:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/register` | 5 requests | 1 minute |
| `/auth/login` | 5 requests | 1 minute |
| `/auth/refresh` | 5 requests | 1 minute |
| `/users/password` | 3 requests | 1 minute |
| `/api-tokens/verify` | 5 requests | 1 minute |
| `/webhooks/lemonsqueezy` | 50 requests | 1 minute |
| General API | 100 requests | 1 minute |

**Implementation:** In-memory rate limiting suitable for single-instance deployments. For multi-instance production deployments, consider upgrading to Redis-based rate limiting.

### 3. Security Headers

Added comprehensive security headers to all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS (production only) |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | XSS protection (legacy browsers) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer info |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | API CSP |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable unnecessary features |
| `X-Request-Id` | UUID | Request tracing |

### 4. Request Body Size Limits

Implemented body size limiting to prevent DoS attacks:

| Limit Type | Size | Usage |
|------------|------|-------|
| Default | 1 MB | Most API endpoints |
| Small | 64 KB | Auth endpoints |
| Large | 5 MB | Plan upload endpoints |

---

## Existing Security Strengths

### Authentication & Authorization

| Feature | Implementation | Status |
|---------|---------------|--------|
| Password Hashing | bcrypt with 12 salt rounds | Secure |
| JWT Access Tokens | 15-minute expiration | Secure |
| Refresh Tokens | SHA256 hashed, 30-day expiration | Secure |
| API Tokens | SHA256 hashed, `pf_` prefix | Secure |
| Token Revocation | Database-backed revocation | Secure |
| Dual Auth Support | JWT (web) + API tokens (MCP) | Secure |

### Database Security

| Feature | Implementation | Status |
|---------|---------------|--------|
| SQL Injection Prevention | Drizzle ORM parameterized queries | Protected |
| Cascade Delete | Foreign key constraints | Secure |
| Unique Constraints | Email, token hashes | Secure |
| UUID Primary Keys | Prevents enumeration | Secure |

### Payment Security

| Feature | Implementation | Status |
|---------|---------------|--------|
| Webhook Signature | HMAC-SHA256 verification | Secure |
| Timing-Safe Comparison | `crypto.timingSafeEqual()` | Secure |
| User ID Validation | Extracted from custom_data | Secure |
| Event Logging | All webhook events logged | Secure |

### Input Validation

| Feature | Implementation | Status |
|---------|---------------|--------|
| Request Validation | Zod schemas | Secure |
| Password Length | 8-72 characters (bcrypt limit) | Secure |
| Email Validation | Zod email format | Secure |
| UUID Validation | Regex validation | Secure |

---

## Dependency Vulnerabilities

### High Severity

| Package | Vulnerability | Version | Fix |
|---------|--------------|---------|-----|
| `next` | HTTP request deserialization DoS (GHSA-h25m-26qc-wcjf) | 14.2.x | Upgrade to 15.0.8+ |
| `glob` | Command injection via CLI (GHSA-5j98-mcp5-4vw2) | 10.3.10 | Upgrade to 10.5.0+ |

### Moderate Severity

| Package | Vulnerability | Version | Fix |
|---------|--------------|---------|-----|
| `esbuild` | Dev server request exposure (GHSA-67mh-4wv8-2f99) | 0.18.x/0.19.x | Upgrade to 0.25.0+ |
| `next` | Image Optimizer DoS (GHSA-9g9p-9gw9-jx7f) | 14.2.x | Upgrade to 15.5.10+ |

### Recommendations

1. **Next.js Upgrade (High Priority)**
   - Current: 14.2.x
   - Target: 15.5.10+
   - Impact: Major version upgrade, requires testing
   - Note: Also update `eslint-config-next` to match

2. **Dev Dependency Updates (Medium Priority)**
   - `glob` and `esbuild` are dev dependencies
   - Lower risk in production but should be updated
   - Update `drizzle-kit` when new version available

---

## Recommendations for Future Improvements

### High Priority

| Recommendation | Description | Complexity |
|---------------|-------------|------------|
| Redis Rate Limiting | Replace in-memory store with Redis for multi-instance deployments | Medium |
| Refresh Token Rotation | Rotate refresh tokens on each use to limit exposure | Medium |
| Password Reset Flow | Implement secure password reset with email verification | High |
| Audit Logging | Add database table for security events and access logs | Medium |

### Medium Priority

| Recommendation | Description | Complexity |
|---------------|-------------|------------|
| Session Invalidation | Revoke all tokens on password change | Low |
| Two-Factor Authentication | Optional 2FA for user accounts | High |
| IP Allowlisting | Allow users to restrict API token usage by IP | Medium |
| Request Signing | Add request signature verification for API tokens | Medium |

### Low Priority

| Recommendation | Description | Complexity |
|---------------|-------------|------------|
| Security Event Webhooks | Notify users of suspicious activity | Medium |
| Login History | Track and display login attempts | Low |
| Device Management | Allow users to view/revoke active sessions | Medium |

---

## Environment Configuration

### Required Environment Variables

```env
# Authentication
JWT_SECRET=<strong-random-string-32-chars-minimum>
JWT_EXPIRATION=900
REFRESH_TOKEN_EXPIRATION=2592000

# Database
DATABASE_URL=<postgres-connection-string>
DATABASE_URL_POOLED=<pooled-connection-string>

# Payment
LEMON_SQUEEZY_API_KEY=<api-key>
LEMON_SQUEEZY_STORE_ID=<store-id>
LEMON_SQUEEZY_WEBHOOK_SECRET=<webhook-secret>
LEMON_SQUEEZY_PRO_VARIANT_ID=<variant-id>
LEMON_SQUEEZY_TEAM_VARIANT_ID=<variant-id>

# Security (New)
ALLOWED_ORIGINS=https://planflow.app,https://www.planflow.app
APP_URL=https://api.planflow.app
NEXT_PUBLIC_APP_URL=https://planflow.app
NODE_ENV=production
```

### Security Checklist for Production

- [ ] All environment variables set
- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` (32+ random characters)
- [ ] Strong `LEMON_SQUEEZY_WEBHOOK_SECRET`
- [ ] HTTPS enforced at load balancer/proxy level
- [ ] Database connection uses SSL
- [ ] Rate limiting configured for expected traffic
- [ ] Monitoring/alerting for 429 responses
- [ ] Error tracking (Sentry) configured
- [ ] Access logs enabled and monitored

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/api/src/middleware/security.ts` | New file: CORS, rate limiting, security headers, body limits |
| `apps/api/src/middleware/index.ts` | Export security middleware |
| `apps/api/src/index.ts` | Integrate security middleware, add rate limiting to endpoints |

---

## Conclusion

The PlanFlow application has a solid security foundation with proper authentication, input validation, and database security. This audit implemented additional layers of defense including CORS restrictions, rate limiting, security headers, and request size limits.

**Key Actions Completed:**
- Implemented origin-restricted CORS
- Added rate limiting to auth and sensitive endpoints
- Added comprehensive security headers
- Added request body size limits
- Documented dependency vulnerabilities

**Outstanding Items:**
- Next.js major version upgrade needed for CVE fixes
- Consider Redis-based rate limiting for production scale
- Implement password reset flow
- Add audit logging for security events

---

*This report was generated as part of security audit task T4.12*
