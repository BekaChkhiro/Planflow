/**
 * Critical Test: Large Plan Updates
 *
 * Purpose: Test PUT /projects/:id/plan with various payload sizes
 * Focus: Verify handling of 100KB, 1MB, and 4.5MB plan content
 *
 * Usage:
 *   k6 run perf/tests/critical/large-plan-updates.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { baseUrl, proUser } from '../../config/environments.js';
import { login, authHeaders } from '../../helpers/auth.js';
import { generatePlan } from '../../helpers/data-generators.js';

// Custom metrics per payload size
const smallPlanDuration = new Trend('plan_update_small_duration');
const mediumPlanDuration = new Trend('plan_update_medium_duration');
const largePlanDuration = new Trend('plan_update_large_duration');
const xlargePlanDuration = new Trend('plan_update_xlarge_duration');
const updatesTotal = new Counter('plan_updates_total');
const updatesFailed = new Counter('plan_updates_failed');
const bytesUploaded = new Counter('plan_bytes_uploaded');

// Test configuration
export const options = {
  scenarios: {
    small_plan: {
      executor: 'constant-vus',
      vus: 5,
      duration: '1m',
      tags: { plan_size: 'small' },
    },
    medium_plan: {
      executor: 'constant-vus',
      vus: 3,
      duration: '1m',
      startTime: '1m',
      tags: { plan_size: 'medium' },
    },
    large_plan: {
      executor: 'constant-vus',
      vus: 2,
      duration: '2m',
      startTime: '2m',
      tags: { plan_size: 'large' },
    },
    xlarge_plan: {
      executor: 'constant-vus',
      vus: 1,
      duration: '2m',
      startTime: '4m',
      tags: { plan_size: 'xlarge' },
    },
  },
  thresholds: {
    // Small plan (1KB): p95 < 500ms
    'plan_update_small_duration': ['p(95)<500'],
    // Medium plan (100KB): p95 < 2000ms
    'plan_update_medium_duration': ['p(95)<2000'],
    // Large plan (1MB): p95 < 5000ms
    'plan_update_large_duration': ['p(95)<5000'],
    // XLarge plan (4.5MB): p95 < 10000ms
    'plan_update_xlarge_duration': ['p(95)<10000'],
    // Overall error rate
    'http_req_failed': ['rate<0.05'],
  },
};

// Pre-generate plans of different sizes (expensive operation)
let plans = {};

// Setup
export function setup() {
  console.log('[Large Plans] Starting large plan update test...');
  console.log('[Large Plans] Generating test plans...');

  // Generate plans of different sizes
  plans = {
    small: generatePlan('small'),     // 1KB
    medium: generatePlan('medium'),   // 100KB
    large: generatePlan('large'),     // 1MB
    xlarge: generatePlan('xlarge'),   // 4.5MB
  };

  console.log(`[Large Plans] Plan sizes - small: ${plans.small.length}, medium: ${plans.medium.length}, large: ${plans.large.length}, xlarge: ${plans.xlarge.length}`);

  // Login as pro user
  const auth = login(proUser.email, proUser.password);
  if (!auth) {
    throw new Error('Failed to authenticate pro user');
  }

  const headers = authHeaders(auth.token);

  // Create test project
  const createProjectRes = http.post(
    `${baseUrl}/projects`,
    JSON.stringify({
      name: `Large Plan Test ${Date.now()}`,
      description: 'Performance test project for large plan updates',
    }),
    { headers }
  );

  if (createProjectRes.status !== 201) {
    throw new Error(`Failed to create test project: ${createProjectRes.status}`);
  }

  const project = JSON.parse(createProjectRes.body).data.project;
  console.log(`[Large Plans] Created test project: ${project.id}`);

  return {
    auth,
    projectId: project.id,
    plans,
  };
}

// Main test function
export default function (data) {
  const { auth, projectId, plans } = data;
  const headers = authHeaders(auth.token);

  // Determine plan size based on scenario
  const scenario = __ENV.K6_SCENARIO || 'small_plan';

  if (scenario === 'small_plan' || scenario.includes('small')) {
    testSmallPlan(headers, projectId, plans.small);
  } else if (scenario === 'medium_plan' || scenario.includes('medium')) {
    testMediumPlan(headers, projectId, plans.medium);
  } else if (scenario === 'large_plan' || scenario.includes('large') && !scenario.includes('xlarge')) {
    testLargePlan(headers, projectId, plans.large);
  } else if (scenario === 'xlarge_plan' || scenario.includes('xlarge')) {
    testXLargePlan(headers, projectId, plans.xlarge);
  } else {
    testSmallPlan(headers, projectId, plans.small);
  }

  sleep(0.5);
}

/**
 * Test with ~1KB plan
 */
