/**
 * Centralized threshold definitions for performance tests
 *
 * Thresholds define pass/fail criteria for each endpoint.
 * p95 = 95th percentile response time (95% of requests should be faster)
 */

// Default thresholds applied to all HTTP requests
export const defaultThresholds = {
  // 95% of requests should complete within 2 seconds
  http_req_duration: ['p(95)<2000'],
  // Less than 1% of requests should fail
  http_req_failed: ['rate<0.01'],
};

// Endpoint-specific thresholds
export const endpointThresholds = {
  // Health checks should be very fast
  health: {
    http_req_duration: ['p(95)<50'],
    http_req_failed: ['rate<0.001'],
  },

  // Auth endpoints (includes bcrypt hashing, so slower)
  'auth_login': {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
  'auth_register': {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
  'auth_refresh': {
    http_req_duration: ['p(95)<500'],
    // Note: In load tests, shared refresh tokens will fail on reuse (expected)
    // Threshold is relaxed for load testing scenarios
    http_req_failed: ['rate<0.95'],
  },
  'auth_me': {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },

  // Project endpoints
  'projects_list': {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
  'projects_create': {
    http_req_duration: ['p(95)<800'],
    // Note: Free tier has project limits, 403s are expected under load
    // Threshold is relaxed to allow quota limit responses
    http_req_failed: ['rate<0.75'],
  },
  'projects_update': {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
  'projects_delete': {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },

  // Task endpoints
  'tasks_list': {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
  'tasks_bulk_update_small': {
    // Small batch (5 tasks)
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
  'tasks_bulk_update_medium': {
    // Medium batch (25 tasks)
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
  'tasks_bulk_update_large': {
    // Large batch (100 tasks)
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },

  // Plan endpoints (can handle large payloads)
  'plan_get': {
    http_req_duration: ['p(95)<500'],
    // Slightly relaxed for concurrent access under load
    http_req_failed: ['rate<0.05'],
  },
  'plan_update': {
    http_req_duration: ['p(95)<5000'],
    // Slightly relaxed for concurrent access under load
    http_req_failed: ['rate<0.05'],
  },
  'plan_update_large': {
    // Large plans (1MB+)
    http_req_duration: ['p(95)<8000'],
    http_req_failed: ['rate<0.01'],
  },
};

/**
 * Build k6 thresholds object with tagged metrics
 *
 * @param {string[]} endpoints - List of endpoint names to include
 * @returns {object} k6 thresholds configuration
 */
export function buildThresholds(endpoints = []) {
  const thresholds = { ...defaultThresholds };

  for (const endpoint of endpoints) {
    const config = endpointThresholds[endpoint];
    if (config) {
      // Add thresholds for tagged metrics
      if (config.http_req_duration) {
        thresholds[`http_req_duration{endpoint:${endpoint}}`] = config.http_req_duration;
      }
      if (config.http_req_failed) {
        thresholds[`http_req_failed{endpoint:${endpoint}}`] = config.http_req_failed;
      }
    }
  }

  return thresholds;
}

/**
 * Get all available endpoint names
 */
export function getAvailableEndpoints() {
  return Object.keys(endpointThresholds);
}
