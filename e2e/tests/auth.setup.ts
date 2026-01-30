import { test as setup, expect } from '@playwright/test';
import { testUsers } from '../fixtures/test-data';

const authFile = 'e2e/.auth/user.json';

/**
 * Setup: Authenticate and save storage state
 * This runs once before all browser tests
 */
setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Fill in credentials
  await page.getByLabel('Email').fill(testUsers.standard.email);
  await page.getByLabel('Password').fill(testUsers.standard.password);

  // Submit login form
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

  // Save storage state (includes cookies and localStorage)
  await page.context().storageState({ path: authFile });
});
