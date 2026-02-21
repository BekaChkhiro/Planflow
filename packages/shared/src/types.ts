import { z } from 'zod'

// User types
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type User = z.infer<typeof UserSchema>

// Registration request schema
export const RegisterRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'), // bcrypt limit
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
})

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

// Login request schema
export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginRequest = z.infer<typeof LoginRequestSchema>

// Auth response schema (for login/register with token)
export const AuthResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds until access token expires
  refreshExpiresIn: z.number(), // seconds until refresh token expires
})

export type AuthResponse = z.infer<typeof AuthResponseSchema>

// Forgot password request schema
export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>

// Refresh token request schema
export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>

// Token refresh response schema
export const TokenRefreshResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number(),
})

export type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>

// Project types
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  userId: z.string().uuid(),
  plan: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Project = z.infer<typeof ProjectSchema>

// Create project request schema
export const CreateProjectRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be at most 255 characters'),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .optional(),
  plan: z.string().optional(),
})

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>

// Update project request schema (all fields optional for partial updates)
export const UpdateProjectRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name cannot be empty')
    .max(255, 'Project name must be at most 255 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
  plan: z.string().nullable().optional(),
})

export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>

// Task types
export const TaskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskComplexitySchema = z.enum(['Low', 'Medium', 'High'])
export type TaskComplexity = z.infer<typeof TaskComplexitySchema>

export const TaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string(), // e.g., "T1.1"
  name: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema,
  complexity: TaskComplexitySchema,
  estimatedHours: z.number().positive().optional(),
  dependencies: z.array(z.string()).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Task = z.infer<typeof TaskSchema>

// Create task request schema
export const CreateTaskRequestSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'), // e.g., "T1.1"
  name: z.string().min(1, 'Task name is required').max(255, 'Task name must be at most 255 characters'),
  description: z.string().max(2000, 'Description must be at most 2000 characters').optional(),
  status: TaskStatusSchema.optional().default('TODO'),
  complexity: TaskComplexitySchema.optional().default('Medium'),
  estimatedHours: z.number().positive('Estimated hours must be positive').optional(),
  dependencies: z.array(z.string()).default([]),
})

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>

// Update task request schema (all fields optional for partial updates)
export const UpdateTaskRequestSchema = z.object({
  taskId: z.string().min(1).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  complexity: TaskComplexitySchema.optional(),
  estimatedHours: z.number().positive().nullable().optional(),
  dependencies: z.array(z.string()).optional(),
})

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>

// Bulk update tasks request schema (for PUT /projects/:id/tasks)
export const BulkUpdateTasksRequestSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().uuid('Invalid task ID format'),
      taskId: z.string().min(1).optional(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
      status: TaskStatusSchema.optional(),
      complexity: TaskComplexitySchema.optional(),
      estimatedHours: z.number().positive().nullable().optional(),
      dependencies: z.array(z.string()).optional(),
    })
  ).min(1, 'At least one task must be provided'),
})

export type BulkUpdateTasksRequest = z.infer<typeof BulkUpdateTasksRequestSchema>

// API Token types
export const ApiTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  isRevoked: z.boolean(),
  createdAt: z.date(),
})

export type ApiToken = z.infer<typeof ApiTokenSchema>

// Create API token request schema
export const CreateApiTokenRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Token name is required')
    .max(100, 'Token name must be at most 100 characters'),
  expiresInDays: z
    .number()
    .int()
    .min(1, 'Expiration must be at least 1 day')
    .max(365, 'Expiration must be at most 365 days')
    .optional(),
})

export type CreateApiTokenRequest = z.infer<typeof CreateApiTokenRequestSchema>

// API Response types
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  })

export type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}

// Update profile request schema
export const UpdateProfileRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  email: z.string().email('Invalid email address').optional(),
})

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>

// Change password request schema
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(72, 'New password must be at most 72 characters'),
})

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>

// Subscription types
export const SubscriptionTierSchema = z.enum(['free', 'pro', 'team', 'enterprise'])
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>

export const SubscriptionStatusSchema = z.enum(['active', 'canceled', 'past_due', 'trialing'])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tier: SubscriptionTierSchema,
  status: SubscriptionStatusSchema,
  lemonSqueezyCustomerId: z.string().nullable(),
  lemonSqueezySubscriptionId: z.string().nullable(),
  currentPeriodStart: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  canceledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Subscription = z.infer<typeof SubscriptionSchema>

