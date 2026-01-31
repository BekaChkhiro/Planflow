/**
 * Performance Test Data Seeding Script
 *
 * Creates test users and populates them with projects and tasks
 * for performance testing.
 *
 * Usage:
 *   pnpm --filter api perf:seed
 *   # or
 *   tsx perf/scripts/seed.ts
 */

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { getDbClient, schema } from '../../src/db/index.js';

// Test user configuration
const TEST_USERS = [
  {
    email: 'perf-test@planflow.tools',
    password: 'PerfTest123!',
    name: 'Perf Test User',
    tier: 'free' as const,
  },
  {
    email: 'perf-pro@planflow.tools',
    password: 'PerfPro123!',
    name: 'Perf Pro User',
    tier: 'pro' as const,
  },
];

// Number of projects per user
const PROJECTS_PER_USER = 10;

// Number of tasks per project
const TASKS_PER_PROJECT = 50;

// Task statuses and complexities from schema
const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
const TASK_COMPLEXITIES = ['Low', 'Medium', 'High'] as const;

async function seed() {
  console.log('[Seed] Starting performance test data seeding...');

  const db = getDbClient();

  for (const testUser of TEST_USERS) {
    console.log(`[Seed] Processing user: ${testUser.email}`);

    // Check if user exists
    const [existingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, testUser.email))
      .limit(1);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[Seed] User already exists: ${userId}`);
    } else {
      // Create user
      const passwordHash = await bcrypt.hash(testUser.password, 12);
      const [newUser] = await db
        .insert(schema.users)
        .values({
          email: testUser.email,
          name: testUser.name,
          passwordHash,
        })
        .returning({ id: schema.users.id });

      userId = newUser.id;
      console.log(`[Seed] Created user: ${userId}`);
    }

    // Create or update subscription
    const [existingSub] = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);

    if (existingSub) {
      await db
        .update(schema.subscriptions)
        .set({
          tier: testUser.tier,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.userId, userId));
      console.log(`[Seed] Updated subscription to ${testUser.tier}`);
    } else {
      await db.insert(schema.subscriptions).values({
        userId,
        tier: testUser.tier,
        status: 'active',
      });
      console.log(`[Seed] Created ${testUser.tier} subscription`);
    }

    // Count existing projects
    const existingProjects = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId));

    const projectsToCreate = PROJECTS_PER_USER - existingProjects.length;

    if (projectsToCreate > 0) {
      console.log(`[Seed] Creating ${projectsToCreate} projects...`);

      for (let i = 0; i < projectsToCreate; i++) {
        const projectNum = existingProjects.length + i + 1;

        // Create project
        const [project] = await db
          .insert(schema.projects)
          .values({
            userId,
            name: `Perf Test Project ${projectNum}`,
            description: `Performance test project #${projectNum} for ${testUser.email}`,
            plan: generateSamplePlan(projectNum),
          })
          .returning({ id: schema.projects.id });

        console.log(`[Seed] Created project ${projectNum}: ${project.id}`);

        // Create tasks for project
        await createTasksForProject(db, project.id, TASKS_PER_PROJECT);
      }
    } else {
      console.log(`[Seed] User already has ${existingProjects.length} projects`);
    }

    // Ensure existing projects have tasks
    for (const project of existingProjects) {
      const taskCount = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, project.id));

      if (taskCount.length < TASKS_PER_PROJECT) {
        const tasksToCreate = TASKS_PER_PROJECT - taskCount.length;
        console.log(`[Seed] Adding ${tasksToCreate} tasks to project ${project.name}`);
        await createTasksForProject(db, project.id, tasksToCreate, taskCount.length);
      }
    }
  }

  console.log('[Seed] Seeding completed successfully!');
  console.log('');
  console.log('Test credentials:');
  for (const user of TEST_USERS) {
    console.log(`  ${user.email} / ${user.password} (${user.tier})`);
  }
}

async function createTasksForProject(
  db: ReturnType<typeof getDbClient>,
  projectId: string,
  count: number,
  startIndex = 0
) {
  const tasks = [];
  for (let i = 0; i < count; i++) {
    const taskNum = startIndex + i + 1;
    tasks.push({
      projectId,
      taskId: `T${taskNum.toString().padStart(3, '0')}`,
      name: `Task ${taskNum}: ${generateTaskName()}`,
      description: `Description for task ${taskNum}. ${generateTaskDescription()}`,
      status: TASK_STATUSES[Math.floor(Math.random() * TASK_STATUSES.length)],
      complexity: TASK_COMPLEXITIES[Math.floor(Math.random() * TASK_COMPLEXITIES.length)],
      estimatedHours: Math.floor(Math.random() * 40) + 1,
      dependencies: taskNum > 1 ? [`T${(taskNum - 1).toString().padStart(3, '0')}`] : [],
    });
  }

  // Insert in batches of 20
  const batchSize = 20;
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    await db.insert(schema.tasks).values(batch);
  }
}

function generateTaskName(): string {
  const actions = ['Implement', 'Fix', 'Update', 'Refactor', 'Test', 'Review', 'Document'];
  const subjects = ['authentication', 'API endpoint', 'database query', 'UI component', 'validation', 'error handling', 'caching'];
  return `${actions[Math.floor(Math.random() * actions.length)]} ${subjects[Math.floor(Math.random() * subjects.length)]}`;
}

function generateTaskDescription(): string {
  const descriptions = [
    'This task involves updating the existing functionality to meet new requirements.',
    'Need to investigate the current implementation and propose improvements.',
    'Implementation should follow the established patterns in the codebase.',
    'Ensure proper error handling and edge case coverage.',
    'Add unit tests and integration tests for the changes.',
    'Update documentation to reflect the new functionality.',
    'Consider performance implications of the changes.',
  ];
  return descriptions[Math.floor(Math.random() * descriptions.length)];
}

function generateSamplePlan(projectNum: number): string {
  return `# Project ${projectNum} Plan

## Overview
This is a sample project plan for performance testing.

## Goals
1. Test API performance under load
2. Verify response time thresholds
3. Identify performance bottlenecks

## Phases

### Phase 1: Setup
- Configure test environment
- Seed test data
- Establish baseline metrics

### Phase 2: Testing
- Run smoke tests
- Run load tests
- Run stress tests

### Phase 3: Analysis
- Review test results
- Identify issues
- Document findings

## Timeline
- Week 1: Setup and configuration
- Week 2-3: Test execution
- Week 4: Analysis and reporting
`;
}

// Run the seed script
seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Seed] Error:', error);
    process.exit(1);
  });
