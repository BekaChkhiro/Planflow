import { test, expect } from '@playwright/test';
import { RegisterPage } from '../../page-objects/auth/register.page';
import { testUsers } from '../../fixtures/test-data';

test.describe('Registration', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // No auth for register tests

  let registerPage: RegisterPage;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    await registerPage.goto();
  });

  test('should display registration form', async () => {
    await expect(registerPage.nameInput).toBeVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
    await expect(registerPage.confirmPasswordInput).toBeVisible();
    await expect(registerPage.submitButton).toBeVisible();
    await expect(registerPage.loginLink).toBeVisible();
  });

  test('should register new user successfully', async () => {
    const newUser = testUsers.newUser();
    await registerPage.register(
      newUser.name,
      newUser.email,
      newUser.password,
      newUser.password
    );
    await registerPage.expectRegistrationSuccess();
  });

  test('should show error when passwords do not match', async () => {
    const newUser = testUsers.newUser();
    await registerPage.register(
      newUser.name,
      newUser.email,
      newUser.password,
      'differentpassword'
    );
    await registerPage.expectPasswordMismatchError();
  });

  test('should show error when password is too short', async () => {
    const newUser = testUsers.newUser();
    await registerPage.register(newUser.name, newUser.email, 'short', 'short');
    await registerPage.expectPasswordTooShortError();
  });

  test('should show error when email already exists', async () => {
    await registerPage.register(
      testUsers.standard.name,
      testUsers.standard.email,
      testUsers.standard.password,
      testUsers.standard.password
    );
    await registerPage.expectRegistrationError('already');
  });

  test('should show error for invalid email format', async ({ page }) => {
    await registerPage.fillForm('Test User', 'invalid-email', 'password123');
    await registerPage.submit();
    await expect(page.locator('text=email')).toBeVisible();
  });

  test('should show error when name is empty', async ({ page }) => {
    const newUser = testUsers.newUser();
    await registerPage.emailInput.fill(newUser.email);
    await registerPage.passwordInput.fill(newUser.password);
    await registerPage.confirmPasswordInput.fill(newUser.password);
    await registerPage.submit();
    await expect(page.locator('text=required')).toBeVisible();
  });

  test('should navigate to login page', async () => {
    await registerPage.goToLogin();
  });
});
