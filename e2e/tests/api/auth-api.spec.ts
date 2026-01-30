import { test, expect } from '@playwright/test';
import { testUsers, AuthResponse } from '../../fixtures/test-data';

const API_URL = process.env.API_URL || 'http://localhost:3001';

test.describe('Auth API', () => {
  test.describe('POST /auth/register', () => {
    test('should register a new user', async ({ request }) => {
      const newUser = testUsers.newUser();

      const response = await request.post(`${API_URL}/auth/register`, {
        data: newUser,
      });

      expect(response.status()).toBe(200);

      const data: AuthResponse = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.user.email).toBe(newUser.email);
      expect(data.data?.token).toBeTruthy();
      expect(data.data?.refreshToken).toBeTruthy();
    });

    test('should reject registration with existing email', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: testUsers.standard,
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('already');
    });

    test('should reject registration with invalid email', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: {
          name: 'Test User',
          email: 'invalid-email',
          password: 'password123',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject registration without required fields', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: {
          email: 'test@example.com',
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('POST /auth/login', () => {
    test('should login with valid credentials', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: testUsers.standard.email,
          password: testUsers.standard.password,
        },
      });

      expect(response.status()).toBe(200);

      const data: AuthResponse = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.user.email).toBe(testUsers.standard.email);
      expect(data.data?.token).toBeTruthy();
      expect(data.data?.refreshToken).toBeTruthy();
      expect(data.data?.expiresIn).toBeGreaterThan(0);
    });

    test('should reject login with invalid password', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: testUsers.standard.email,
          password: 'wrongpassword',
        },
      });

      expect(response.status()).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should reject login with non-existent email', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('POST /auth/refresh', () => {
    test('should refresh token with valid refresh token', async ({ request }) => {
      // First, login to get tokens
      const loginResponse = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: testUsers.standard.email,
          password: testUsers.standard.password,
        },
      });

      const loginData: AuthResponse = await loginResponse.json();
      const refreshToken = loginData.data?.refreshToken;

      // Refresh the token
      const response = await request.post(`${API_URL}/auth/refresh`, {
        data: { refreshToken },
      });

      expect(response.status()).toBe(200);

      const data: AuthResponse = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.token).toBeTruthy();
    });

    test('should reject invalid refresh token', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/refresh`, {
        data: { refreshToken: 'invalid-token' },
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('GET /auth/me', () => {
    test('should return current user with valid token', async ({ request }) => {
      // Login first
      const loginResponse = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: testUsers.standard.email,
          password: testUsers.standard.password,
        },
      });

      const loginData: AuthResponse = await loginResponse.json();
      const token = loginData.data?.token;

      // Get current user
      const response = await request.get(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.email).toBe(testUsers.standard.email);
    });

    test('should reject request without token', async ({ request }) => {
      const response = await request.get(`${API_URL}/auth/me`);
      expect(response.status()).toBe(401);
    });

    test('should reject request with invalid token', async ({ request }) => {
      const response = await request.get(`${API_URL}/auth/me`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(response.status()).toBe(401);
    });
  });
});
