/**
 * Critical Test: Bulk Task Updates
 *
 * Purpose: Test PUT /projects/:id/tasks with various batch sizes
 * Focus: Verify performance thresholds for 5, 25, and 100 task updates
 *
 * Usage:
 *   k6 run perf/tests/critical/bulk-task-updates.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { baseUrl, proUser } from '../../config/environments.js';
import { buildThresholds } from '../../config/thresholds.js';
import { login, authHeaders } from '../../helpers/auth.js';

// Custom metrics per batch size
const smallBatchDuration = new Trend('bulk_update_small_duration');
const mediumBatchDuration = new Trend('bulk_update_medium_duration');
const largeBatchDuration = new Trend('bulk_update_large_duration');
const updatesTotal = new Counter('bulk_updates_total');
const updatesFailed = new Counter('bulk_updates_failed');

// Test configuration
export const options = {
  scenarios: {
    small_batch: {
      executor: 'constant-vus',
      vus: 5,
      duration: '2m',
      tags: { batch_size: 'small' },
    },
    medium_batch: {
      executor: 'constant-vus',
      vus: 3,
      duration: '2m',
      startTime: '2m',
      tags: { batch_size: 'medium' },
    },
    large_batch: {
      executor: 'constant-vus',
      vus: 2,
      duration: '2m',
      startTime: '4m',
      tags: { batch_size: 'large' },
    },
  },
  thresholds: {
    // Small batch (5 tasks): p95 < 500ms
    'bulk_update_small_duration': ['p(95)<500'],
    // Medium batch (25 tasks): p95 < 1500ms
    'bulk_update_medium_duration': ['p(95)<1500'],
    // Large batch (100 tasks): p95 < 3000ms
    'bulk_update_large_duration': ['p(95)<3000'],
    // Overall error rate
    'http_req_failed': ['rate<0.02'],
  },
};

// Setup: Create a project with tasks for testing
export function setup() {
  console.log('[Bulk Tasks] Starting bulk task update test...');

  // Login as pro user (no project limits)
  const auth = login(proUser.email, proUser.password);
  if (!auth) {
    throw new Error('Failed to authenticate pro user');
  }

  const headers = authHeaders(auth.token);

  // Create test project
  const createProjectRes = http.post(
    `${baseUrl}/projects`,
    JSON.stringify({
      name: `Bulk Task Test ${Date.now()}`,
      description: 'Performance test project for bulk task updates',
    }),
    { headers }
  );

  if (createProjectRes.status !== 201) {
    throw new Error(`Failed to create test project: ${createProjectRes.status} - ${createProjectRes.body}`);
  }

  const project = JSON.parse(createProjectRes.body).data.project;
  console.log(`[Bulk Tasks] Created test project: ${project.id}`);

  // Seed 100 tasks for the test
  const tasksToCreate = [];
  for (let i = 0; i < 100; i++) {
    tasksToCreate.push({
      title: `Perf Test Task ${i + 1}`,
      status: i % 3 === 0 ? 'completed' : 'pending',
      priority: i % 2 === 0 ? 'high' : 'medium',
      description: `Performance test task number ${i + 1}`,
    });
  }

  const seedRes = http.put(
    `${baseUrl}/projects/${project.id}/tasks`,
    JSON.stringify({ tasks: tasksToCreate }),
    { headers }
  );

  if (seedRes.status === 200) {
    console.log(`[Bulk Tasks] Seeded 100 tasks for testing`);
  } else {
    console.log(`[Bulk Tasks] Note: Could not seed tasks (${seedRes.status}) - testing with empty project`);
  }

  return {
    auth,
    projectId: project.id,
  };
}

// Main test function
export default function (data) {
  const { auth, projectId } = data;
  const headers = authHeaders(auth.token);

  // Determine batch size based on scenario
  const scenario = __ENV.K6_SCENARIO || 'small_batch';

  if (scenario === 'small_batch' || scenario.includes('small')) {
    testSmallBatch(headers, projectId);
  } else if (scenario === 'medium_batch' || scenario.includes('medium')) {
    testMediumBatch(headers, projectId);
  } else if (scenario === 'large_batch' || scenario.includes('large')) {
    testLargeBatch(headers, projectId);
  } else {
    // Default to small batch
    testSmallBatch(headers, projectId);
  }

  sleep(1);
}

/**
 * Test with 5 task updates
 */
