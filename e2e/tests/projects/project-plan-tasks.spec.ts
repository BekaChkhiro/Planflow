import { test, expect } from '@playwright/test';
import { ProjectsListPage } from '../../page-objects/dashboard/projects-list.page';
import { ProjectDetailPage } from '../../page-objects/dashboard/project-detail.page';
import { testProjects } from '../../fixtures/test-data';

test.describe('Project Plan and Tasks', () => {
  let projectsListPage: ProjectsListPage;
  let projectDetailPage: ProjectDetailPage;

  test.beforeEach(async ({ page }) => {
    projectsListPage = new ProjectsListPage(page);
    projectDetailPage = new ProjectDetailPage(page);

    // Create a test project
    await projectsListPage.goto();
    const project = testProjects.unique();
    await projectsListPage.createProject(project.name, project.description);
    await projectsListPage.viewProject(project.name);
  });

  test('should display all tabs', async () => {
    await expect(projectDetailPage.overviewTab).toBeVisible();
    await expect(projectDetailPage.planTab).toBeVisible();
    await expect(projectDetailPage.tasksTab).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Start on Overview
    await expect(projectDetailPage.overviewTab).toHaveAttribute('data-state', 'active');

    // Switch to Plan tab
    await projectDetailPage.switchToTab('plan');
    await expect(projectDetailPage.planTab).toHaveAttribute('data-state', 'active');

    // Switch to Tasks tab
    await projectDetailPage.switchToTab('tasks');
    await expect(projectDetailPage.tasksTab).toHaveAttribute('data-state', 'active');

    // Back to Overview
    await projectDetailPage.switchToTab('overview');
    await expect(projectDetailPage.overviewTab).toHaveAttribute('data-state', 'active');
  });

  test('should display overview stats', async () => {
    // Stats should be visible on overview tab
    await expect(projectDetailPage.totalTasksStat).toBeVisible();
    await expect(projectDetailPage.completedTasksStat).toBeVisible();
    await expect(projectDetailPage.inProgressTasksStat).toBeVisible();
    await expect(projectDetailPage.todoTasksStat).toBeVisible();
  });

  test('should switch between kanban and list views', async () => {
    await projectDetailPage.switchToTab('tasks');

    // Switch to kanban view
    await projectDetailPage.switchToKanbanView();
    await expect(projectDetailPage.kanbanColumns.first()).toBeVisible();

    // Switch to list view
    await projectDetailPage.switchToListView();
    await expect(projectDetailPage.taskList).toBeVisible();
  });

  test('should navigate back to projects list', async ({ page }) => {
    await projectDetailPage.goBackToProjects();
    await expect(page).toHaveURL('/dashboard/projects');
  });
});

test.describe('Project Plan and Tasks - With Data', () => {
  test.fixme('should filter tasks by status', async () => {
    // This test requires pre-seeded project with tasks
  });

  test.fixme('should filter tasks by phase', async () => {
    // This test requires pre-seeded project with tasks
  });

  test.fixme('should display task details', async () => {
    // This test requires pre-seeded project with tasks
  });
});
