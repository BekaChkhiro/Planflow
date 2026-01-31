/**
 * Load Test - Normal traffic simulation
 *
 * Purpose: Verify system handles expected production load
 * Duration: ~10 minutes
 * VUs: Ramps to 50
 *
 * Usage:
 *   k6 run perf/scenarios/load.js
 *   k6 run perf/scenarios/load.js --env API_URL=https://api-staging.planflow.tools
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { baseUrl, testUser, proUser } from '../config/environments.js';
import { buildThresholds } from '../config/thresholds.js';
import { login, authHeaders, refresh } from '../helpers/auth.js';
import { generateProject, randomSleep } from '../helpers/data-generators.js';

// Custom metrics
const projectsCreated = new Counter('projects_created');
const projectsDeleted = new Counter('projects_deleted');
const authRefreshes = new Counter('auth_refreshes');
const errorRate = new Rate('error_rate');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 25 },  // Ramp up to 25 VUs
    { duration: '3m', target: 50 },  // Ramp up to 50 VUs
    { duration: '5m', target: 50 },  // Stay at 50 VUs
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    ...buildThresholds([
      'health',
      'auth_login',
      'auth_refresh',
      'auth_me',
      'projects_list',
      'projects_create',
      'projects_update',
      'projects_delete',
      'tasks_list',
      'plan_get',
      'plan_update',
    ]),
    // Additional custom thresholds
    'error_rate': ['rate<0.05'],  // Less than 5% errors
    'http_req_duration{endpoint:health}': ['p(99)<100'],
  },
};

// Setup - login as both test users
export function setup() {
  console.log('[Load] Starting load test...');
  console.log(`[Load] Base URL: ${baseUrl}`);

  const testAuth = login(testUser.email, testUser.password);
  if (!testAuth) {
    throw new Error('Failed to authenticate test user');
  }

  const proAuth = login(proUser.email, proUser.password);
  if (!proAuth) {
    throw new Error('Failed to authenticate pro user');
  }

  return {
    testAuth,
    proAuth,
  };
}

// Main test function
export default function (data) {
  // Randomly select which user to simulate
  const isProUser = Math.random() < 0.3; // 30% pro users
  const auth = isProUser ? data.proAuth : data.testAuth;
  const headers = authHeaders(auth.token);

  // Weighted endpoint selection (simulate realistic traffic mix)
  const endpoint = selectEndpoint();

  switch (endpoint) {
    case 'health':
      testHealth();
      break;
    case 'me':
      testMe(headers);
      break;
    case 'list_projects':
      testListProjects(headers);
      break;
    case 'project_crud':
      testProjectCrud(headers);
      break;
    case 'project_plan':
      testProjectPlan(headers);
      break;
    case 'refresh_token':
      testTokenRefresh(auth.refreshToken);
      break;
  }

  // Variable think time
  sleep(randomSleep(500, 2000));
}

/**
 * Select endpoint based on traffic weights
 */
function selectEndpoint() {
  const rand = Math.random() * 100;

  // Traffic distribution:
  // 30% - List projects (most common)
  // 25% - Health checks (monitoring)
  // 20% - Get current user
  // 15% - Project CRUD operations
  // 5%  - Plan operations
  // 5%  - Token refresh

  if (rand < 30) return 'list_projects';
  if (rand < 55) return 'health';
  if (rand < 75) return 'me';
  if (rand < 90) return 'project_crud';
  if (rand < 95) return 'project_plan';
  return 'refresh_token';
}

/**
 * Test health endpoint
 */
