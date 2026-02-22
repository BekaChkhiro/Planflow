/**
 * Error Classes Unit Tests
 * Tests for custom service error classes
 */

import { describe, it, expect } from 'vitest'
import {
  ServiceError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
} from '../errors.js'

describe('ServiceError', () => {
  it('should create error with required properties', () => {
    const error = new ServiceError('Test error', 'TEST_CODE', 500)

    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_CODE')
    expect(error.statusCode).toBe(500)
    expect(error.name).toBe('ServiceError')
    expect(error).toBeInstanceOf(Error)
  })

  it('should support optional details', () => {
    const details = { field: 'email', reason: 'invalid' }
    const error = new ServiceError('Test error', 'TEST_CODE', 400, details)

    expect(error.details).toEqual(details)
  })

  it('should default statusCode to 500', () => {
    const error = new ServiceError('Test error', 'TEST_CODE')

    expect(error.statusCode).toBe(500)
  })
})

describe('ValidationError', () => {
  it('should create validation error with correct properties', () => {
    const error = new ValidationError('Invalid input')

    expect(error.message).toBe('Invalid input')
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('ValidationError')
    expect(error).toBeInstanceOf(ServiceError)
  })

  it('should support optional details', () => {
    const details = { fields: ['email', 'password'] }
    const error = new ValidationError('Invalid input', details)

    expect(error.details).toEqual(details)
  })
})

describe('AuthenticationError', () => {
  it('should create authentication error with default message', () => {
    const error = new AuthenticationError()

    expect(error.message).toBe('Authentication required')
    expect(error.code).toBe('AUTHENTICATION_ERROR')
    expect(error.statusCode).toBe(401)
    expect(error.name).toBe('AuthenticationError')
  })

  it('should accept custom message', () => {
    const error = new AuthenticationError('Token expired')

    expect(error.message).toBe('Token expired')
  })
})

describe('AuthorizationError', () => {
  it('should create authorization error with default message', () => {
    const error = new AuthorizationError()

    expect(error.message).toBe('Access denied')
    expect(error.code).toBe('AUTHORIZATION_ERROR')
    expect(error.statusCode).toBe(403)
    expect(error.name).toBe('AuthorizationError')
  })

  it('should accept custom message', () => {
    const error = new AuthorizationError('Insufficient permissions')

    expect(error.message).toBe('Insufficient permissions')
  })
})

describe('NotFoundError', () => {
  it('should create not found error with resource name', () => {
    const error = new NotFoundError('User')

    expect(error.message).toBe('User not found')
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('NotFoundError')
  })

  it('should include identifier in message when provided', () => {
    const error = new NotFoundError('Project', 'proj-123')

    expect(error.message).toBe("Project 'proj-123' not found")
  })
})

describe('ConflictError', () => {
  it('should create conflict error with correct properties', () => {
    const error = new ConflictError('Resource already exists')

    expect(error.message).toBe('Resource already exists')
    expect(error.code).toBe('CONFLICT')
    expect(error.statusCode).toBe(409)
    expect(error.name).toBe('ConflictError')
  })

  it('should support optional details', () => {
    const details = { existingId: 'resource-123' }
    const error = new ConflictError('Resource already exists', details)

    expect(error.details).toEqual(details)
  })
})

describe('RateLimitError', () => {
  it('should create rate limit error with default message', () => {
    const error = new RateLimitError()

    expect(error.message).toBe('Too many requests')
    expect(error.code).toBe('RATE_LIMIT')
    expect(error.statusCode).toBe(429)
    expect(error.name).toBe('RateLimitError')
  })

  it('should accept custom message', () => {
    const error = new RateLimitError('Rate limit exceeded. Try again in 60 seconds.')

    expect(error.message).toBe('Rate limit exceeded. Try again in 60 seconds.')
  })
})

describe('ExternalServiceError', () => {
  it('should create external service error with service name and message', () => {
    const error = new ExternalServiceError('GitHub', 'API rate limited')

    expect(error.message).toBe('GitHub: API rate limited')
    expect(error.code).toBe('EXTERNAL_SERVICE_ERROR')
    expect(error.statusCode).toBe(502)
    expect(error.name).toBe('ExternalServiceError')
  })
})

describe('Error Inheritance', () => {
  it('should all extend ServiceError', () => {
    const errors = [
      new ValidationError('test'),
      new AuthenticationError(),
      new AuthorizationError(),
      new NotFoundError('Resource'),
      new ConflictError('test'),
      new RateLimitError(),
      new ExternalServiceError('Service', 'error'),
    ]

    errors.forEach(error => {
      expect(error).toBeInstanceOf(ServiceError)
      expect(error).toBeInstanceOf(Error)
    })
  })

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new AuthenticationError('Invalid token')
    }).toThrow(AuthenticationError)

    expect(() => {
      throw new NotFoundError('User', 'user-123')
    }).toThrow(ServiceError)
  })

  it('should preserve stack trace', () => {
    const error = new ServiceError('Test', 'TEST', 500)

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('ServiceError')
  })
})
