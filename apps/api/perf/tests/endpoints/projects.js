/**
 * Endpoint Test: Projects
 *
 * Purpose: Test project endpoints under load
 * Endpoints: GET /projects, POST /projects, PUT /projects/:id, DELETE /projects/:id
 *
 * Usage:
 *   k6 run perf/tests/endpoints/projects.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { baseUrl, testUser, proUser } from '../../config/environments.js';
import { buildThresholds } from '../../config/thresholds.js';
import { login, authHeaders } from '../../helpers/auth.js';
import { generateProject, randomSleep } from '../../helpers/data-generators.js';

// Custom metrics
const listDuration = new Trend('projects_list_duration');
const createDuration = new Trend('projects_create_duration');
const updateDuration = new Trend('projects_update_duration');
const deleteDuration = new Trend('projects_delete_duration');
const projectsCreated = new Counter('projects_created');
const projectsDeleted = new Counter('projects_deleted');
const operationErrors = new Counter('project_operation_errors');

// Test configuration
export const options = {
  scenarios: {
    // Heavy read load
    list_projects: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 20 },
      ],
      tags: { operation: 'list' },
    },
    // CRUD operations
    crud_operations: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      startTime: '30s',
      tags: { operation: 'crud' },
    },
  },
  thresholds: {
    ...buildThresholds([
      'projects_list',
      'projects_create',
      'projects_update',
      'projects_delete',
    ]),
    'projects_list_duration': ['p(95)<500'],
    'projects_create_duration': ['p(95)<500'],
    'projects_update_duration': ['p(95)<500'],
    'projects_delete_duration': ['p(95)<500'],
    'project_operation_errors': ['count<100'],
  },
};

// Setup
export function setup() {
  console.log('[Projects Test] Starting projects test...');

  // Login as both users
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
  const scenario = __ENV.K6_SCENARIO || 'list_projects';

  // Use pro user for CRUD to avoid project limits
  const auth = scenario === 'crud_operations' ? data.proAuth : data.testAuth;
  const headers = authHeaders(auth.token);

  if (scenario === 'list_projects') {
    testListProjects(headers);
  } else if (scenario === 'crud_operations') {
    testCrudOperations(headers);
  }

  sleep(randomSleep(300, 1000));
}

/**
 * Test list projects
 */
function testListProjects(headers) {
  group('Projects - List', function () {
    const start = Date.now();

    const res = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });

    listDuration.add(Date.now() - start);

    const success = check(res, {
      'list returns 200': (r) => r.status === 200,
      'list has projects array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data?.projects);
        } catch {
          return false;
        }
      },
      'list has limits info': (r) => {
        try {
          const limits = JSON.parse(r.body).data?.limits;
          return limits?.currentCount !== undefined && limits?.maxProjects !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      operationErrors.add(1);
    }
  });
}

/**
 * Test full CRUD cycle
 */
function testCrudOperations(headers) {
  let projectId = null;

  // CREATE
  group('Projects - Create', function () {
    const project = generateProject({ namePrefix: 'Perf CRUD Test' });
    const start = Date.now();

    const res = http.post(`${baseUrl}/projects`, JSON.stringify(project), {
      headers,
      tags: { endpoint: 'projects_create' },
    });

    createDuration.add(Date.now() - start);

    const success = check(res, {
      'create returns 201': (r) => r.status === 201,
      'create has project id': (r) => {
        try {
          return JSON.parse(r.body).data?.project?.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (success) {
      projectsCreated.add(1);
      try {
        projectId = JSON.parse(res.body).data.project.id;
      } catch {
        // Ignore
      }
    } else if (res.status === 403) {
      // Project limit reached - not an error
      return;
    } else {
      operationErrors.add(1);
    }
  });

  if (!projectId) return;

  sleep(0.2);

  // READ (via list)
  group('Projects - Read', function () {
    const res = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });

    check(res, {
      'read returns 200': (r) => r.status === 200,
      'created project in list': (r) => {
        try {
          const projects = JSON.parse(r.body).data?.projects || [];
          return projects.some((p) => p.id === projectId);
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.2);

  // UPDATE
  group('Projects - Update', function () {
    const start = Date.now();

    const res = http.put(
      `${baseUrl}/projects/${projectId}`,
      JSON.stringify({
        name: `Updated Project ${Date.now()}`,
        description: 'Updated by performance test',
      }),
      {
        headers,
        tags: { endpoint: 'projects_update' },
      }
    );

    updateDuration.add(Date.now() - start);

    const success = check(res, {
      'update returns 200': (r) => r.status === 200,
      'update reflects changes': (r) => {
        try {
          const project = JSON.parse(r.body).data?.project;
          return project?.description === 'Updated by performance test';
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      operationErrors.add(1);
    }
  });

  sleep(0.2);

  // DELETE
  group('Projects - Delete', function () {
    const start = Date.now();

    const res = http.del(`${baseUrl}/projects/${projectId}`, null, {
      headers,
      tags: { endpoint: 'projects_delete' },
    });

    deleteDuration.add(Date.now() - start);

    const success = check(res, {
      'delete returns 200': (r) => r.status === 200,
    });

    if (success) {
      projectsDeleted.add(1);
    } else {
      operationErrors.add(1);
    }
  });

  sleep(0.2);

  // Verify deletion
  group('Projects - Verify Deletion', function () {
    const res = http.get(`${baseUrl}/projects`, {
      headers,
      tags: { endpoint: 'projects_list' },
    });

    check(res, {
      'deleted project not in list': (r) => {
        try {
          const projects = JSON.parse(r.body).data?.projects || [];
          return !projects.some((p) => p.id === projectId);
        } catch {
          return false;
        }
      },
    });
  });
}

/**
 * Test project not found
 */
function testNotFound(headers) {
  group('Projects - Not Found', function () {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const getRes = http.put(
      `${baseUrl}/projects/${fakeId}`,
      JSON.stringify({ name: 'Test' }),
      { headers }
    );
    check(getRes, {
      'update non-existent returns 404': (r) => r.status === 404,
    });

    const deleteRes = http.del(`${baseUrl}/projects/${fakeId}`, null, { headers });
    check(deleteRes, {
      'delete non-existent returns 404': (r) => r.status === 404,
    });
  });
}

/**
 * Test validation errors
 */
function testValidation(headers) {
  group('Projects - Validation', function () {
    // Empty name
    const emptyNameRes = http.post(
      `${baseUrl}/projects`,
      JSON.stringify({ name: '' }),
      { headers }
    );
    check(emptyNameRes, {
      'empty name returns 400': (r) => r.status === 400,
    });

    // Invalid UUID
    const invalidIdRes = http.put(
      `${baseUrl}/projects/not-a-uuid`,
      JSON.stringify({ name: 'Test' }),
      { headers }
    );
    check(invalidIdRes, {
      'invalid uuid returns 400': (r) => r.status === 400,
    });
  });
}

// Teardown
export function teardown(data) {
  console.log('[Projects Test] Completed');
}
