/**
 * PlanFlow MCP Server - Error Types
 *
 * Custom error classes for better error handling and reporting.
 */

/**
 * Base error class for PlanFlow MCP errors
 */
export class PlanFlowError extends Error {
  public readonly code: string
  public readonly details?: Record<string, unknown>

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'PlanFlowError'
    this.code = code
    this.details = details

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    }
  }
}

/**
 * Authentication-related errors
 */
export class AuthError extends PlanFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', details)
    this.name = 'AuthError'
  }
}

/**
 * API communication errors
 */
export class ApiError extends PlanFlowError {
  public readonly statusCode?: number

  constructor(message: string, statusCode?: number, details?: Record<string, unknown>) {
    super(message, 'API_ERROR', details)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends PlanFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details)
    this.name = 'ConfigError'
  }
}

/**
 * Validation errors for tool inputs
 */
export class ValidationError extends PlanFlowError {
  public readonly field?: string

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', { ...details, field })
    this.name = 'ValidationError'
    this.field = field
  }
}

/**
 * Tool execution errors
 */
export class ToolError extends PlanFlowError {
  public readonly toolName: string

  constructor(message: string, toolName: string, details?: Record<string, unknown>) {
    super(message, 'TOOL_ERROR', { ...details, toolName })
    this.name = 'ToolError'
    this.toolName = toolName
  }
}

