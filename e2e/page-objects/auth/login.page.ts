import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Login page object
 * Maps to: apps/web/src/app/(auth)/login/page.tsx
 */
export class LoginPage extends BasePage {
  // Form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;

  // Error/success elements
  readonly formError: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.registerLink = page.getByRole('link', { name: /sign up/i });
    this.formError = page.locator('[role="alert"]');
    this.successMessage = page.locator('text=Welcome back');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.emailInput).toBeVisible();
  }

  async gotoWithReturnUrl(returnUrl: string): Promise<void> {
    await this.page.goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    await expect(this.emailInput).toBeVisible();
  }

  /**
   * Fill and submit login form
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /**
   * Expect successful login (redirects to dashboard)
   */
  async expectLoginSuccess(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  }

  /**
   * Expect login to redirect to specific URL
   */
  async expectRedirectTo(url: string): Promise<void> {
    await expect(this.page).toHaveURL(url, { timeout: 10000 });
  }

  /**
   * Expect login error message
   */
  async expectLoginError(message?: string): Promise<void> {
    await expect(this.formError).toBeVisible();
    if (message) {
      await expect(this.formError).toContainText(message);
    }
  }

  /**
   * Expect registration success message (shown after redirect from register)
   */
  async expectRegistrationSuccessMessage(): Promise<void> {
    await expect(this.page.locator('text=Account created')).toBeVisible();
  }

  /**
   * Navigate to registration page
   */
  async goToRegister(): Promise<void> {
    await this.registerLink.click();
    await expect(this.page).toHaveURL('/register');
  }
}