function testSmallPlan(headers, projectId, planContent) {
  group('Plan Update - Small (~1KB)', function () {
    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/plan`,
      JSON.stringify({ plan: planContent }),
      {
        headers,
        tags: { endpoint: 'plan_update', plan_size: 'small' },
      }
    );

    const duration = Date.now() - start;
    smallPlanDuration.add(duration);
    updatesTotal.add(1);
    bytesUploaded.add(planContent.length);

    const success = check(res, {
      'small plan update returns 200': (r) => r.status === 200,
      'small plan content matches': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data?.plan === planContent;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      updatesFailed.add(1);
      console.log(`[Small Plan] Failed: ${res.status} - ${res.body?.substring(0, 200)}`);
    }
  });
}

/**
 * Test with ~100KB plan
 */
function testMediumPlan(headers, projectId, planContent) {
  group('Plan Update - Medium (~100KB)', function () {
    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/plan`,
      JSON.stringify({ plan: planContent }),
      {
        headers,
        tags: { endpoint: 'plan_update', plan_size: 'medium' },
      }
    );

    const duration = Date.now() - start;
    mediumPlanDuration.add(duration);
    updatesTotal.add(1);
    bytesUploaded.add(planContent.length);

    const success = check(res, {
      'medium plan update returns 200': (r) => r.status === 200,
    });

    if (!success) {
      updatesFailed.add(1);
      console.log(`[Medium Plan] Failed: ${res.status}`);
    }
  });
}

/**
 * Test with ~1MB plan
 */
function testLargePlan(headers, projectId, planContent) {
  group('Plan Update - Large (~1MB)', function () {
    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/plan`,
      JSON.stringify({ plan: planContent }),
      {
        headers,
        tags: { endpoint: 'plan_update_large', plan_size: 'large' },
        timeout: '30s',
      }
    );

    const duration = Date.now() - start;
    largePlanDuration.add(duration);
    updatesTotal.add(1);
    bytesUploaded.add(planContent.length);

    const success = check(res, {
      'large plan update returns 200': (r) => r.status === 200,
    });

    if (!success) {
      updatesFailed.add(1);
      console.log(`[Large Plan] Failed: ${res.status}`);
    }
  });
}

/**
 * Test with ~4.5MB plan (just under 5MB limit)
 */
function testXLargePlan(headers, projectId, planContent) {
  group('Plan Update - XLarge (~4.5MB)', function () {
    const start = Date.now();
    const res = http.put(
      `${baseUrl}/projects/${projectId}/plan`,
      JSON.stringify({ plan: planContent }),
      {
        headers,
        tags: { endpoint: 'plan_update_large', plan_size: 'xlarge' },
        timeout: '60s',
      }
    );

    const duration = Date.now() - start;
    xlargePlanDuration.add(duration);
    updatesTotal.add(1);
    bytesUploaded.add(planContent.length);

    const success = check(res, {
      'xlarge plan update returns 200': (r) => r.status === 200,
    });

    if (!success) {
      updatesFailed.add(1);
      console.log(`[XLarge Plan] Failed: ${res.status}`);
    }
  });
}

/**
 * Test over-limit plan (should be rejected)
 */
function testOverLimitPlan(headers, projectId) {
  group('Plan Update - Over Limit (>5MB)', function () {
    // Generate a 6MB plan
    const overSizePlan = 'x'.repeat(6 * 1024 * 1024);

    const res = http.put(
      `${baseUrl}/projects/${projectId}/plan`,
      JSON.stringify({ plan: overSizePlan }),
      {
        headers,
        tags: { endpoint: 'plan_update', plan_size: 'over_limit' },
        timeout: '30s',
      }
    );

    check(res, {
      'over-limit plan rejected': (r) => r.status === 413 || r.status === 400,
    });
  });
}

// Teardown
export function teardown(data) {
  if (!data || !data.projectId) return;

  const headers = authHeaders(data.auth.token);

  // Delete test project
  const deleteRes = http.del(`${baseUrl}/projects/${data.projectId}`, null, {
    headers,
  });

  if (deleteRes.status === 200) {
    console.log('[Large Plans] Cleaned up test project');
  }

  console.log('[Large Plans] Test completed');
}