// Create checkout request schema
export const CreateCheckoutRequestSchema = z.object({
  tier: z.enum(['pro', 'team'], {
    required_error: 'Tier is required',
    invalid_type_error: 'Tier must be either "pro" or "team"',
  }),
})

export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>

// Checkout response schema
export const CheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
})

export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>

// Project limits for feature gating
export const ProjectLimitsSchema = z.object({
  currentCount: z.number(),
  maxProjects: z.number(), // -1 = unlimited
  canCreate: z.boolean(),
  tier: SubscriptionTierSchema,
  status: SubscriptionStatusSchema,
})

export type ProjectLimits = z.infer<typeof ProjectLimitsSchema>

// Feedback types
export const FeedbackCategorySchema = z.enum(['general', 'bug', 'feature', 'usability', 'performance'])
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>

export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  category: FeedbackCategorySchema,
  rating: z.number().int().min(1).max(5),
  message: z.string(),
  userAgent: z.string().nullable(),
  pageUrl: z.string().nullable(),
  createdAt: z.date(),
})

export type Feedback = z.infer<typeof FeedbackSchema>

// Create feedback request schema
export const CreateFeedbackRequestSchema = z.object({
  category: FeedbackCategorySchema.default('general'),
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  message: z
    .string()
    .min(10, 'Please provide at least 10 characters of feedback')
    .max(5000, 'Feedback must be at most 5000 characters'),
  pageUrl: z.string().url().optional(),
})

export type CreateFeedbackRequest = z.infer<typeof CreateFeedbackRequestSchema>

// Organization types
export const OrgMemberRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer'])
export type OrgMemberRole = z.infer<typeof OrgMemberRoleSchema>

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().nullable().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Organization = z.infer<typeof OrganizationSchema>

export const OrganizationMemberSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: OrgMemberRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>

// Create organization request schema
export const CreateOrganizationRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name is required')
    .max(255, 'Organization name must be at most 255 characters'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .max(255, 'Slug must be at most 255 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .optional(),
})

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>

// Update organization request schema
export const UpdateOrganizationRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name cannot be empty')
    .max(255, 'Organization name must be at most 255 characters')
    .optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .max(255, 'Slug must be at most 255 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
})

export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>

// Team invitation types
export const CreateInvitationRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'editor', 'viewer']).optional().default('editor'),
})

export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>

export const InvitationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: OrgMemberRoleSchema,
  invitedBy: z.string().uuid(),
  token: z.string(),
  expiresAt: z.date(),
  acceptedAt: z.date().nullable(),
  createdAt: z.date(),
})

export type Invitation = z.infer<typeof InvitationSchema>

// Update member role request schema
export const UpdateMemberRoleRequestSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer'], {
    required_error: 'Role is required',
    invalid_type_error: 'Role must be admin, editor, or viewer',
  }),
})

export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>

// Task assignment types (T5.4)
export const AssignTaskRequestSchema = z.object({
  assigneeId: z.string().uuid('Invalid user ID format'),
})

export type AssignTaskRequest = z.infer<typeof AssignTaskRequestSchema>

export const TaskAssignmentSchema = z.object({
  taskId: z.string(),
  assigneeId: z.string().uuid().nullable(),
  assignedBy: z.string().uuid().nullable(),
  assignedAt: z.date().nullable(),
})

export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>

// Extended task schema with assignee info
export const TaskWithAssigneeSchema = TaskSchema.extend({
  assigneeId: z.string().uuid().nullable(),
  assignedBy: z.string().uuid().nullable(),
  assignedAt: z.date().nullable(),
  assignee: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }).nullable().optional(),
})

export type TaskWithAssignee = z.infer<typeof TaskWithAssigneeSchema>

// Comment types (T5.5)
export const CommentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  authorId: z.string().uuid(),
  content: z.string().min(1),
  parentId: z.string().uuid().nullable(),
  mentions: z.array(z.string().uuid()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Comment = z.infer<typeof CommentSchema>

// Create comment request schema
export const CreateCommentRequestSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment content is required')
    .max(10000, 'Comment must be at most 10000 characters'),
  parentId: z.string().uuid('Invalid parent comment ID').optional(),
  mentions: z.array(z.string().uuid('Invalid user ID in mentions')).optional(),
})

export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>

