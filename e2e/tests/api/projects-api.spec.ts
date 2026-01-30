import { test, expect } from '@playwright/test';
import { testUsers, testProjects, ProjectResponse, ProjectsListResponse } from '../../fixtures/test-data';

const API_URL = process.env.API_URL || 'http://localhost:3001';

let authToken: string;

test.describe('Projects API', () => {
  test.beforeAll(async ({ request }) => {
    // Login to get auth token
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: testUsers.standard.email,
        password: testUsers.standard.password,
      },
    });

    const data = await response.json();
    authToken = data.data?.token;
  });

  test.describe('GET /projects', () => {
    test('should list user projects', async ({ request }) => {
      const response = await request.get(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const data: ProjectsListResponse = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('should reject request without auth', async ({ request }) => {
      const response = await request.get(`${API_URL}/projects`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('POST /projects', () => {
    test('should create a new project', async ({ request }) => {
      const project = testProjects.unique();

      const response = await request.post(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: project,
      });

      expect(response.status()).toBe(200);

      const data: ProjectResponse = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.name).toBe(project.name);
      expect(data.data?.description).toBe(project.description);
      expect(data.data?.id).toBeTruthy();
    });

    test('should reject project without name', async ({ request }) => {
      const response = await request.post(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          description: 'No name project',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject request without auth', async ({ request }) => {
      const response = await request.post(`${API_URL}/projects`, {
        data: testProjects.sample,
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('PUT /projects/:id', () => {
    let projectId: string;

    test.beforeAll(async ({ request }) => {
      // Create a project to update
      const project = testProjects.unique();
      const response = await request.post(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: project,
      });

      const data: ProjectResponse = await response.json();
      projectId = data.data?.id ?? '';
    });

    test('should update project', async ({ request }) => {
      const updates = {
        name: `Updated Project ${Date.now()}`,
        description: 'Updated description',
      };

      const response = await request.put(`${API_URL}/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: updates,
      });

      expect(response.status()).toBe(200);

      const data: ProjectResponse = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.name).toBe(updates.name);
      expect(data.data?.description).toBe(updates.description);
    });

    test('should reject update for non-existent project', async ({ request }) => {
      const response = await request.put(`${API_URL}/projects/non-existent-id`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          name: 'Test',
        },
      });

      expect(response.status()).toBe(404);
    });
  });

  test.describe('DELETE /projects/:id', () => {
    test('should delete project', async ({ request }) => {
      // Create a project to delete
      const project = testProjects.unique();
      const createResponse = await request.post(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: project,
      });

      const createData: ProjectResponse = await createResponse.json();
      const projectId = createData.data?.id;

      // Delete the project
      const response = await request.delete(`${API_URL}/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      // Verify project is deleted (should return 404)
      const getResponse = await request.get(`${API_URL}/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(getResponse.status()).toBe(404);
    });

    test('should reject delete for non-existent project', async ({ request }) => {
      const response = await request.delete(`${API_URL}/projects/non-existent-id`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(404);
    });
  });

  test.describe('GET /projects/:id/plan', () => {
    let projectId: string;

    test.beforeAll(async ({ request }) => {
      // Create a project
      const project = testProjects.unique();
      const response = await request.post(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: project,
      });

      const data: ProjectResponse = await response.json();
      projectId = data.data?.id ?? '';
    });

    test('should get project plan', async ({ request }) => {
      const response = await request.get(`${API_URL}/projects/${projectId}/plan`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  test.describe('GET /projects/:id/tasks', () => {
    let projectId: string;

    test.beforeAll(async ({ request }) => {
      // Create a project
      const project = testProjects.unique();
      const response = await request.post(`${API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: project,
      });

      const data: ProjectResponse = await response.json();
      projectId = data.data?.id ?? '';
    });

    test('should get project tasks', async ({ request }) => {
      const response = await request.get(`${API_URL}/projects/${projectId}/tasks`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
