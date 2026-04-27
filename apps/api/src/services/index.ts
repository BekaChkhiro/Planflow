/**
 * Services Index
 * Central export point for all service layer modules
 */

// Error types
export * from './errors.js'

// Auth service
export { authService, AuthService } from './auth.service.js'
export type {
  RegisterUserInput,
  LoginResult,
  RefreshTokenResult,
  UserWithSubscription,
  Session,
} from './auth.service.js'

// User service
export { userService, UserService } from './user.service.js'
export type {
  UpdateProfileInput,
  ChangePasswordInput,
  UserProfile,
} from './user.service.js'

// Project service
export { projectService, ProjectService } from './project.service.js'
export type {
  CreateProjectInput,
  UpdateProjectInput,
  Project,
  ProjectWithLimits,
  ProjectsListResult,
  TaskUpdate,
  Task,
  TaskWithAssignee,
  PlanUpdateResult,
  TaskUpdateContext,
} from './project.service.js'

// Organization service
export { organizationService, OrganizationService } from './organization.service.js'

// Notification service
export { notificationService, NotificationService } from './notification.service.js'
export type {
  NotificationQuery,
  NotificationWithActor,
  NotificationsListResult,
  PushSubscriptionInput,
  NotificationPreferences,
  CreateNotificationInput,
} from './notification.service.js'

// API Token service
export { apiTokenService, ApiTokenService } from './api-token.service.js'
export type {
  CreateApiTokenInput,
  ApiToken,
  ApiTokenWithSecret,
  VerifyApiTokenResult,
} from './api-token.service.js'

// Subscription service
export { subscriptionService, SubscriptionService } from './subscription.service.js'
export type {
  Subscription,
  CreateCheckoutInput,
  SubscriptionWebhookData,
} from './subscription.service.js'

// Webhook service
export { webhookService, WebhookService } from './webhook.service.js'
export type {
  LemonSqueezyWebhookPayload,
  WebhookProcessResult,
} from './webhook.service.js'

// Knowledge service
export { knowledgeService, KnowledgeService } from './knowledge.service.js'
export type { KnowledgeQuery } from './knowledge.service.js'

// Tech Stack Detector service (T20.6)
export { techStackDetectorService, TechStackDetectorService } from './tech-stack-detector.service.js'
export type { DetectionInput, DetectedItem, DetectionResult } from './tech-stack-detector.service.js'

// Knowledge Aggregator service (T20.8)
export { knowledgeAggregatorService, KnowledgeAggregatorService } from './knowledge-aggregator.service.js'
export type {
  AggregatorQuery,
  AggregatedContext,
  KnowledgeLayer,
  RealtimeLayer,
  ActivityLayer,
  ContextSummary,
} from './knowledge-aggregator.service.js'