// Update comment request schema
export const UpdateCommentRequestSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment content cannot be empty')
    .max(10000, 'Comment must be at most 10000 characters')
    .optional(),
  mentions: z.array(z.string().uuid('Invalid user ID in mentions')).optional(),
})

export type UpdateCommentRequest = z.infer<typeof UpdateCommentRequestSchema>

// Author info schema (for API responses)
export const CommentAuthorSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
})

export type CommentAuthor = z.infer<typeof CommentAuthorSchema>

// Comment with author info (for API responses)
// Note: Replies are handled separately in the API to avoid recursive schema issues
export const CommentWithAuthorSchema = CommentSchema.extend({
  author: CommentAuthorSchema,
})

export type CommentWithAuthor = z.infer<typeof CommentWithAuthorSchema>

// Comment with nested replies (for threaded view)
export interface CommentWithReplies extends CommentWithAuthor {
  replies?: CommentWithReplies[]
}

// Activity Log types (T5.6)
export const ActivityActionSchema = z.enum([
  'task_created',
  'task_updated',
  'task_deleted',
  'task_status_changed',
  'task_assigned',
  'task_unassigned',
  'comment_created',
  'comment_updated',
  'comment_deleted',
  'project_created',
  'project_updated',
  'project_deleted',
  'plan_updated',
  'member_invited',
  'member_joined',
  'member_removed',
  'member_role_changed',
  'other',
])

export type ActivityAction = z.infer<typeof ActivityActionSchema>

export const ActivityEntitySchema = z.enum([
  'task',
  'comment',
  'project',
  'organization',
  'member',
  'invitation',
])

export type ActivityEntity = z.infer<typeof ActivityEntitySchema>

export const ActivityMetadataSchema = z.record(z.unknown()).optional()

export type ActivityMetadata = z.infer<typeof ActivityMetadataSchema>

export const ActivityLogSchema = z.object({
  id: z.string().uuid(),
  action: ActivityActionSchema,
  entityType: ActivityEntitySchema,
  entityId: z.string().uuid().nullable(),
  taskId: z.string().nullable(), // Human-readable task ID like "T1.1"
  actorId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  taskUuid: z.string().uuid().nullable(),
  metadata: ActivityMetadataSchema,
  description: z.string().nullable(),
  createdAt: z.date(),
})

export type ActivityLog = z.infer<typeof ActivityLogSchema>

// Activity log with actor info (for API responses)
export const ActivityActorSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
})

export type ActivityActor = z.infer<typeof ActivityActorSchema>

export const ActivityLogWithActorSchema = ActivityLogSchema.extend({
  actor: ActivityActorSchema,
})

export type ActivityLogWithActor = z.infer<typeof ActivityLogWithActorSchema>

// Query parameters for activity log endpoints
export const ActivityLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  action: ActivityActionSchema.optional(),
  entityType: ActivityEntitySchema.optional(),
  actorId: z.string().uuid().optional(),
  taskId: z.string().optional(), // Human-readable task ID filter
})

export type ActivityLogQuery = z.infer<typeof ActivityLogQuerySchema>

// Create activity log request (internal use)
export const CreateActivityLogRequestSchema = z.object({
  action: ActivityActionSchema,
  entityType: ActivityEntitySchema,
  entityId: z.string().uuid().optional(),
  taskId: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  taskUuid: z.string().uuid().optional(),
  metadata: ActivityMetadataSchema,
  description: z.string().max(1000).optional(),
})

export type CreateActivityLogRequest = z.infer<typeof CreateActivityLogRequestSchema>

// ============================================
// WebSocket Event Types (T5.8)
// ============================================

/**
 * Base WebSocket message structure
 */
export const WebSocketMessageSchema = z.object({
  type: z.string(),
  projectId: z.string().uuid(),
  timestamp: z.string().datetime(),
  data: z.record(z.unknown()).optional(),
})

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>

/**
 * WebSocket event types
 */
export const WebSocketEventTypeSchema = z.enum([
  'connected',
  'task_updated',
  'task_assigned',
  'task_unassigned',
  'tasks_synced',
  'project_updated',
  'ping',
  'pong',
  // Presence events (T5.9)
  'presence_joined',
  'presence_left',
  'presence_updated',
  'presence_list',
])

export type WebSocketEventType = z.infer<typeof WebSocketEventTypeSchema>

