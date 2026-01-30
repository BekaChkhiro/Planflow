import { FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests
 * This runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  const apiUrl = process.env.API_URL || 'http://localhost:3001';

  console.log('Running global E2E setup...');

  // Wait for API to be ready
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        console.log('API is ready');
        break;
      }
    } catch {
      // API not ready yet
    }
    retries++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (retries >= maxRetries) {
    throw new Error('API failed to start within timeout');
  }

  // Create test users if they don't exist
  await ensureTestUsersExist(apiUrl);

  console.log('Global setup complete');
}

async function ensureTestUsersExist(apiUrl: string) {
  const testUsers = [
    {
      email: 'test@planflow.dev',
      password: 'TestPassword123!',
      name: 'Test User',
    },
    {
      email: 'pro@planflow.dev',
      password: 'ProPassword123!',
      name: 'Pro User',
    },
  ];

  for (const user of testUsers) {
    try {
      // Try to register the user (will fail if already exists, which is fine)
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      if (response.ok) {
        console.log(`Created test user: ${user.email}`);
      } else {
        const data = await response.json();
        if (data.error?.includes('already exists') || data.error?.includes('already registered')) {
          console.log(`Test user already exists: ${user.email}`);
        } else {
          console.log(`Note: Could not create ${user.email}: ${data.error}`);
        }
      }
    } catch (error) {
      console.log(`Could not create user ${user.email}:`, error);
    }
  }
}

export default globalSetup;
