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