/**
 * Task data in WebSocket messages
 */
export const WebSocketTaskDataSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  complexity: z.string().nullable(),
  estimatedHours: z.number().nullable(),
  dependencies: z.array(z.string()),
  assigneeId: z.string().uuid().nullable().optional(),
  assignedBy: z.string().uuid().nullable().optional(),
  assignedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type WebSocketTaskData = z.infer<typeof WebSocketTaskDataSchema>

/**
 * User info in WebSocket messages
 */
export const WebSocketUserInfoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
})

export type WebSocketUserInfo = z.infer<typeof WebSocketUserInfoSchema>

/**
 * Connected event data
 */
export const ConnectedEventDataSchema = z.object({
  userId: z.string().uuid(),
  projectName: z.string(),
})

export type ConnectedEventData = z.infer<typeof ConnectedEventDataSchema>

/**
 * Task updated event data
 */
export const TaskUpdatedEventDataSchema = z.object({
  task: WebSocketTaskDataSchema,
})

export type TaskUpdatedEventData = z.infer<typeof TaskUpdatedEventDataSchema>

/**
 * Task assigned event data
 */
export const TaskAssignedEventDataSchema = z.object({
  task: WebSocketTaskDataSchema,
  assignee: WebSocketUserInfoSchema.nullable(),
  assignedBy: WebSocketUserInfoSchema,
})

export type TaskAssignedEventData = z.infer<typeof TaskAssignedEventDataSchema>

/**
 * Task unassigned event data
 */
export const TaskUnassignedEventDataSchema = z.object({
  task: WebSocketTaskDataSchema,
  previousAssigneeId: z.string().uuid().nullable(),
  unassignedBy: WebSocketUserInfoSchema,
})

export type TaskUnassignedEventData = z.infer<typeof TaskUnassignedEventDataSchema>

/**
 * Tasks synced event data (from plan update)
 */
export const TasksSyncedEventDataSchema = z.object({
  tasksCount: z.number(),
  completedCount: z.number(),
  progress: z.number(),
})

export type TasksSyncedEventData = z.infer<typeof TasksSyncedEventDataSchema>

/**
 * Project updated event data
 */
export const ProjectUpdatedEventDataSchema = z.object({
  updatedFields: z.object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    updatedAt: z.string().datetime(),
  }),
})

export type ProjectUpdatedEventData = z.infer<typeof ProjectUpdatedEventDataSchema>

// ============================================
// Presence Types (T5.9)
// ============================================

/**
 * Presence status values
 */
export const PresenceStatusSchema = z.enum(['online', 'idle', 'away'])

export type PresenceStatus = z.infer<typeof PresenceStatusSchema>

/**
 * User presence info
 */
export const UserPresenceSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  status: PresenceStatusSchema,
  connectedAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
})

export type UserPresence = z.infer<typeof UserPresenceSchema>

/**
 * Presence joined event data (user came online)
 */
export const PresenceJoinedEventDataSchema = z.object({
  user: UserPresenceSchema,
  onlineCount: z.number().int().min(0),
})

export type PresenceJoinedEventData = z.infer<typeof PresenceJoinedEventDataSchema>

/**
 * Presence left event data (user went offline)
 */
export const PresenceLeftEventDataSchema = z.object({
  userId: z.string().uuid(),
  onlineCount: z.number().int().min(0),
})

export type PresenceLeftEventData = z.infer<typeof PresenceLeftEventDataSchema>

/**
 * Presence updated event data (status changed)
 */
export const PresenceUpdatedEventDataSchema = z.object({
  userId: z.string().uuid(),
  status: PresenceStatusSchema,
  lastActiveAt: z.string().datetime(),
})

export type PresenceUpdatedEventData = z.infer<typeof PresenceUpdatedEventDataSchema>

/**
 * Presence list event data (full list sent on connect)
 */
export const PresenceListEventDataSchema = z.object({
  users: z.array(UserPresenceSchema),
  onlineCount: z.number().int().min(0),
})

export type PresenceListEventData = z.infer<typeof PresenceListEventDataSchema>

// ============================================
// Notification Types (T5.10)
// ============================================

/**
 * Notification types
 */
export const NotificationTypeSchema = z.enum([
  'mention',
  'assignment',
  'unassignment',
  'comment',
  'comment_reply',
  'status_change',
  'task_created',
  'task_deleted',
  'invitation',
  'member_joined',
  'member_removed',
  'role_changed',
])

