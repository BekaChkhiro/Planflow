/**
 * Custom error classes for service layer
 * These errors are thrown by services and caught by route handlers
 * to convert into appropriate HTTP responses
 */

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends ServiceError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends ServiceError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`
    super(message, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details)
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends ServiceError {
  constructor(message: string = 'Too many requests') {
    super(message, 'RATE_LIMIT', 429)
    this.name = 'RateLimitError'
  }
}

export class ExternalServiceError extends ServiceError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502)
    this.name = 'ExternalServiceError'
  }
}
