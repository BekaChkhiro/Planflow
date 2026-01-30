import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { testUsers, AuthResponse } from './test-data';

const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * Extended test fixtures for authenticated tests
 */
export type AuthFixtures = {
  authenticatedPage: Page;
  authenticatedContext: BrowserContext;
  authToken: string;
  apiToken: string;
};

/**
 * Login helper function
 */
export async function loginUser(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Get auth token via API
 */
export async function getAuthToken(
  email: string,
  password: string
): Promise<string> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data: AuthResponse = await response.json();
  if (!data.success || !data.data?.token) {
    throw new Error(`Failed to get auth token: ${data.error}`);
  }

  return data.data.token;
}

/**
 * Create API token via API
 */
export async function createApiToken(
  authToken: string,
  name: string = 'E2E Test Token',
  expiresInDays?: number
): Promise<string> {
  const response = await fetch(`${API_URL}/api-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ name, expiresInDays }),
  });

  const data = await response.json();
  if (!data.success || !data.data?.token) {
    throw new Error(`Failed to create API token: ${data.error}`);
  }

  return data.data.token;
}

/**
 * Extended test with auth fixtures
 */
export const test = base.extend<AuthFixtures>({
  authenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    await use(context);
    await context.close();
  },

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },

  authToken: async ({}, use) => {
    const token = await getAuthToken(
      testUsers.standard.email,
      testUsers.standard.password
    );
    await use(token);
  },

  apiToken: async ({ authToken }, use) => {
    const token = await createApiToken(authToken, `E2E Token ${Date.now()}`);
    await use(token);
  },
});

export { expect } from '@playwright/test';
