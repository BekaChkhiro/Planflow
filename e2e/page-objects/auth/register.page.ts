import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Register page object
 * Maps to: apps/web/src/app/(auth)/register/page.tsx
 */
export class RegisterPage extends BasePage {
  // Form elements
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;

  // Error elements
  readonly formError: Locator;
  readonly fieldErrors: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.getByLabel('Name');
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.submitButton = page.getByRole('button', { name: 'Create account' });
    this.loginLink = page.getByRole('link', { name: /sign in/i });
    this.formError = page.locator('[role="alert"]');
    this.fieldErrors = page.locator('[data-field-error]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
    await expect(this.nameInput).toBeVisible();
  }

  /**
   * Fill registration form
   */
  async fillForm(
    name: string,
    email: string,
    password: string,
    confirmPassword?: string
  ): Promise<void> {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword ?? password);
  }

  /**
   * Submit registration form
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Fill and submit registration form
   */
  async register(
    name: string,
    email: string,
    password: string,
    confirmPassword?: string
  ): Promise<void> {
    await this.fillForm(name, email, password, confirmPassword);
    await this.submit();
  }

  /**
   * Expect successful registration (redirects to login with success param)
   */
  async expectRegistrationSuccess(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login\?registered=true/, { timeout: 10000 });
  }

  /**
   * Expect registration error
   */
  async expectRegistrationError(message?: string): Promise<void> {
    await expect(this.formError).toBeVisible();
    if (message) {
      await expect(this.formError).toContainText(message);
    }
  }

  /**
   * Expect password mismatch error
   */
  async expectPasswordMismatchError(): Promise<void> {
    const errorText = this.page.locator('text=Passwords do not match');
    await expect(errorText).toBeVisible();
  }

  /**
   * Expect password too short error
   */
  async expectPasswordTooShortError(): Promise<void> {
    const errorText = this.page.locator('text=at least 8 characters');
    await expect(errorText).toBeVisible();
  }

  /**
   * Navigate to login page
   */
  async goToLogin(): Promise<void> {
    await this.loginLink.click();
    await expect(this.page).toHaveURL('/login');
  }
}