function testSmallBatch(headers, projectId) {
  group('Bulk Update - Small Batch (5 tasks)', function () {
    // First get existing tasks
    const tasksRes = http.get(`${baseUrl}/projects/${projectId}/tasks`, {
      headers,
    });

    if (tasksRes.status !== 200) {
      updatesFailed.add(1);
      return;
    }

    const tasks = JSON.parse(tasksRes.body).data?.tasks || [];

    // If no tasks exist, skip this iteration (tasks should be seeded in setup)
    if (tasks.length === 0) {
      console.log('[Bulk Tasks] Warning: No tasks found, skipping iteration');
      return;
    }

    // Update up to 5 tasks
    const tasksToUpdate = tasks.slice(0, 5).map((t) => ({
      id: t.id,
      status: t.status === 'completed' ? 'pending' : 'completed',
    }));

    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/tasks`,
      JSON.stringify({ tasks: tasksToUpdate }),
      {
        headers,
        tags: { endpoint: 'tasks_bulk_update_small', batch_size: '5' },
      }
    );

    smallBatchDuration.add(Date.now() - start);
    updatesTotal.add(1);

    const success = check(res, {
      'small batch update returns 200': (r) => r.status === 200,
      'small batch updated correct count': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data?.updatedCount === tasksToUpdate.length;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      updatesFailed.add(1);
    }
  });
}

/**
 * Test with 25 task updates
 */
function testMediumBatch(headers, projectId) {
  group('Bulk Update - Medium Batch (25 tasks)', function () {
    const tasksRes = http.get(`${baseUrl}/projects/${projectId}/tasks`, {
      headers,
    });

    if (tasksRes.status !== 200) {
      updatesFailed.add(1);
      return;
    }

    const tasks = JSON.parse(tasksRes.body).data?.tasks || [];

    if (tasks.length === 0) {
      return;
    }

    // Update up to 25 tasks
    const tasksToUpdate = tasks.slice(0, 25).map((t) => ({
      id: t.id,
      status: t.status === 'completed' ? 'pending' : 'completed',
      description: `Updated at ${new Date().toISOString()}`,
    }));

    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/tasks`,
      JSON.stringify({ tasks: tasksToUpdate }),
      {
        headers,
        tags: { endpoint: 'tasks_bulk_update_medium', batch_size: '25' },
      }
    );

    mediumBatchDuration.add(Date.now() - start);
    updatesTotal.add(1);

    const success = check(res, {
      'medium batch update returns 200': (r) => r.status === 200,
    });

    if (!success) {
      updatesFailed.add(1);
    }
  });
}

/**
 * Test with 100 task updates
 */
function testLargeBatch(headers, projectId) {
  group('Bulk Update - Large Batch (100 tasks)', function () {
    const tasksRes = http.get(`${baseUrl}/projects/${projectId}/tasks`, {
      headers,
    });

    if (tasksRes.status !== 200) {
      updatesFailed.add(1);
      return;
    }

    const tasks = JSON.parse(tasksRes.body).data?.tasks || [];

    if (tasks.length === 0) {
      return;
    }

    // Update up to 100 tasks
    const tasksToUpdate = tasks.slice(0, 100).map((t) => ({
      id: t.id,
      status: t.status === 'completed' ? 'in_progress' : 'completed',
      description: `Bulk updated at ${new Date().toISOString()}`,
      complexity: 'medium',
    }));

    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/tasks`,
      JSON.stringify({ tasks: tasksToUpdate }),
      {
        headers,
        tags: { endpoint: 'tasks_bulk_update_large', batch_size: '100' },
      }
    );

    largeBatchDuration.add(Date.now() - start);
    updatesTotal.add(1);

    const success = check(res, {
      'large batch update returns 200': (r) => r.status === 200,
    });

    if (!success) {
      updatesFailed.add(1);
    }
  });
}

// Teardown: Clean up test project
export function teardown(data) {
  if (!data || !data.projectId) return;

  const headers = authHeaders(data.auth.token);

  // Delete test project
  const deleteRes = http.del(`${baseUrl}/projects/${data.projectId}`, null, {
    headers,
  });

  if (deleteRes.status === 200) {
    console.log('[Bulk Tasks] Cleaned up test project');
  } else {
    console.log(`[Bulk Tasks] Failed to clean up project: ${deleteRes.status}`);
  }

  console.log('[Bulk Tasks] Test completed');
}