function testHealth() {
  group('Health', function () {
    const res = http.get(`${baseUrl}/health`, {
      tags: { endpoint: 'health' },
    });
    const success = check(res, {
      'health returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });
}

/**
 * Test get current user
 */
function testMe(headers) {
  group('Auth - Me', function () {
    const res = http.get(`${baseUrl}/auth/me`, {
      headers,
      tags: { endpoint: 'auth_me' },
    });
    const success = check(res, {
      'me returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });
}

/**
 * Test list projects
 */
function testListProjects(headers) {
  group('Projects - List', function () {
    const res = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });
    const success = check(res, {
      'list projects returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });
}

/**
 * Test project CRUD operations
 */
function testProjectCrud(headers) {
  group('Projects - CRUD', function () {
    // Create project
    const project = generateProject({ namePrefix: 'Load Test' });
    const createRes = http.post(`${baseUrl}/projects`, JSON.stringify(project), {
      headers,
      tags: { endpoint: 'projects_create' },
      responseCallback: http.expectedStatuses(201, 403), // 403 = quota limit (expected)
    });

    let projectId;
    if (createRes.status === 201) {
      projectsCreated.add(1);
      try {
        projectId = JSON.parse(createRes.body).data?.project?.id;
      } catch {
        errorRate.add(true);
        return;
      }
    } else if (createRes.status === 403) {
      // Project limit reached - this is expected for free tier
      return;
    } else {
      errorRate.add(true);
      return;
    }

    if (!projectId) return;

    sleep(0.2);

    // Get tasks
    const tasksRes = http.get(`${baseUrl}/projects/${projectId}/tasks`, {
      headers,
      tags: { endpoint: 'tasks_list' },
    });
    check(tasksRes, {
      'list tasks returns 200': (r) => r.status === 200,
    });

    sleep(0.2);

    // Update project
    const updateRes = http.put(
      `${baseUrl}/projects/${projectId}`,
      JSON.stringify({ description: 'Updated by load test' }),
      { headers, tags: { endpoint: 'projects_update' } }
    );
    check(updateRes, {
      'update project returns 200': (r) => r.status === 200,
    });

    sleep(0.2);

    // Delete project (cleanup)
    const deleteRes = http.del(`${baseUrl}/projects/${projectId}`, null, {
      headers,
      tags: { endpoint: 'projects_delete' },
    });
    if (deleteRes.status === 200) {
      projectsDeleted.add(1);
    }
  });
}

/**
 * Test project plan operations
 */
function testProjectPlan(headers) {
  group('Projects - Plan', function () {
    // First get list of projects
    const listRes = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });

    if (listRes.status !== 200) {
      errorRate.add(true);
      return;
    }

    let projects;
    try {
      projects = JSON.parse(listRes.body).data?.projects || [];
    } catch {
      errorRate.add(true);
      return;
    }

    if (projects.length === 0) return;

    // Pick random project
    const project = projects[Math.floor(Math.random() * projects.length)];

    sleep(0.2);

    // Get plan
    const getPlanRes = http.get(`${baseUrl}/projects/${project.id}/plan`, {
      headers,
      tags: { endpoint: 'plan_get' },
    });
    check(getPlanRes, {
      'get plan returns 200': (r) => r.status === 200,
    });

    sleep(0.2);

    // Update plan with small content
    const planContent = `# Updated Plan\n\nUpdated at ${new Date().toISOString()}\n\n## Tasks\n\n- Task 1\n- Task 2`;
    const updatePlanRes = http.put(
      `${baseUrl}/projects/${project.id}/plan`,
      JSON.stringify({ plan: planContent }),
      { headers, tags: { endpoint: 'plan_update' } }
    );
    check(updatePlanRes, {
      'update plan returns 200': (r) => r.status === 200,
    });
  });
}

/**
 * Test token refresh
 * Note: Refresh tokens are single-use, so repeated calls with the same token
 * will fail (401). This is expected behavior. We only count as error if we get
 * an unexpected status code (not 200 or 401).
 */
function testTokenRefresh(refreshToken) {
  group('Auth - Refresh', function () {
    const res = http.post(
      `${baseUrl}/auth/refresh`,
      JSON.stringify({ refreshToken }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'auth_refresh' },
        responseCallback: http.expectedStatuses(200, 401), // 401 = token already used (expected)
      }
    );
    const success = check(res, {
      'refresh returns 200': (r) => r.status === 200,
    });
    if (success) {
      authRefreshes.add(1);
    }
    // Only count as error if status is unexpected (not 200 or 401)
    errorRate.add(res.status !== 200 && res.status !== 401);
  });
}

// Teardown
export function teardown(data) {
  console.log('[Load] Load test completed');
}