export type NotificationType = z.infer<typeof NotificationTypeSchema>

/**
 * Notification schema
 */
export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string().min(1).max(255),
  body: z.string().nullable(),
  link: z.string().max(500).nullable(),
  projectId: z.string().uuid().nullable(),
  organizationId: z.string().uuid().nullable(),
  actorId: z.string().uuid().nullable(),
  taskId: z.string().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
})

export type Notification = z.infer<typeof NotificationSchema>

/**
 * Actor info for notification responses
 */
export const NotificationActorSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
})

export type NotificationActor = z.infer<typeof NotificationActorSchema>

/**
 * Notification with actor info (for API responses)
 */
export const NotificationWithActorSchema = NotificationSchema.extend({
  actor: NotificationActorSchema.nullable(),
})

export type NotificationWithActor = z.infer<typeof NotificationWithActorSchema>

/**
 * Query parameters for notifications list
 */
export const NotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  unreadOnly: z.coerce.boolean().optional().default(false),
  type: NotificationTypeSchema.optional(),
  projectId: z.string().uuid().optional(),
})

export type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>

/**
 * Mark notifications as read request
 */
export const MarkNotificationsReadRequestSchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(100),
})

export type MarkNotificationsReadRequest = z.infer<typeof MarkNotificationsReadRequestSchema>

/**
 * Create notification request (internal use)
 */
export const CreateNotificationRequestSchema = z.object({
  userId: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string().min(1).max(255),
  body: z.string().max(2000).optional(),
  link: z.string().max(500).optional(),
  projectId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  taskId: z.string().optional(),
})

export type CreateNotificationRequest = z.infer<typeof CreateNotificationRequestSchema>

// ============================================
// GitHub OAuth Types (T8.2)
// ============================================

/**
 * GitHub authorization URL response
 */
export const GitHubAuthorizationResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string(),
})

export type GitHubAuthorizationResponse = z.infer<typeof GitHubAuthorizationResponseSchema>

/**
 * GitHub OAuth callback request
 */
export const GitHubCallbackRequestSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State token is required'),
})

export type GitHubCallbackRequest = z.infer<typeof GitHubCallbackRequestSchema>

/**
 * GitHub integration status
 */
export const GitHubIntegrationSchema = z.object({
  id: z.string().uuid(),
  githubId: z.string(),
  githubUsername: z.string(),
  githubEmail: z.string().nullable(),
  githubAvatarUrl: z.string().nullable(),
  githubName: z.string().nullable(),
  grantedScopes: z.array(z.string()).nullable(),
  isConnected: z.boolean(),
  lastSyncAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type GitHubIntegrationStatus = z.infer<typeof GitHubIntegrationSchema>

/**
 * GitHub user info from API
 */
export const GitHubUserInfoSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export type GitHubUserInfo = z.infer<typeof GitHubUserInfoSchema>

/**
 * GitHub repository info
 */
export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string().nullable(),
  }),
  description: z.string().nullable(),
  private: z.boolean(),
  html_url: z.string().url(),
  default_branch: z.string(),
})

export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>

// ============================================
// GitHub Issue Link Types (T8.3)
// ============================================

/**
 * GitHub issue info
 */
export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  html_url: z.string().url(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string().nullable(),
  }),
  labels: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
  })),
  assignees: z.array(z.object({
    login: z.string(),
    avatar_url: z.string().nullable(),
  })),
})

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>

/**
 * Task GitHub link info (stored in task)
 */
export const TaskGitHubLinkSchema = z.object({
  issueNumber: z.number(),
  repository: z.string(), // "owner/repo"
  issueUrl: z.string().url(),
  issueTitle: z.string(),
  issueState: z.enum(['open', 'closed']),
  linkedBy: z.string().uuid(),
  linkedAt: z.date(),
})

export type TaskGitHubLink = z.infer<typeof TaskGitHubLinkSchema>

/**
 * Link task to GitHub issue request
 */
export const LinkTaskToGitHubRequestSchema = z.object({
  issueNumber: z.number().int().positive('Issue number must be positive'),
  repository: z.string().regex(/^[^/]+\/[^/]+$/, 'Repository must be in format "owner/repo"'),
})

export type LinkTaskToGitHubRequest = z.infer<typeof LinkTaskToGitHubRequestSchema>

