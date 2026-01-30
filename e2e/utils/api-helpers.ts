import { APIRequestContext } from '@playwright/test';
import { testUsers, AuthResponse, ProjectResponse, ApiTokenResponse } from '../fixtures/test-data';

const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * API helper functions for E2E tests
 */

/**
 * Login and get auth token
 */
export async function login(
  request: APIRequestContext,
  email: string = testUsers.standard.email,
  password: string = testUsers.standard.password
): Promise<{ token: string; refreshToken: string; userId: string }> {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }

  const data: AuthResponse = await response.json();

  if (!data.success || !data.data) {
    throw new Error(`Login failed: ${data.error}`);
  }

  return {
    token: data.data.token,
    refreshToken: data.data.refreshToken,
    userId: data.data.user.id,
  };
}

/**
 * Create a new project via API
 */
export async function createProject(
  request: APIRequestContext,
  token: string,
  name: string,
  description?: string
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_URL}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description },
  });

  if (!response.ok()) {
    throw new Error(`Create project failed: ${response.status()}`);
  }

  const data: ProjectResponse = await response.json();

  if (!data.success || !data.data) {
    throw new Error(`Create project failed: ${data.error}`);
  }

  return {
    id: data.data.id,
    name: data.data.name,
  };
}

/**
 * Delete a project via API
 */
export async function deleteProject(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok()) {
    throw new Error(`Delete project failed: ${response.status()}`);
  }
}

/**
 * List all projects via API
 */
export async function listProjects(
  request: APIRequestContext,
  token: string
): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get(`${API_URL}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok()) {
    throw new Error(`List projects failed: ${response.status()}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`List projects failed: ${data.error}`);
  }

  return data.data ?? [];
}

/**
 * Create an API token via API
 */
export async function createApiToken(
  request: APIRequestContext,
  authToken: string,
  name: string,
  expiresInDays?: number
): Promise<{ id: string; token: string }> {
  const response = await request.post(`${API_URL}/api-tokens`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { name, expiresInDays },
  });

  if (!response.ok()) {
    throw new Error(`Create API token failed: ${response.status()}`);
  }

  const data: ApiTokenResponse = await response.json();

  if (!data.success || !data.data) {
    throw new Error(`Create API token failed: ${data.error}`);
  }

  return {
    id: data.data.id,
    token: data.data.token ?? '',
  };
}

/**
 * Delete an API token via API
 */
export async function deleteApiToken(
  request: APIRequestContext,
  authToken: string,
  tokenId: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/api-tokens/${tokenId}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (!response.ok()) {
    throw new Error(`Delete API token failed: ${response.status()}`);
  }
}

/**
 * Clean up all test projects for a user
 */
export async function cleanupProjects(
  request: APIRequestContext,
  token: string,
  prefix: string = 'Test Project'
): Promise<void> {
  const projects = await listProjects(request, token);

  for (const project of projects) {
    if (project.name.startsWith(prefix)) {
      await deleteProject(request, token, project.id);
    }
  }
}

/**
 * Wait for API to be ready
 */
export async function waitForApi(
  request: APIRequestContext,
  maxRetries: number = 30
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await request.get(`${API_URL}/health`);
      if (response.ok()) {
        return;
      }
    } catch {
      // API not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('API failed to start within timeout');
}

/**
 * Verify API token is valid
 */
export async function verifyApiToken(
  request: APIRequestContext,
  apiToken: string
): Promise<boolean> {
  const response = await request.post(`${API_URL}/api-tokens/verify`, {
    data: { token: apiToken },
  });

  if (!response.ok()) {
    return false;
  }

  const data = await response.json();
  return data.success && data.data?.valid;
}
