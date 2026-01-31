/**
 * Stress Test - Find breaking point
 *
 * Purpose: Determine system limits and identify when performance degrades
 * Duration: ~15 minutes
 * VUs: Ramps to 300
 *
 * Usage:
 *   k6 run perf/scenarios/stress.js
 *   k6 run perf/scenarios/stress.js --env API_URL=https://api-staging.planflow.tools
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { baseUrl, testUser, proUser, maxVUs } from '../config/environments.js';
import { login, authHeaders } from '../helpers/auth.js';
import { generateProject, randomSleep } from '../helpers/data-generators.js';

// Custom metrics
const requestsTotal = new Counter('requests_total');
const errorsTotal = new Counter('errors_total');
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time_trend');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Warm up
    { duration: '2m', target: 100 },   // Moderate load
    { duration: '2m', target: 150 },   // Increasing load
    { duration: '3m', target: 200 },   // Heavy load
    { duration: '3m', target: 300 },   // Peak load (stress point)
    { duration: '2m', target: 300 },   // Sustain peak
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    // Stress tests have more lenient thresholds
    'http_req_duration': ['p(95)<5000'],     // 95% under 5s
    'http_req_failed': ['rate<0.10'],        // Less than 10% failures
    'error_rate': ['rate<0.15'],             // Less than 15% custom errors
    // Health should still be fast even under stress
    'http_req_duration{endpoint:health}': ['p(95)<200'],
    // Track degradation point
    'response_time_trend': ['p(50)<1000', 'p(95)<4000'],
  },
};

// Setup
export function setup() {
  console.log('[Stress] Starting stress test...');
  console.log(`[Stress] Base URL: ${baseUrl}`);
  console.log(`[Stress] Max VUs configured: ${maxVUs}`);

  const testAuth = login(testUser.email, testUser.password);
  if (!testAuth) {
    throw new Error('Failed to authenticate test user');
  }

  const proAuth = login(proUser.email, proUser.password);
  if (!proAuth) {
    throw new Error('Failed to authenticate pro user');
  }

  return { testAuth, proAuth };
}

// Main test function
export default function (data) {
  const isProUser = Math.random() < 0.2;
  const auth = isProUser ? data.proAuth : data.testAuth;
  const headers = authHeaders(auth.token);

  // Simplified endpoint mix for stress testing
  const rand = Math.random() * 100;

  if (rand < 40) {
    // 40% - Health checks (lightweight)
    testHealth();
  } else if (rand < 70) {
    // 30% - List operations (read-heavy)
    testReadOperations(headers);
  } else if (rand < 90) {
    // 20% - Auth operations
    testAuthOperations(headers, auth.refreshToken);
  } else {
    // 10% - Write operations (expensive)
    testWriteOperations(headers);
  }

  // Minimal think time during stress
  sleep(randomSleep(100, 500));
}

/**
 * Health check - should remain fast under load
 */
function testHealth() {
  const start = Date.now();
  const res = http.get(`${baseUrl}/health`, {
    tags: { endpoint: 'health' },
  });

  requestsTotal.add(1);
  responseTime.add(Date.now() - start);

  const success = check(res, {
    'health ok': (r) => r.status === 200,
  });

  if (!success) {
    errorsTotal.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

/**
 * Read-heavy operations
 */
function testReadOperations(headers) {
  group('Read Operations', function () {
    // Get current user
    const start1 = Date.now();
    const meRes = http.get(`${baseUrl}/auth/me`, {
      headers,
      tags: { endpoint: 'auth_me' },
    });
    requestsTotal.add(1);
    responseTime.add(Date.now() - start1);

    let success = check(meRes, { 'me ok': (r) => r.status === 200 });
    if (!success) {
      errorsTotal.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }

    sleep(0.1);

    // List projects
    const start2 = Date.now();
    const projectsRes = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });
    requestsTotal.add(1);
    responseTime.add(Date.now() - start2);

    success = check(projectsRes, { 'projects ok': (r) => r.status === 200 });
    if (!success) {
      errorsTotal.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }

    // If we have projects, list tasks for first one
    if (projectsRes.status === 200) {
      try {
        const projects = JSON.parse(projectsRes.body).data?.projects || [];
        if (projects.length > 0) {
          sleep(0.1);
          const start3 = Date.now();
          const tasksRes = http.get(`${baseUrl}/projects/${projects[0].id}/tasks`, {
            headers,
            tags: { endpoint: 'tasks_list' },
          });
          requestsTotal.add(1);
          responseTime.add(Date.now() - start3);

          success = check(tasksRes, { 'tasks ok': (r) => r.status === 200 });
          if (!success) {
            errorsTotal.add(1);
            errorRate.add(1);
          } else {
            errorRate.add(0);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  });
}

/**
 * Auth operations
 */
function testAuthOperations(headers, refreshToken) {
  group('Auth Operations', function () {
    // Get current user
    const start1 = Date.now();
    const meRes = http.get(`${baseUrl}/auth/me`, {
      headers,
      tags: { endpoint: 'auth_me' },
    });
    requestsTotal.add(1);
    responseTime.add(Date.now() - start1);

    let success = check(meRes, { 'me ok': (r) => r.status === 200 });
    if (!success) {
      errorsTotal.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }

    sleep(0.1);

    // Refresh token
    const start2 = Date.now();
    const refreshRes = http.post(
      `${baseUrl}/auth/refresh`,
      JSON.stringify({ refreshToken }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'auth_refresh' },
      }
    );
    requestsTotal.add(1);
    responseTime.add(Date.now() - start2);

    success = check(refreshRes, { 'refresh ok': (r) => r.status === 200 });
    if (!success) {
      errorsTotal.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });
}

/**
 * Write operations - more expensive
 */
function testWriteOperations(headers) {
  group('Write Operations', function () {
    // Create project
    const project = generateProject({ namePrefix: 'Stress Test' });
    const start1 = Date.now();
    const createRes = http.post(`${baseUrl}/projects`, JSON.stringify(project), {
      headers,
      tags: { endpoint: 'projects_create' },
    });
    requestsTotal.add(1);
    responseTime.add(Date.now() - start1);

    let projectId;
    if (createRes.status === 201) {
      errorRate.add(0);
      try {
        projectId = JSON.parse(createRes.body).data?.project?.id;
      } catch {
        // Ignore
      }
    } else if (createRes.status === 403) {
      // Project limit - expected
      errorRate.add(0);
      return;
    } else {
      errorsTotal.add(1);
      errorRate.add(1);
      return;
    }

    if (!projectId) return;

    sleep(0.1);

    // Update project
    const start2 = Date.now();
    const updateRes = http.put(
      `${baseUrl}/projects/${projectId}`,
      JSON.stringify({ description: 'Stress test update' }),
      { headers, tags: { endpoint: 'projects_update' } }
    );
    requestsTotal.add(1);
    responseTime.add(Date.now() - start2);

    let success = check(updateRes, { 'update ok': (r) => r.status === 200 });
    if (!success) {
      errorsTotal.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }

    sleep(0.1);

    // Delete project (cleanup)
    const start3 = Date.now();
    const deleteRes = http.del(`${baseUrl}/projects/${projectId}`, null, {
      headers,
      tags: { endpoint: 'projects_delete' },
    });
    requestsTotal.add(1);
    responseTime.add(Date.now() - start3);

    success = check(deleteRes, { 'delete ok': (r) => r.status === 200 });
    if (!success) {
      errorsTotal.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });
}

// Teardown
export function teardown(data) {
  console.log('[Stress] Stress test completed');
  console.log('[Stress] Check summary for degradation points');
}
