/**
 * PlanFlow Constants
 */

export const APP_NAME = 'PlanFlow'
export const APP_VERSION = '0.0.1'

// API defaults
export const DEFAULT_API_PORT = 3001
export const DEFAULT_WEB_PORT = 3000

// Task statuses
export const TASK_STATUSES = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED',
} as const

// Task complexity levels
export const TASK_COMPLEXITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
} as const

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  ENTERPRISE: 'enterprise',
} as const

// Limits per tier
export const TIER_LIMITS = {
  free: {
    maxProjects: 3,
    cloudSync: false,
    teamMembers: 1,
  },
  pro: {
    maxProjects: -1, // unlimited
    cloudSync: true,
    teamMembers: 1,
  },
  team: {
    maxProjects: -1,
    cloudSync: true,
    teamMembers: -1, // unlimited
  },
  enterprise: {
    maxProjects: -1,
    cloudSync: true,
    teamMembers: -1,
  },
} as const
