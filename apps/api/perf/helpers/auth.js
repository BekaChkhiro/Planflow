/**
 * Authentication helpers for performance tests
 */

import http from 'k6/http';
import { check } from 'k6';
import { baseUrl } from '../config/environments.js';

/**
 * Login and get JWT token
 *
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {{ token: string, refreshToken: string, userId: string } | null}
 */
export function login(email, password) {
  const res = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth_login' },
    }
  );

  const success = check(res, {
    'login succeeded': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data?.token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    console.error(`Login failed for ${email}: ${res.status} - ${res.body}`);
    return null;
  }

  const body = JSON.parse(res.body);
  return {
    token: body.data.token,
    refreshToken: body.data.refreshToken,
    userId: body.data.user.id,
  };
}

/**
 * Refresh JWT token
 *
 * @param {string} refreshToken - Current refresh token
 * @returns {{ token: string } | null}
 */
export function refresh(refreshToken) {
  const res = http.post(
    `${baseUrl}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth_refresh' },
    }
  );

  if (res.status !== 200) {
    console.error(`Token refresh failed: ${res.status} - ${res.body}`);
    return null;
  }

  const body = JSON.parse(res.body);
  return { token: body.data.token };
}

/**
 * Get authenticated headers
 *
 * @param {string} token - JWT token
 * @returns {object} Headers object with Authorization
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Setup function to login and return auth data
 * Use this in k6 setup() function
 *
 * @param {object} user - User credentials { email, password }
 * @returns {object} Auth data for use in VU code
 */
export function setupAuth(user) {
  const auth = login(user.email, user.password);

  if (!auth) {
    throw new Error(`Failed to authenticate as ${user.email}`);
  }

  console.log(`[Setup] Authenticated as ${user.email}`);
  return auth;
}

/**
 * Get current user info
 *
 * @param {string} token - JWT token
 * @returns {object | null} User data
 */
export function getCurrentUser(token) {
  const res = http.get(`${baseUrl}/auth/me`, {
    headers: authHeaders(token),
    tags: { endpoint: 'auth_me' },
  });

  if (res.status !== 200) {
    return null;
  }

  const body = JSON.parse(res.body);
  return body.data?.user || null;
}
