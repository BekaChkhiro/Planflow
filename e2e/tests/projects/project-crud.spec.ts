import { test, expect } from '@playwright/test';
import { ProjectsListPage } from '../../page-objects/dashboard/projects-list.page';
import { ProjectDetailPage } from '../../page-objects/dashboard/project-detail.page';
import { testProjects } from '../../fixtures/test-data';

test.describe('Project CRUD Operations', () => {
  let projectsListPage: ProjectsListPage;

  test.beforeEach(async ({ page }) => {
    projectsListPage = new ProjectsListPage(page);
    await projectsListPage.goto();
  });

  test('should display projects list page', async () => {
    await expect(projectsListPage.pageTitle).toBeVisible();
    await expect(projectsListPage.newProjectButton).toBeVisible();
  });

  test('should create a new project', async ({ page }) => {
    const project = testProjects.unique();

    await projectsListPage.createProject(project.name, project.description);

    // Project should appear in list
    await projectsListPage.expectProjectExists(project.name);
  });

  test('should view project details', async ({ page }) => {
    // First create a project
    const project = testProjects.unique();
    await projectsListPage.createProject(project.name, project.description);

    // Click to view project
    await projectsListPage.viewProject(project.name);

    // Should be on project detail page
    const detailPage = new ProjectDetailPage(page);
    await detailPage.expectProjectName(project.name);
  });

  test('should edit project details', async ({ page }) => {
    // Create a project
    const project = testProjects.unique();
    await projectsListPage.createProject(project.name, project.description);

    // View project
    await projectsListPage.viewProject(project.name);

    const detailPage = new ProjectDetailPage(page);

    // Edit project
    const newName = `Updated ${project.name}`;
    await detailPage.editProject(newName, 'Updated description');

    // Verify changes
    await detailPage.expectProjectName(newName);
  });

  test('should delete project from detail page', async ({ page }) => {
    // Create a project
    const project = testProjects.unique();
    await projectsListPage.createProject(project.name, project.description);

    // View project
    await projectsListPage.viewProject(project.name);

    const detailPage = new ProjectDetailPage(page);

    // Delete project
    await detailPage.deleteProject();

    // Should be back on projects list
    await expect(page).toHaveURL('/dashboard/projects');

    // Project should not exist
    await projectsListPage.expectProjectNotExists(project.name);
  });

  test('should delete project from list page', async ({ page }) => {
    // Create a project
    const project = testProjects.unique();
    await projectsListPage.createProject(project.name, project.description);
    await projectsListPage.expectProjectExists(project.name);

    // Delete from list
    await projectsListPage.deleteProject(project.name);

    // Project should not exist
    await projectsListPage.expectProjectNotExists(project.name);
  });

  test('should cancel project creation', async ({ page }) => {
    await projectsListPage.openCreateDialog();
    await projectsListPage.projectNameInput.fill('Should Not Create');
    await projectsListPage.cancelButton.click();

    await expect(projectsListPage.createDialog).not.toBeVisible();
    await projectsListPage.expectProjectNotExists('Should Not Create');
  });
});
