# PlanFlow API Performance Tests

Performance testing suite using [k6](https://k6.io/) for the PlanFlow API.

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```bash
choco install k6
```

## Quick Start

1. **Start the API server:**
   ```bash
   pnpm --filter api dev
   ```

2. **Seed test data:**
   ```bash
   pnpm --filter api perf:seed
   ```

3. **Run smoke test:**
   ```bash
   pnpm --filter api test:perf
   ```

## Available Tests

### Scenario Tests

| Test | Command | Description |
|------|---------|-------------|
| Smoke | `pnpm --filter api test:perf` | Quick validation (2 VUs, 1 min) |
| Load | `pnpm --filter api test:perf:load` | Normal traffic (50 VUs, 10 min) |
| Stress | `pnpm --filter api test:perf:stress` | Breaking point (300 VUs, 15 min) |

### Endpoint Tests

```bash
# Authentication endpoints
k6 run perf/tests/endpoints/auth.js

# Project CRUD endpoints
k6 run perf/tests/endpoints/projects.js

# Health check endpoints
k6 run perf/tests/endpoints/health.js
```

### Critical Path Tests

```bash
# Bulk task updates (5, 25, 100 tasks)
k6 run perf/tests/critical/bulk-task-updates.js

# Large plan updates (1KB to 4.5MB)
k6 run perf/tests/critical/large-plan-updates.js
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3001` | API base URL |
| `PERF_ENV` | `local` | Environment: local, staging, production |
| `PERF_TEST_PASSWORD` | - | Password for test user (staging/prod) |
| `PERF_PRO_PASSWORD` | - | Password for pro user (staging/prod) |

### Running Against Different Environments

```bash
# Local (default)
k6 run perf/scenarios/smoke.js

# Staging
k6 run perf/scenarios/smoke.js --env API_URL=https://api-staging.planflow.dev --env PERF_ENV=staging

# With custom credentials
k6 run perf/scenarios/load.js \
  --env API_URL=https://api-staging.planflow.dev \
  --env PERF_TEST_PASSWORD=secret123
```

## Test Data

The seed script creates:
- 2 test users:
  - `perf-test@planflow.dev` / `PerfTest123!` (free tier)
  - `perf-pro@planflow.dev` / `PerfPro123!` (pro tier)
- 10 projects per user
- 50 tasks per project

Run seeding:
```bash
pnpm --filter api perf:seed
```

## Performance Thresholds

| Endpoint | p95 Target |
|----------|------------|
| `GET /health` | < 50ms |
| `POST /auth/login` | < 1500ms |
| `GET /projects` | < 500ms |
| `GET /projects/:id/tasks` | < 1000ms |
| `PUT /projects/:id/tasks` (small) | < 500ms |
| `PUT /projects/:id/tasks` (large) | < 3000ms |
| `PUT /projects/:id/plan` | < 5000ms |

## Output & Reporting

### Console Output

k6 provides a summary after each test run:

```
     checks.........................: 100.00% ✓ 1234  ✗ 0
     data_received..................: 2.1 MB  35 kB/s
     data_sent......................: 456 kB  7.6 kB/s
     http_req_duration..............: avg=45.2ms min=12ms med=38ms max=890ms p(95)=120ms
     http_reqs......................: 5678    94.6/s
```

### JSON Output

For CI/CD integration:

```bash
k6 run perf/scenarios/smoke.js --out json=results.json
```

### HTML Report (with k6 extension)

```bash
k6 run perf/scenarios/smoke.js --out web-dashboard
```

## Directory Structure

```
perf/
├── config/
│   ├── thresholds.js      # Performance threshold definitions
│   └── environments.js    # Environment-specific settings
├── helpers/
│   ├── auth.js            # Authentication helpers
│   └── data-generators.js # Test data factories
├── scenarios/
│   ├── smoke.js           # Quick validation test
│   ├── load.js            # Normal load test
│   └── stress.js          # Stress/breaking point test
├── tests/
│   ├── critical/
│   │   ├── bulk-task-updates.js
│   │   └── large-plan-updates.js
│   └── endpoints/
│       ├── auth.js
│       ├── projects.js
│       └── health.js
├── scripts/
│   └── seed.ts            # Data seeding script
└── README.md
```

## Troubleshooting

### "Failed to authenticate test user"

Make sure to run the seed script first:
```bash
pnpm --filter api perf:seed
```

### Rate Limiting

The API has rate limiting. For high-load tests, you may need to:
1. Increase rate limits in test environment
2. Use multiple test user accounts
3. Add delays between requests

### Connection Errors

If you see connection errors:
1. Verify API is running: `curl http://localhost:3001/health`
2. Check for port conflicts
3. Ensure database is accessible

### Large Payload Tests Timeout

For large plan tests, increase the timeout:
```javascript
http.put(url, payload, { timeout: '60s' });
```

## Best Practices

1. **Always run smoke test first** to verify basic functionality
2. **Seed fresh data** before running tests
3. **Run against isolated environment** - don't test against production with write operations
4. **Monitor system resources** during stress tests
5. **Review results** - look for degradation patterns, not just pass/fail
