// Route aggregation file
// Re-exports all route modules for clean imports in main app

export { authRoutes } from './auth.routes.js'
export { usersRoutes } from './users.routes.js'
export { apiTokensRoutes } from './api-tokens.routes.js'
export { healthRoutes } from './health.routes.js'
export { subscriptionsRoutes } from './subscriptions.routes.js'
export { webhooksRoutes } from './webhooks.routes.js'
export { feedbackRoutes } from './feedback.routes.js'
export { projectRoutes } from './projects.routes.js'
export { organizationsRoutes, invitationsRoutes } from './organizations.routes.js'
export { projectInvitationsRoutes } from './project-invitations.routes.js'
export { default as notificationsRoutes } from './notifications.routes.js'
export { integrationsRoutes } from './integrations.routes.js'
export { oauthRoutes } from './oauth.routes.js'
