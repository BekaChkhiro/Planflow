/**
 * Endpoint Test: Health Checks
 *
 * Purpose: Verify health endpoints remain fast under any load
 * Endpoints: GET /health, GET /health/db
 *
 * Usage:
 *   k6 run perf/tests/endpoints/health.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { baseUrl } from '../../config/environments.js';
import { buildThresholds } from '../../config/thresholds.js';

// Custom metrics
const healthDuration = new Trend('health_duration');
const healthDbDuration = new Trend('health_db_duration');
const healthErrors = new Counter('health_errors');
const healthAvailability = new Rate('health_availability');

// Test configuration
export const options = {
  scenarios: {
    // Constant health check load (simulates monitoring)
    health_monitoring: {
      executor: 'constant-arrival-rate',
      rate: 10,           // 10 requests per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 5,
      maxVUs: 20,
      tags: { endpoint: 'health' },
    },
    // Spike test for health endpoint
    health_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      stages: [
        { duration: '30s', target: 50 },   // Spike to 50 rps
        { duration: '30s', target: 100 },  // Spike to 100 rps
        { duration: '30s', target: 10 },   // Back to normal
      ],
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: '2m',
      tags: { endpoint: 'health_spike' },
    },
    // Database health check (less frequent, more expensive)
    health_db: {
      executor: 'constant-arrival-rate',
      rate: 2,            // 2 requests per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 2,
      maxVUs: 10,
      startTime: '30s',
      tags: { endpoint: 'health_db' },
    },
  },
  thresholds: {
    ...buildThresholds(['health']),
    // Health must be very fast
    'health_duration': ['p(50)<20', 'p(95)<50', 'p(99)<100'],
    // DB health can be slightly slower
    'health_db_duration': ['p(95)<200'],
    // High availability requirements
    'health_availability': ['rate>0.999'],  // 99.9% availability
    'health_errors': ['count<10'],
  },
};

// Main test function
export default function () {
  const scenario = __ENV.K6_SCENARIO || 'health_monitoring';

  if (scenario === 'health_db') {
    testHealthDb();
  } else {
    testHealth();
  }
}

/**
 * Test basic health endpoint
 */
function testHealth() {
  const start = Date.now();

  const res = http.get(`${baseUrl}/health`, {
    tags: { endpoint: 'health' },
    timeout: '5s',
  });

  healthDuration.add(Date.now() - start);

  const success = check(res, {
    'health returns 200': (r) => r.status === 200,
    'health status is healthy': (r) => {
      try {
        return JSON.parse(r.body).status === 'healthy';
      } catch {
        return false;
      }
    },
    'health has timestamp': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.timestamp !== undefined;
      } catch {
        return false;
      }
    },
    'health response time < 100ms': (r) => r.timings.duration < 100,
  });

  if (success) {
    healthAvailability.add(1);
  } else {
    healthErrors.add(1);
    healthAvailability.add(0);
  }
}

/**
 * Test database health endpoint
 */
function testHealthDb() {
  const start = Date.now();

  const res = http.get(`${baseUrl}/health/db`, {
    tags: { endpoint: 'health_db' },
    timeout: '10s',
  });

  healthDbDuration.add(Date.now() - start);

  const success = check(res, {
    'health/db returns 200': (r) => r.status === 200,
    'health/db status is healthy': (r) => {
      try {
        return JSON.parse(r.body).status === 'healthy';
      } catch {
        return false;
      }
    },
    'health/db has database info': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.database !== undefined;
      } catch {
        return false;
      }
    },
    'health/db database connected': (r) => {
      try {
        return JSON.parse(r.body).database?.connected === true;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    healthErrors.add(1);
    console.log(`[Health DB] Failed: ${res.status} - ${res.body}`);
  }
}

/**
 * Test root endpoint
 */
function testRoot() {
  const res = http.get(baseUrl, {
    tags: { endpoint: 'root' },
  });

  check(res, {
    'root returns 200': (r) => r.status === 200,
    'root has api info': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.name === 'PlanFlow API' && body.status === 'ok';
      } catch {
        return false;
      }
    },
  });
}

// Teardown
export function teardown() {
  console.log('[Health Test] Completed');
}
