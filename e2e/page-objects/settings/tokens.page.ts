import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * API Tokens settings page object
 * Maps to: apps/web/src/app/dashboard/settings/tokens/page.tsx
 */
export class TokensPage extends BasePage {
  // Page elements
  readonly pageTitle: Locator;
  readonly createTokenButton: Locator;
  readonly tokenList: Locator;
  readonly tokenItems: Locator;
  readonly emptyState: Locator;

  // Create token dialog
  readonly createDialog: Locator;
  readonly tokenNameInput: Locator;
  readonly expirationInput: Locator;
  readonly createSubmitButton: Locator;
  readonly cancelButton: Locator;

  // Token success dialog
  readonly tokenValueDisplay: Locator;
  readonly copyButton: Locator;
  readonly doneButton: Locator;

  // Delete dialog
  readonly deleteDialog: Locator;
  readonly deleteConfirmButton: Locator;

  constructor(page: Page) {
    super(page);

    // Page elements
    this.pageTitle = page.getByRole('heading', { name: 'API Tokens' });
    this.createTokenButton = page.getByRole('button', { name: 'Create Token' });
    this.tokenList = page.locator('[data-testid="token-list"]');
    this.tokenItems = page.locator('[data-testid="token-item"]');
    this.emptyState = page.locator('text=No API tokens');

    // Create dialog
    this.createDialog = page.getByRole('dialog');
    this.tokenNameInput = page.getByLabel('Token Name');
    this.expirationInput = page.getByLabel(/expires|expiration/i);
    this.createSubmitButton = this.createDialog.getByRole('button', { name: 'Create Token' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });

    // Token display
    this.tokenValueDisplay = page.locator('code, [data-testid="token-value"]');
    this.copyButton = page.getByRole('button', { name: 'Copy' });
    this.doneButton = page.getByRole('button', { name: 'Done' });

    // Delete dialog
    this.deleteDialog = page.getByRole('alertdialog');
    this.deleteConfirmButton = this.deleteDialog.getByRole('button', { name: 'Delete' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/settings/tokens');
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 });
  }

  /**
   * Open create token dialog
   */
  async openCreateDialog(): Promise<void> {
    await this.createTokenButton.click();
    await expect(this.createDialog).toBeVisible();
  }

  /**
   * Create a new token
   * @returns The token value if visible
   */
  async createToken(name: string, expiresInDays?: number): Promise<string | null> {
    await this.openCreateDialog();
    await this.tokenNameInput.fill(name);

    if (expiresInDays !== undefined) {
      await this.expirationInput.fill(expiresInDays.toString());
    }

    await this.createSubmitButton.click();

    // Wait for token to be displayed
    await expect(this.tokenValueDisplay).toBeVisible({ timeout: 10000 });

    // Get token value
    const tokenValue = await this.tokenValueDisplay.textContent();

    return tokenValue;
  }

  /**
   * Copy token to clipboard
   */
  async copyToken(): Promise<void> {
    await this.copyButton.click();
    await this.expectSuccessToast('Copied');
  }

  /**
   * Close token success dialog
   */
  async closeTokenDialog(): Promise<void> {
    await this.doneButton.click();
    await expect(this.tokenValueDisplay).not.toBeVisible();
  }

  /**
   * Get token item by name
   */
  getTokenItem(name: string): Locator {
    return this.page.locator(`[data-testid="token-item"]:has-text("${name}")`);
  }

  /**
   * Delete a token
   */
  async deleteToken(name: string): Promise<void> {
    const tokenItem = this.getTokenItem(name);
    await tokenItem.getByRole('button', { name: /delete|trash/i }).click();
    await expect(this.deleteDialog).toBeVisible();
    await this.deleteConfirmButton.click();
    await expect(this.deleteDialog).not.toBeVisible();
  }

  /**
   * Expect token to exist in list
   */
  async expectTokenExists(name: string): Promise<void> {
    await expect(this.getTokenItem(name)).toBeVisible();
  }

  /**
   * Expect token to not exist in list
   */
  async expectTokenNotExists(name: string): Promise<void> {
    await expect(this.getTokenItem(name)).not.toBeVisible();
  }

  /**
   * Expect token count
   */
  async expectTokenCount(count: number): Promise<void> {
    if (count === 0) {
      await expect(this.emptyState).toBeVisible();
    } else {
      await expect(this.tokenItems).toHaveCount(count);
    }
  }

  /**
   * Expect token to show as expired
   */
  async expectTokenExpired(name: string): Promise<void> {
    const tokenItem = this.getTokenItem(name);
    await expect(tokenItem.locator('text=Expired')).toBeVisible();
  }
}
