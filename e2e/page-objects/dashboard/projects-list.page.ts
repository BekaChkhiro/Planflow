import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Projects list page object
 * Maps to: apps/web/src/app/dashboard/projects/page.tsx
 */
export class ProjectsListPage extends BasePage {
  // Page elements
  readonly pageTitle: Locator;
  readonly newProjectButton: Locator;
  readonly projectCards: Locator;
  readonly emptyState: Locator;
  readonly loadingSkeletons: Locator;

  // Create project dialog
  readonly createDialog: Locator;
  readonly projectNameInput: Locator;
  readonly projectDescriptionInput: Locator;
  readonly cancelButton: Locator;
  readonly createButton: Locator;

  // Delete confirmation dialog
  readonly deleteDialog: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { name: 'Projects' });
    this.newProjectButton = page.getByRole('button', { name: 'New Project' });
    this.projectCards = page.locator('[data-testid="project-card"]');
    this.emptyState = page.locator('text=No projects yet');
    this.loadingSkeletons = page.locator('[data-testid="skeleton"]');

    // Dialog elements
    this.createDialog = page.getByRole('dialog');
    this.projectNameInput = page.getByLabel('Project Name');
    this.projectDescriptionInput = page.getByLabel('Description');
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.createButton = page.getByRole('button', { name: 'Create Project' });

    // Delete dialog
    this.deleteDialog = page.getByRole('alertdialog');
    this.deleteConfirmButton = page.getByRole('button', { name: 'Delete' });
    this.deleteCancelButton = page.getByRole('button', { name: 'Cancel' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/projects');
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    // Wait for either projects to load or empty state
    await Promise.race([
      this.projectCards.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      this.emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      this.newProjectButton.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Open create project dialog
   */
  async openCreateDialog(): Promise<void> {
    await this.newProjectButton.click();
    await expect(this.createDialog).toBeVisible();
  }

  /**
   * Create a new project
   */
  async createProject(name: string, description?: string): Promise<void> {
    await this.openCreateDialog();
    await this.projectNameInput.fill(name);
    if (description) {
      await this.projectDescriptionInput.fill(description);
    }
    await this.createButton.click();
    await expect(this.createDialog).not.toBeVisible({ timeout: 10000 });
  }

  /**
   * Get project card by name
   */
  getProjectCard(name: string): Locator {
    return this.page.locator(`[data-testid="project-card"]:has-text("${name}")`);
  }

  /**
   * Click on a project to view details
   */
  async viewProject(name: string): Promise<void> {
    await this.getProjectCard(name).click();
    await expect(this.page).toHaveURL(/\/dashboard\/projects\/[^/]+$/);
  }

  /**
   * Open project dropdown menu
   */
  async openProjectMenu(name: string): Promise<void> {
    const card = this.getProjectCard(name);
    await card.getByRole('button', { name: /more/i }).click();
  }

  /**
   * Delete a project
   */
  async deleteProject(name: string): Promise<void> {
    await this.openProjectMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(this.deleteDialog).toBeVisible();
    await this.deleteConfirmButton.click();
    await expect(this.deleteDialog).not.toBeVisible();
  }

  /**
   * Expect specific number of projects
   */
  async expectProjectCount(count: number): Promise<void> {
    if (count === 0) {
      await expect(this.emptyState).toBeVisible();
    } else {
      await expect(this.projectCards).toHaveCount(count);
    }
  }

  /**
   * Expect project to exist in list
   */
  async expectProjectExists(name: string): Promise<void> {
    await expect(this.getProjectCard(name)).toBeVisible();
  }

  /**
   * Expect project to not exist in list
   */
  async expectProjectNotExists(name: string): Promise<void> {
    await expect(this.getProjectCard(name)).not.toBeVisible();
  }

  /**
   * Expect project limit error (free tier)
   */
  async expectProjectLimitError(): Promise<void> {
    await expect(this.page.locator('text=project limit')).toBeVisible();
  }
}
