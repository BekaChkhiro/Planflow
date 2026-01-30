/**
 * Smoke Test - Quick validation
 *
 * Purpose: Verify all critical endpoints work under minimal load
 * Duration: ~1 minute
 * VUs: 2
 *
 * Usage:
 *   k6 run perf/scenarios/smoke.js
 *   k6 run perf/scenarios/smoke.js --env API_URL=http://localhost:3001
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { baseUrl, proUser } from '../config/environments.js';
import { buildThresholds } from '../config/thresholds.js';
import { login, authHeaders } from '../helpers/auth.js';
import { generateProject } from '../helpers/data-generators.js';

// Test configuration
export const options = {
  vus: 2,
  duration: '1m',
  thresholds: buildThresholds([
    'health',
    'auth_login',
    'auth_me',
    'projects_list',
    'projects_create',
    'projects_update',
    'projects_delete',
    'tasks_list',
  ]),
};

// Setup - runs once before test
export function setup() {
  console.log('[Smoke] Starting smoke test...');
  console.log(`[Smoke] Base URL: ${baseUrl}`);

  // Login as pro user (unlimited projects)
  const auth = login(proUser.email, proUser.password);
  if (!auth) {
    throw new Error('Failed to authenticate pro user. Make sure to run perf:seed first.');
  }

  return { auth };
}

// Main test function - runs for each VU iteration
export default function (data) {
  const { auth } = data;
  const headers = authHeaders(auth.token);

  // Health check
  group('Health Checks', function () {
    const healthRes = http.get(`${baseUrl}/health`, {
      tags: { endpoint: 'health' },
    });
    check(healthRes, {
      'health check returns 200': (r) => r.status === 200,
      'health check is healthy': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch {
          return false;
        }
      },
    });

    sleep(0.5);
  });

  // Auth endpoints
  group('Auth Endpoints', function () {
    // Get current user
    const meRes = http.get(`${baseUrl}/auth/me`, {
      headers,
      tags: { endpoint: 'auth_me' },
    });
    check(meRes, {
      'get me returns 200': (r) => r.status === 200,
      'get me has user data': (r) => {
        try {
          return JSON.parse(r.body).data?.user?.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(0.5);
  });

  // Project CRUD
  group('Project CRUD', function () {
    // List projects
    const listRes = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });
    check(listRes, {
      'list projects returns 200': (r) => r.status === 200,
      'list projects has array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data?.projects);
        } catch {
          return false;
        }
      },
    });

    sleep(0.3);

    // Create project
    const newProject = generateProject({ namePrefix: 'Smoke Test' });
    const createRes = http.post(`${baseUrl}/projects`, JSON.stringify(newProject), {
      headers,
      tags: { endpoint: 'projects_create' },
    });
    check(createRes, {
      'create project returns 201': (r) => r.status === 201,
      'create project has id': (r) => {
        try {
          return JSON.parse(r.body).data?.project?.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    let projectId;
    try {
      projectId = JSON.parse(createRes.body).data?.project?.id;
    } catch {
      console.error('Failed to parse created project');
      return;
    }

    if (!projectId) {
      console.error('No project ID returned');
      return;
    }

    sleep(0.3);

    // Update project
    const updateRes = http.put(
      `${baseUrl}/projects/${projectId}`,
      JSON.stringify({ name: `${newProject.name} (Updated)` }),
      { headers, tags: { endpoint: 'projects_update' } }
    );
    check(updateRes, {
      'update project returns 200': (r) => r.status === 200,
    });

    sleep(0.3);

    // List tasks (empty)
    const tasksRes = http.get(`${baseUrl}/projects/${projectId}/tasks`, {
      headers,
      tags: { endpoint: 'tasks_list' },
    });
    check(tasksRes, {
      'list tasks returns 200': (r) => r.status === 200,
      'list tasks has array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data?.tasks);
        } catch {
          return false;
        }
      },
    });

    sleep(0.3);

    // Delete project (cleanup)
    const deleteRes = http.del(`${baseUrl}/projects/${projectId}`, null, {
      headers,
      tags: { endpoint: 'projects_delete' },
    });
    check(deleteRes, {
      'delete project returns 200': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // Think time between iterations
  sleep(1);
}

// Teardown - runs once after test
export function teardown(data) {
  console.log('[Smoke] Smoke test completed');
}
