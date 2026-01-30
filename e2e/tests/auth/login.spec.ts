import { test, expect } from '@playwright/test';
import { LoginPage } from '../../page-objects/auth/login.page';
import { testUsers } from '../../fixtures/test-data';

test.describe('Login', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // No auth for login tests

  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should display login form', async () => {
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.registerLink).toBeVisible();
  });

  test('should login with valid credentials', async () => {
    await loginPage.login(testUsers.standard.email, testUsers.standard.password);
    await loginPage.expectLoginSuccess();
  });

  test('should show error with invalid credentials', async () => {
    await loginPage.login('wrong@email.com', 'wrongpassword');
    await loginPage.expectLoginError();
  });

  test('should show error with invalid email format', async ({ page }) => {
    await loginPage.emailInput.fill('invalid-email');
    await loginPage.passwordInput.fill('password123');
    await loginPage.submitButton.click();

    // Should show validation error
    await expect(page.locator('text=email')).toBeVisible();
  });

  test('should show error with empty password', async ({ page }) => {
    await loginPage.emailInput.fill(testUsers.standard.email);
    await loginPage.submitButton.click();

    // Should show validation error
    await expect(page.locator('text=required')).toBeVisible();
  });

  test('should preserve return URL after login', async ({ page }) => {
    await loginPage.gotoWithReturnUrl('/dashboard/settings/tokens');
    await loginPage.login(testUsers.standard.email, testUsers.standard.password);
    await loginPage.expectRedirectTo('/dashboard/settings/tokens');
  });

  test('should navigate to registration page', async () => {
    await loginPage.goToRegister();
  });

  test('should show success message after registration redirect', async ({ page }) => {
    // Simulate registration redirect
    await page.goto('/login?registered=true');
    await loginPage.expectRegistrationSuccessMessage();
  });
});
