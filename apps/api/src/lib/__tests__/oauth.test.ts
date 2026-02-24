/**
 * OAuth Utilities Unit Tests
 *
 * Tests for OAuth helper functions including:
 * - State token generation
 * - OAuth error codes
 * - Edge cases (T18.10)
 *
 * Note: Configuration and URL building tests are skipped when env vars
 * are not set, as those functions read env at module load time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('GitHub OAuth Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isGitHubConfigured', () => {
    it('should check environment variables for configuration', async () => {
      const { isGitHubConfigured } = await import('../github.js')
      // This checks the current state - depends on actual env
      const result = isGitHubConfigured()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('generateOAuthState', () => {
    it('should generate a random state string', async () => {
      const { generateOAuthState } = await import('../github.js')

      const state1 = generateOAuthState()
      const state2 = generateOAuthState()

      expect(state1).toBeDefined()
      expect(state1.length).toBeGreaterThan(0)
      expect(state1).not.toBe(state2)
    })

    it('should generate URL-safe state', async () => {
      const { generateOAuthState } = await import('../github.js')

      const state = generateOAuthState()

      // Should be URL-safe (no special chars that need encoding)
      expect(encodeURIComponent(state)).toBe(state)
    })
  })

  describe('buildAuthorizationUrl', () => {
    it('should build valid GitHub authorization URL with state', async () => {
      const { buildAuthorizationUrl } = await import('../github.js')

      const state = 'test_state_123'
      const url = buildAuthorizationUrl(state)

      // Should be a valid GitHub URL with the state parameter
      expect(url).toContain('https://github.com/login/oauth/authorize')
      expect(url).toContain(`state=${state}`)
      expect(url).toContain('scope=')
    })

    it('should include scopes in URL', async () => {
      const { buildAuthorizationUrl } = await import('../github.js')

      const url = buildAuthorizationUrl('test_state')

      // Should include scope parameter
      expect(url).toContain('scope=')
    })
  })

  describe('exchangeCodeForToken', () => {
    it('should return null when fetch fails', async () => {
      const { exchangeCodeForToken } = await import('../github.js')

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await exchangeCodeForToken('test_code')

      expect(result).toBeNull()
    })

    it('should return null on non-OK response', async () => {
      const { exchangeCodeForToken } = await import('../github.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('error=bad_verification_code'),
        json: () => Promise.resolve({ error: 'bad_verification_code' }),
      })

      const result = await exchangeCodeForToken('invalid_code')

      expect(result).toBeNull()
    })
  })

  describe('fetchGitHubUser', () => {
    it('should fetch user info from GitHub API', async () => {
      const { fetchGitHubUser } = await import('../github.js')

      const mockUser = {
        id: 12345,
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://github.com/avatars/12345',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      })

      const result = await fetchGitHubUser('gho_test_token')

      expect(result).toBeDefined()
      expect(result?.id).toBe(12345)
      expect(result?.login).toBe('testuser')
      expect(result?.email).toBe('test@example.com')
    })

    it('should return null on API error', async () => {
      const { fetchGitHubUser } = await import('../github.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await fetchGitHubUser('invalid_token')

      expect(result).toBeNull()
    })
  })

  describe('fetchGitHubEmailWithVerification (T18.10)', () => {
    it('should return primary verified email', async () => {
      const { fetchGitHubEmailWithVerification } = await import('../github.js')

      const mockEmails = [
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'primary@example.com', primary: true, verified: true },
        { email: 'unverified@example.com', primary: false, verified: false },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmails),
      })

      const result = await fetchGitHubEmailWithVerification('gho_test_token')

      expect(result).toBeDefined()
      expect(result?.email).toBe('primary@example.com')
      expect(result?.verified).toBe(true)
    })

    it('should return first verified email if no primary', async () => {
      const { fetchGitHubEmailWithVerification } = await import('../github.js')

      const mockEmails = [
        { email: 'unverified@example.com', primary: false, verified: false },
        { email: 'verified@example.com', primary: false, verified: true },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmails),
      })

      const result = await fetchGitHubEmailWithVerification('gho_test_token')

      expect(result).toBeDefined()
      expect(result?.email).toBe('verified@example.com')
      expect(result?.verified).toBe(true)
    })

    it('should indicate unverified email', async () => {
      const { fetchGitHubEmailWithVerification } = await import('../github.js')

      const mockEmails = [{ email: 'unverified@example.com', primary: true, verified: false }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmails),
      })

      const result = await fetchGitHubEmailWithVerification('gho_test_token')

      expect(result).toBeDefined()
      expect(result?.email).toBe('unverified@example.com')
      expect(result?.verified).toBe(false)
    })

    it('should return null if no emails', async () => {
      const { fetchGitHubEmailWithVerification } = await import('../github.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      const result = await fetchGitHubEmailWithVerification('gho_test_token')

      expect(result).toBeNull()
    })
  })
})

describe('Google OAuth Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isGoogleConfigured', () => {
    it('should check environment variables for configuration', async () => {
      const { isGoogleConfigured } = await import('../google.js')
      // This checks the current state - depends on actual env
      const result = isGoogleConfigured()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('buildGoogleAuthorizationUrl', () => {
    it('should build valid Google authorization URL with state', async () => {
      const { buildGoogleAuthorizationUrl } = await import('../google.js')

      const state = 'test_state_123'
      const url = buildGoogleAuthorizationUrl(state)

      expect(url).toContain('https://accounts.google.com/o/oauth2/')
      expect(url).toContain(`state=${state}`)
      expect(url).toContain('scope=')
      expect(url).toContain('response_type=code')
    })

    it('should include required scopes', async () => {
      const { buildGoogleAuthorizationUrl } = await import('../google.js')

      const url = buildGoogleAuthorizationUrl('test_state')

      // Should include openid, email, profile
      expect(url).toContain('openid')
      expect(url).toContain('email')
      expect(url).toContain('profile')
    })

    it('should support login_hint option', async () => {
      const { buildGoogleAuthorizationUrl } = await import('../google.js')

      const url = buildGoogleAuthorizationUrl('test_state', {
        loginHint: 'user@example.com',
      })

      expect(url).toContain('login_hint=user%40example.com')
    })

    it('should support prompt option', async () => {
      const { buildGoogleAuthorizationUrl } = await import('../google.js')

      const url = buildGoogleAuthorizationUrl('test_state', {
        prompt: 'consent',
      })

      expect(url).toContain('prompt=consent')
    })
  })

  describe('exchangeGoogleCodeForToken', () => {
    it('should return null on network error', async () => {
      const { exchangeGoogleCodeForToken } = await import('../google.js')

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await exchangeGoogleCodeForToken('test_code')

      expect(result).toBeNull()
    })

    it('should return null on non-OK response', async () => {
      const { exchangeGoogleCodeForToken } = await import('../google.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
        text: () => Promise.resolve('{"error":"invalid_grant"}'),
      })

      const result = await exchangeGoogleCodeForToken('invalid_code')

      expect(result).toBeNull()
    })
  })

  describe('fetchGoogleUser', () => {
    it('should fetch user info from Google API', async () => {
      const { fetchGoogleUser } = await import('../google.js')

      const mockUser = {
        sub: '123456789',
        name: 'Test User',
        email: 'test@gmail.com',
        email_verified: true,
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      })

      const result = await fetchGoogleUser('ya29.test_token')

      expect(result).toBeDefined()
      expect(result?.sub).toBe('123456789')
      expect(result?.email).toBe('test@gmail.com')
      expect(result?.email_verified).toBe(true)
    })

    it('should return null on API error', async () => {
      const { fetchGoogleUser } = await import('../google.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await fetchGoogleUser('invalid_token')

      expect(result).toBeNull()
    })
  })

  describe('Google email_verified (T18.10)', () => {
    it('should correctly report email_verified status', async () => {
      const { fetchGoogleUser } = await import('../google.js')

      // Test verified email
      const verifiedUser = {
        sub: '123',
        email: 'verified@gmail.com',
        email_verified: true,
        name: 'Test User',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(verifiedUser),
      })

      const result1 = await fetchGoogleUser('token')
      expect(result1?.email_verified).toBe(true)

      // Test unverified email (rare but possible)
      const unverifiedUser = {
        sub: '456',
        email: 'unverified@custom-domain.com',
        email_verified: false,
        name: 'Test User',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unverifiedUser),
      })

      const result2 = await fetchGoogleUser('token')
      expect(result2?.email_verified).toBe(false)
    })
  })
})

describe('OAuth Error Codes (T18.10)', () => {
  it('should define correct error codes', async () => {
    const { OAuthErrorCode } = await import('../../db/schema/oauth.js')

    expect(OAuthErrorCode.EMAIL_EXISTS_UNVERIFIED).toBe('EMAIL_EXISTS_UNVERIFIED')
    expect(OAuthErrorCode.EMAIL_REQUIRED).toBe('EMAIL_REQUIRED')
  })
})

describe('OAuth State Security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate cryptographically random state', async () => {
    const { generateOAuthState } = await import('../github.js')

    // Generate many states and check for uniqueness
    const states = new Set<string>()
    for (let i = 0; i < 100; i++) {
      states.add(generateOAuthState())
    }

    // All states should be unique
    expect(states.size).toBe(100)
  })

  it('should generate state of sufficient length', async () => {
    const { generateOAuthState } = await import('../github.js')

    const state = generateOAuthState()

    // Should be at least 32 characters (hex-encoded 16 bytes)
    expect(state.length).toBeGreaterThanOrEqual(32)
  })
})
