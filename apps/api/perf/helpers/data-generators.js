/**
 * Test data factory functions for performance tests
 */

import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

/**
 * Generate a random project
 *
 * @param {object} options - Options for project generation
 * @returns {object} Project data
 */
export function generateProject(options = {}) {
  const {
    namePrefix = 'Perf Test Project',
    includeDescription = true,
    includePlan = false,
    planSize = 'small', // small, medium, large
  } = options;

  const project = {
    name: `${namePrefix} ${randomString(8)}`,
  };

  if (includeDescription) {
    project.description = `Performance test project created at ${new Date().toISOString()}. ${randomString(50)}`;
  }

  if (includePlan) {
    project.plan = generatePlan(planSize);
  }

  return project;
}

/**
 * Generate plan content of various sizes
 *
 * @param {string} size - Plan size: 'small', 'medium', 'large', 'xlarge'
 * @returns {string} Plan markdown content
 */
export function generatePlan(size = 'small') {
  const sizes = {
    small: 1024,        // 1KB
    medium: 102400,     // 100KB
    large: 1048576,     // 1MB
    xlarge: 4718592,    // 4.5MB (just under 5MB limit)
  };

  const targetSize = sizes[size] || sizes.small;

  // Build realistic-looking markdown plan
  let plan = `# Project Plan\n\n`;
  plan += `## Overview\n\nThis is a performance test plan generated at ${new Date().toISOString()}.\n\n`;
  plan += `## Goals\n\n`;

  // Add goals
  for (let i = 1; i <= 5; i++) {
    plan += `${i}. Goal ${i}: ${randomString(50)}\n`;
  }

  plan += `\n## Tasks\n\n`;

  // Generate tasks until we reach target size
  let taskId = 1;
  while (plan.length < targetSize) {
    plan += generateTaskMarkdown(taskId++);

    // Every 10 tasks, add a section header
    if (taskId % 10 === 0) {
      plan += `\n### Phase ${Math.floor(taskId / 10)}\n\n`;
    }
  }

  // Trim to exact size if overshot
  return plan.slice(0, targetSize);
}

/**
 * Generate a task in markdown format
 *
 * @param {number} id - Task ID
 * @returns {string} Task markdown
 */
function generateTaskMarkdown(id) {
  const statuses = ['pending', 'in_progress', 'completed'];
  const complexities = ['low', 'medium', 'high'];

  return `
### Task ${id}: ${randomString(30)}

**Status:** ${statuses[randomIntBetween(0, 2)]}
**Complexity:** ${complexities[randomIntBetween(0, 2)]}
**Estimated Hours:** ${randomIntBetween(1, 40)}

${randomString(200)}

---
`;
}

/**
 * Generate task objects for bulk updates
 *
 * @param {string[]} taskIds - Array of existing task IDs to update
 * @param {object} options - Generation options
 * @returns {object[]} Array of task updates
 */
export function generateTaskUpdates(taskIds, options = {}) {
  const {
    updateName = true,
    updateDescription = true,
    updateStatus = true,
  } = options;

  // Match schema enum values: TODO, IN_PROGRESS, DONE, BLOCKED
  const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

  return taskIds.map((id) => {
    const update = { id };

    if (updateName) {
      update.name = `Updated Task ${randomString(10)}`;
    }

    if (updateDescription) {
      update.description = `Updated description: ${randomString(100)}`;
    }

    if (updateStatus) {
      update.status = statuses[randomIntBetween(0, statuses.length - 1)];
    }

    return update;
  });
}

/**
 * Generate a batch of new tasks
 *
 * @param {number} count - Number of tasks to generate
 * @param {string} projectId - Project ID for the tasks
 * @returns {object[]} Array of task data
 */
export function generateTasks(count, projectId) {
  const tasks = [];
  // Match schema enum values
  const statuses = ['TODO', 'IN_PROGRESS', 'DONE'];
  const complexities = ['Low', 'Medium', 'High'];

  for (let i = 1; i <= count; i++) {
    tasks.push({
      taskId: `T${i.toString().padStart(3, '0')}`,
      name: `Task ${i}: ${randomString(20)}`,
      description: `Description for task ${i}. ${randomString(100)}`,
      status: statuses[randomIntBetween(0, 2)],
      complexity: complexities[randomIntBetween(0, 2)],
      estimatedHours: randomIntBetween(1, 40),
      dependencies: i > 1 ? [`T${(i - 1).toString().padStart(3, '0')}`] : [],
    });
  }

  return tasks;
}

/**
 * Generate user registration data
 *
 * @param {string} prefix - Email prefix
 * @returns {object} User registration data
 */
export function generateUser(prefix = 'perfuser') {
  const suffix = randomString(8).toLowerCase();
  return {
    email: `${prefix}-${suffix}@planflow.dev`,
    password: `PerfTest${randomString(8)}!`,
    name: `Perf User ${suffix}`,
  };
}

/**
 * Select random item from array
 *
 * @param {T[]} arr - Array to select from
 * @returns {T} Random item
 * @template T
 */
export function randomItem(arr) {
  return arr[randomIntBetween(0, arr.length - 1)];
}

/**
 * Sleep for random duration between min and max milliseconds
 *
 * @param {number} min - Minimum milliseconds
 * @param {number} max - Maximum milliseconds
 */
export function randomSleep(min, max) {
  const duration = randomIntBetween(min, max) / 1000; // Convert to seconds for k6 sleep
  return duration;
}