/**
 * Create GitHub issue from task request
 */
export const CreateGitHubIssueFromTaskRequestSchema = z.object({
  repository: z.string().regex(/^[^/]+\/[^/]+$/, 'Repository must be in format "owner/repo"'),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
})

export type CreateGitHubIssueFromTaskRequest = z.infer<typeof CreateGitHubIssueFromTaskRequestSchema>

/**
 * GitHub issues list query params
 */
export const GitHubIssuesQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(30),
  search: z.string().optional(),
})

export type GitHubIssuesQuery = z.infer<typeof GitHubIssuesQuerySchema>

/**
 * Extended task schema with GitHub link info
 */
export const TaskWithGitHubLinkSchema = TaskSchema.extend({
  assigneeId: z.string().uuid().nullable(),
  assignedBy: z.string().uuid().nullable(),
  assignedAt: z.date().nullable(),
  assignee: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }).nullable().optional(),
  githubIssueNumber: z.number().nullable(),
  githubRepository: z.string().nullable(),
  githubIssueUrl: z.string().nullable(),
  githubIssueTitle: z.string().nullable(),
  githubIssueState: z.enum(['open', 'closed']).nullable(),
  githubLinkedBy: z.string().uuid().nullable(),
  githubLinkedAt: z.date().nullable(),
})

export type TaskWithGitHubLink = z.infer<typeof TaskWithGitHubLinkSchema>

// ============================================
// GitHub Pull Request Link Types (T8.4)
// ============================================

/**
 * GitHub Pull Request state
 */
export const GitHubPrStateSchema = z.enum(['open', 'closed', 'merged'])
export type GitHubPrState = z.infer<typeof GitHubPrStateSchema>

/**
 * GitHub Pull Request info
 */
export const GitHubPullRequestSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: GitHubPrStateSchema,
  draft: z.boolean(),
  html_url: z.string().url(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  merged_at: z.string().datetime().nullable(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string().nullable(),
  }),
  head: z.object({
    ref: z.string(), // Branch name
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(), // Target branch (e.g., "main")
    sha: z.string(),
  }),
  labels: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
  })),
  assignees: z.array(z.object({
    login: z.string(),
    avatar_url: z.string().nullable(),
  })),
  requested_reviewers: z.array(z.object({
    login: z.string(),
    avatar_url: z.string().nullable(),
  })),
})

export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>

/**
 * Task GitHub PR link info (stored in task)
 */
export const TaskGitHubPrLinkSchema = z.object({
  prNumber: z.number(),
  repository: z.string(), // "owner/repo"
  prUrl: z.string().url(),
  prTitle: z.string(),
  prState: GitHubPrStateSchema,
  headBranch: z.string(),
  baseBranch: z.string(),
  linkedBy: z.string().uuid(),
  linkedAt: z.date(),
})

export type TaskGitHubPrLink = z.infer<typeof TaskGitHubPrLinkSchema>

/**
 * Link task to GitHub PR request
 */
export const LinkTaskToGitHubPrRequestSchema = z.object({
  prNumber: z.number().int().positive('PR number must be positive'),
  repository: z.string().regex(/^[^/]+\/[^/]+$/, 'Repository must be in format "owner/repo"'),
})

export type LinkTaskToGitHubPrRequest = z.infer<typeof LinkTaskToGitHubPrRequestSchema>

/**
 * GitHub PRs list query params
 */
export const GitHubPullRequestsQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(30),
  search: z.string().optional(),
})

export type GitHubPullRequestsQuery = z.infer<typeof GitHubPullRequestsQuerySchema>

/**
 * Extended task schema with GitHub PR link info
 */
export const TaskWithGitHubPrLinkSchema = TaskWithGitHubLinkSchema.extend({
  githubPrNumber: z.number().nullable(),
  githubPrRepository: z.string().nullable(),
  githubPrUrl: z.string().nullable(),
  githubPrTitle: z.string().nullable(),
  githubPrState: GitHubPrStateSchema.nullable(),
  githubPrBranch: z.string().nullable(),
  githubPrBaseBranch: z.string().nullable(),
  githubPrLinkedBy: z.string().uuid().nullable(),
  githubPrLinkedAt: z.date().nullable(),
})

export type TaskWithGitHubPrLink = z.infer<typeof TaskWithGitHubPrLinkSchema>
