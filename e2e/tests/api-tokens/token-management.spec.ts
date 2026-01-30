import { test, expect } from '@playwright/test';
import { TokensPage } from '../../page-objects/settings/tokens.page';
import { testTokens } from '../../fixtures/test-data';

test.describe('API Token Management', () => {
  let tokensPage: TokensPage;

  test.beforeEach(async ({ page }) => {
    tokensPage = new TokensPage(page);
    await tokensPage.goto();
  });

  test('should display tokens page', async () => {
    await expect(tokensPage.pageTitle).toBeVisible();
    await expect(tokensPage.createTokenButton).toBeVisible();
  });

  test('should create a new token', async ({ page }) => {
    const token = testTokens.unique();
    const tokenValue = await tokensPage.createToken(token.name, token.expiresInDays);

    // Token should be displayed
    expect(tokenValue).toBeTruthy();
    expect(tokenValue).toContain('pf_');

    // Close dialog
    await tokensPage.closeTokenDialog();

    // Token should appear in list
    await tokensPage.expectTokenExists(token.name);
  });

  test('should create a token without expiration', async ({ page }) => {
    const tokenName = `Permanent Token ${Date.now()}`;
    const tokenValue = await tokensPage.createToken(tokenName);

    expect(tokenValue).toBeTruthy();
    await tokensPage.closeTokenDialog();
    await tokensPage.expectTokenExists(tokenName);
  });

  test('should copy token to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const token = testTokens.unique();
    await tokensPage.createToken(token.name, token.expiresInDays);

    // Copy token
    await tokensPage.copyToken();

    // Check clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('pf_');
  });

  test('should delete a token', async ({ page }) => {
    // Create a token first
    const token = testTokens.unique();
    await tokensPage.createToken(token.name, token.expiresInDays);
    await tokensPage.closeTokenDialog();
    await tokensPage.expectTokenExists(token.name);

    // Delete the token
    await tokensPage.deleteToken(token.name);

    // Token should not exist
    await tokensPage.expectTokenNotExists(token.name);
  });

  test('should cancel token creation', async ({ page }) => {
    await tokensPage.openCreateDialog();
    await tokensPage.tokenNameInput.fill('Should Not Create');
    await tokensPage.cancelButton.click();

    await expect(tokensPage.createDialog).not.toBeVisible();
    await tokensPage.expectTokenNotExists('Should Not Create');
  });
});
