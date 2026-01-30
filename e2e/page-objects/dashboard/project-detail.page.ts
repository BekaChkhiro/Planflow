import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Project detail page object
 * Maps to: apps/web/src/app/dashboard/projects/[id]/page.tsx
 */
export class ProjectDetailPage extends BasePage {
  // Header elements
  readonly projectName: Locator;
  readonly backButton: Locator;
  readonly menuButton: Locator;

  // Tabs
  readonly overviewTab: Locator;
  readonly planTab: Locator;
  readonly tasksTab: Locator;

  // Overview stats
  readonly totalTasksStat: Locator;
  readonly completedTasksStat: Locator;
  readonly inProgressTasksStat: Locator;
  readonly todoTasksStat: Locator;

  // View controls
  readonly kanbanViewButton: Locator;
  readonly listViewButton: Locator;
  readonly statusFilter: Locator;
  readonly phaseFilter: Locator;

  // Task elements
  readonly taskCards: Locator;
  readonly kanbanColumns: Locator;
  readonly taskList: Locator;

  // Edit dialog
  readonly editDialog: Locator;
  readonly editNameInput: Locator;
  readonly editDescriptionInput: Locator;
  readonly editSaveButton: Locator;
  readonly editCancelButton: Locator;

  // Delete dialog
  readonly deleteDialog: Locator;
  readonly deleteConfirmButton: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.projectName = page.locator('h1').first();
    this.backButton = page.getByRole('link', { name: /back|projects/i });
    this.menuButton = page.getByRole('button', { name: /more|menu/i });

    // Tabs
    this.overviewTab = page.getByRole('tab', { name: 'Overview' });
    this.planTab = page.getByRole('tab', { name: 'Plan' });
    this.tasksTab = page.getByRole('tab', { name: 'Tasks' });

    // Stats
    this.totalTasksStat = page.locator('[data-testid="total-tasks"]');
    this.completedTasksStat = page.locator('[data-testid="completed-tasks"]');
    this.inProgressTasksStat = page.locator('[data-testid="in-progress-tasks"]');
    this.todoTasksStat = page.locator('[data-testid="todo-tasks"]');

    // Views
    this.kanbanViewButton = page.getByRole('button', { name: /kanban/i });
    this.listViewButton = page.getByRole('button', { name: /list/i });
    this.statusFilter = page.getByRole('combobox', { name: /status/i });
    this.phaseFilter = page.getByRole('combobox', { name: /phase/i });

    // Tasks
    this.taskCards = page.locator('[data-testid="task-card"]');
    this.kanbanColumns = page.locator('[data-testid="kanban-column"]');
    this.taskList = page.locator('[data-testid="task-list"]');

    // Edit dialog
    this.editDialog = page.getByRole('dialog');
    this.editNameInput = page.getByLabel('Project Name');
    this.editDescriptionInput = page.getByLabel('Description');
    this.editSaveButton = page.getByRole('button', { name: 'Save' });
    this.editCancelButton = page.getByRole('button', { name: 'Cancel' });

    // Delete dialog
    this.deleteDialog = page.getByRole('alertdialog');
    this.deleteConfirmButton = page.getByRole('button', { name: 'Delete' });
  }

  async goto(projectId?: string): Promise<void> {
    if (projectId) {
      await this.page.goto(`/dashboard/projects/${projectId}`);
    }
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    await expect(this.projectName).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get project ID from URL
   */
  getProjectId(): string {
    const url = this.page.url();
    const match = url.match(/\/projects\/([^/]+)/);
    return match?.[1] ?? '';
  }

  /**
   * Switch to a specific tab
   */
  async switchToTab(tab: 'overview' | 'plan' | 'tasks'): Promise<void> {
    const tabMap = {
      overview: this.overviewTab,
      plan: this.planTab,
      tasks: this.tasksTab,
    };
    await tabMap[tab].click();
  }

  /**
   * Switch to kanban view
   */
  async switchToKanbanView(): Promise<void> {
    await this.kanbanViewButton.click();
    await expect(this.kanbanColumns.first()).toBeVisible();
  }

  /**
   * Switch to list view
   */
  async switchToListView(): Promise<void> {
    await this.listViewButton.click();
    await expect(this.taskList).toBeVisible();
  }

  /**
   * Filter tasks by status
   */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: status }).click();
  }

  /**
   * Filter tasks by phase
   */
  async filterByPhase(phase: string): Promise<void> {
    await this.phaseFilter.click();
    await this.page.getByRole('option', { name: phase }).click();
  }

  /**
   * Open project menu
   */
  async openMenu(): Promise<void> {
    await this.menuButton.click();
  }

  /**
   * Open edit dialog
   */
  async openEditDialog(): Promise<void> {
    await this.openMenu();
    await this.page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(this.editDialog).toBeVisible();
  }

  /**
   * Edit project details
   */
  async editProject(name?: string, description?: string): Promise<void> {
    await this.openEditDialog();
    if (name) {
      await this.editNameInput.clear();
      await this.editNameInput.fill(name);
    }
    if (description) {
      await this.editDescriptionInput.clear();
      await this.editDescriptionInput.fill(description);
    }
    await this.editSaveButton.click();
    await expect(this.editDialog).not.toBeVisible();
  }

  /**
   * Delete project
   */
  async deleteProject(): Promise<void> {
    await this.openMenu();
    await this.page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(this.deleteDialog).toBeVisible();
    await this.deleteConfirmButton.click();
    await expect(this.page).toHaveURL('/dashboard/projects');
  }

  /**
   * Go back to projects list
   */
  async goBackToProjects(): Promise<void> {
    await this.backButton.click();
    await expect(this.page).toHaveURL('/dashboard/projects');
  }

  /**
   * Expect project name
   */
  async expectProjectName(name: string): Promise<void> {
    await expect(this.projectName).toContainText(name);
  }

  /**
   * Expect task count
   */
  async expectTaskCount(count: number): Promise<void> {
    await expect(this.taskCards).toHaveCount(count);
  }
}
