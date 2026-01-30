/**
 * Endpoint Test: Authentication
 *
 * Purpose: Test auth endpoints under load
 * Endpoints: POST /auth/login, POST /auth/register, POST /auth/refresh, GET /auth/me
 *
 * Usage:
 *   k6 run perf/tests/endpoints/auth.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { baseUrl, testUser } from '../../config/environments.js';
import { buildThresholds } from '../../config/thresholds.js';
import { login, authHeaders, refresh } from '../../helpers/auth.js';
import { generateUser } from '../../helpers/data-generators.js';

// Custom metrics
const loginDuration = new Trend('auth_login_duration');
const refreshDuration = new Trend('auth_refresh_duration');
const meDuration = new Trend('auth_me_duration');
const authFailures = new Counter('auth_failures');

// Test configuration
export const options = {
  scenarios: {
    // Concurrent login attempts
    login_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 5 },
      ],
      tags: { test: 'login' },
    },
    // Token refresh cycles
    refresh_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      startTime: '30s',
      tags: { test: 'refresh' },
    },
    // Get current user calls
    me_load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      startTime: '30s',
      tags: { test: 'me' },
    },
  },
  thresholds: {
    ...buildThresholds(['auth_login', 'auth_refresh', 'auth_me']),
    'auth_login_duration': ['p(95)<1500'],
    'auth_refresh_duration': ['p(95)<500'],
    'auth_me_duration': ['p(95)<300'],
    'auth_failures': ['count<50'],
  },
};

// Shared auth data
let sharedAuth = null;

// Setup
export function setup() {
  console.log('[Auth Test] Starting authentication test...');

  // Login to get tokens for refresh and me tests
  const auth = login(testUser.email, testUser.password);
  if (!auth) {
    throw new Error('Failed to authenticate test user');
  }

  return { auth };
}

// Main test function
export default function (data) {
  const scenario = __ENV.K6_SCENARIO || 'login_load';

  if (scenario === 'login_load') {
    testLogin();
  } else if (scenario === 'refresh_load') {
    testRefresh(data.auth);
  } else if (scenario === 'me_load') {
    testMe(data.auth);
  }

  sleep(0.5);
}

/**
 * Test login endpoint
 */
function testLogin() {
  group('Auth - Login', function () {
    const start = Date.now();

    const res = http.post(
      `${baseUrl}/auth/login`,
      JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'auth_login' },
      }
    );

    loginDuration.add(Date.now() - start);

    const success = check(res, {
      'login returns 200': (r) => r.status === 200,
      'login has token': (r) => {
        try {
          return JSON.parse(r.body).data?.token !== undefined;
        } catch {
          return false;
        }
      },
      'login has refresh token': (r) => {
        try {
          return JSON.parse(r.body).data?.refreshToken !== undefined;
        } catch {
          return false;
        }
      },
      'login has user data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data?.user?.id && body.data?.user?.email;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      authFailures.add(1);
    }
  });
}

/**
 * Test invalid login (should fail gracefully)
 */
function testInvalidLogin() {
  group('Auth - Invalid Login', function () {
    const res = http.post(
      `${baseUrl}/auth/login`,
      JSON.stringify({
        email: 'invalid@example.com',
        password: 'wrongpassword',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'auth_login_invalid' },
      }
    );

    check(res, {
      'invalid login returns 401': (r) => r.status === 401,
      'invalid login has error': (r) => {
        try {
          return JSON.parse(r.body).error !== undefined;
        } catch {
          return false;
        }
      },
    });
  });
}

/**
 * Test token refresh
 */
function testRefresh(auth) {
  group('Auth - Refresh Token', function () {
    const start = Date.now();

    const res = http.post(
      `${baseUrl}/auth/refresh`,
      JSON.stringify({ refreshToken: auth.refreshToken }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'auth_refresh' },
      }
    );

    refreshDuration.add(Date.now() - start);

    const success = check(res, {
      'refresh returns 200': (r) => r.status === 200,
      'refresh has new token': (r) => {
        try {
          return JSON.parse(r.body).data?.token !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      authFailures.add(1);
    }
  });
}

/**
 * Test get current user
 */
function testMe(auth) {
  group('Auth - Get Current User', function () {
    const start = Date.now();

    const res = http.get(`${baseUrl}/auth/me`, {
      headers: authHeaders(auth.token),
      tags: { endpoint: 'auth_me' },
    });

    meDuration.add(Date.now() - start);

    const success = check(res, {
      'me returns 200': (r) => r.status === 200,
      'me has user id': (r) => {
        try {
          return JSON.parse(r.body).data?.user?.id !== undefined;
        } catch {
          return false;
        }
      },
      'me has user email': (r) => {
        try {
          return JSON.parse(r.body).data?.user?.email !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      authFailures.add(1);
    }
  });
}

/**
 * Test unauthorized access
 */
function testUnauthorized() {
  group('Auth - Unauthorized', function () {
    // No token
    const noTokenRes = http.get(`${baseUrl}/auth/me`, {
      tags: { endpoint: 'auth_me_unauthorized' },
    });

    check(noTokenRes, {
      'no token returns 401': (r) => r.status === 401,
    });

    // Invalid token
    const invalidTokenRes = http.get(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Bearer invalid_token' },
      tags: { endpoint: 'auth_me_unauthorized' },
    });

    check(invalidTokenRes, {
      'invalid token returns 401': (r) => r.status === 401,
    });
  });
}

// Teardown
export function teardown(data) {
  console.log('[Auth Test] Completed');
}
