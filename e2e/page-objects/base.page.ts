import { Page, Locator, expect } from '@playwright/test';

/**
 * Base page object with common functionality
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Navigate to the page
   */
  abstract goto(): Promise<void>;

  /**
   * Wait for page to be fully loaded
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get toast notification
   */
  getToast(): Locator {
    return this.page.locator('[data-sonner-toast]').first();
  }

  /**
   * Expect success toast with message
   */
  async expectSuccessToast(message?: string): Promise<void> {
    const toast = this.getToast();
    await expect(toast).toBeVisible();
    if (message) {
      await expect(toast).toContainText(message);
    }
  }

  /**
   * Expect error toast with message
   */
  async expectErrorToast(message?: string): Promise<void> {
    const toast = this.getToast();
    await expect(toast).toBeVisible();
    if (message) {
      await expect(toast).toContainText(message);
    }
  }

  /**
   * Click user menu in header
   */
  async openUserMenu(): Promise<void> {
    await this.page.getByRole('button', { name: /avatar/i }).click();
  }

  /**
   * Logout via user menu
   */
  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(this.page).toHaveURL('/login');
  }

  /**
   * Navigate to settings
   */
  async goToSettings(): Promise<void> {
    await this.openUserMenu();
    await this.page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(this.page).toHaveURL(/\/dashboard\/settings/);
  }

  /**
   * Navigate to profile
   */
  async goToProfile(): Promise<void> {
    await this.openUserMenu();
    await this.page.getByRole('menuitem', { name: 'Profile' }).click();
    await expect(this.page).toHaveURL(/\/dashboard\/settings\/profile/);
  }
}
