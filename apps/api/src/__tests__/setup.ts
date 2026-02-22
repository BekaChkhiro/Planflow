/**
 * Test Setup File
 * Configures mocks and test utilities for unit tests
 */

import { vi, beforeEach, afterEach } from 'vitest'

// Set test environment variables
process.env['JWT_SECRET'] = 'test-jwt-secret-for-testing-only'
process.env['JWT_EXPIRATION'] = '900'
process.env['REFRESH_TOKEN_EXPIRATION'] = '2592000'
process.env['NODE_ENV'] = 'test'

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})
