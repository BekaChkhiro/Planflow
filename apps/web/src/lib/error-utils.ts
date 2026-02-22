'use client'

import { ApiError } from './api'

/**
 * Extract a user-friendly error message from various error types.
 * Used for displaying toast notifications on API errors.
 */
export function getErrorMessage(error: unknown): string {
  // Handle ApiError from our API client
  if (error instanceof ApiError) {
    return error.message || 'An error occurred'
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message || 'An error occurred'
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error
  }

  // Handle objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  // Fallback for unknown error types
  return 'An unexpected error occurred'
}

/**
 * Common error messages for specific HTTP status codes
 */
export function getStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input.'
    case 401:
      return 'Session expired. Please log in again.'
    case 403:
      return 'You do not have permission to perform this action.'
    case 404:
      return 'The requested resource was not found.'
    case 409:
      return 'A conflict occurred. Please try again.'
    case 422:
      return 'Invalid data provided.'
    case 429:
      return 'Too many requests. Please wait a moment.'
    case 500:
      return 'Server error. Please try again later.'
    case 502:
    case 503:
    case 504:
      return 'Service temporarily unavailable. Please try again later.'
    default:
      return 'An error occurred. Please try again.'
  }
}
