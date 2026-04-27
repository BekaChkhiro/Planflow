/**
 * Repositories Index
 * Exports all repository classes and singleton instances
 *
 * The repository pattern abstracts database access, providing:
 * - Clean separation between business logic and data access
 * - Easy unit testing through repository mocking
 * - Consistent data access patterns across the application
 * - Type-safe CRUD operations for all entities
 */

// Base repository
export {
  BaseRepository,
  type IBaseRepository,
  type FindAllOptions,
  type PaginatedResult,
  type InferSelectModel,
  type InferInsertModel,
} from './base.repository.js'

// User repository
export {
  UserRepository,
  userRepository,
  type User,
  type UserWithPassword,
  type CreateUserInput,
  type UpdateUserInput,
} from './user.repository.js'

// Project repository
export {
  ProjectRepository,
  projectRepository,
  type Project,
  type ProjectSummary,
  type CreateProjectInput,
  type UpdateProjectInput,
} from './project.repository.js'

// Task repository
export {
  TaskRepository,
  taskRepository,
  TaskStatuses,
  TaskComplexities,
  type Task,
  type TaskSummary,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskStats,
  type TaskStatus,
  type TaskComplexity,
} from './task.repository.js'

// Organization repository
export {
  OrganizationRepository,
  organizationRepository,
  MemberRoles,
  type Organization,
  type OrganizationMember,
  type OrganizationMemberWithUser,
  type OrganizationWithRole,
  type TeamInvitation,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type CreateInvitationInput,
  type MemberRole,
} from './organization.repository.js'

// Notification repository
export {
  NotificationRepository,
  notificationRepository,
  NotificationTypes,
  type Notification,
  type NotificationWithActor,
  type CreateNotificationInput,
  type NotificationStats,
  type NotificationType,
} from './notification.repository.js'

// Knowledge repository
export {
  KnowledgeRepository,
  knowledgeRepository,
  type KnowledgeEntry,
  type KnowledgeEntryWithAuthor,
  type CreateKnowledgeInput,
  type UpdateKnowledgeInput,
  type KnowledgeListOptions,
} from './knowledge.repository.js'
