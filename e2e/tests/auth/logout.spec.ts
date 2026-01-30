import { test, expect } from '@playwright/test';
import { testUsers } from '../../fixtures/test-data';
import { LoginPage } from '../../page-objects/auth/login.page';

test.describe('Logout', () => {
  test('should logout and redirect to login page', async ({ page }) => {
    // Start at dashboard (using authenticated state from setup)
    await page.goto('/dashboard/projects');
    await expect(page).toHaveURL(/\/dashboard/);

    // Open user menu and click logout
    await page.getByRole('button', { name: /avatar/i }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should clear auth state after logout', async ({ page }) => {
    // Start at dashboard
    await page.goto('/dashboard/projects');
    await expect(page).toHaveURL(/\/dashboard/);

    // Logout
    await page.getByRole('button', { name: /avatar/i }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');

    // Try to access protected page
    await page.goto('/dashboard/projects');

    // Should redirect back to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should allow re-login after logout', async ({ page }) => {
    // Start at dashboard
    await page.goto('/dashboard/projects');

    // Logout
    await page.getByRole('button', { name: /avatar/i }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');

    // Re-login
    const loginPage = new LoginPage(page);
    await loginPage.login(testUsers.standard.email, testUsers.standard.password);
    await loginPage.expectLoginSuccess();
  });
});
