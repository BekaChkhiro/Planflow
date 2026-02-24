/**
 * OAuth Authentication Routes
 *
 * Handles OAuth-based login/registration flows (Continue with GitHub/Google).
 * This is separate from integration OAuth (linking repos after login).
 */
import { Hono } from 'hono'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { eq, and } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { jwtAuth, getAuth, authRateLimit, smallBodyLimit } from '../middleware/index.js'
import { generateRefreshToken, hashToken } from '../utils/helpers.js'
import { sendWelcomeEmail, isEmailServiceConfigured } from '../lib/email.js'
import {
  isGitHubConfigured,
  generateOAuthState,
  buildAuthAuthorizationUrl,
  exchangeCodeForTokenAuth,
  fetchGitHubUser,
  fetchGitHubEmailWithVerification,
  GITHUB_SCOPES,
} from '../lib/github.js'
import {
  isGoogleConfigured,
  buildGoogleAuthorizationUrl,
  exchangeGoogleCodeForToken,
  fetchGoogleUser,
  GOOGLE_SCOPES,
} from '../lib/google.js'
import { OAuthErrorCode, type OAuthUserInfo } from '../db/schema/oauth.js'

const oauthRoutes = new Hono()

// =============================================================================
// REQUEST VALIDATION SCHEMAS
// =============================================================================

const OAuthAuthorizeSchema = z.object({
  provider: z.enum(['github', 'google']),
  redirectUrl: z.string().url().optional(),
})

const OAuthCallbackSchema = z.object({
  provider: z.enum(['github', 'google']),
  code: z.string().min(1),
  state: z.string().min(1),
})

const OAuthLinkSchema = z.object({
  provider: z.enum(['github', 'google']),
  redirectUrl: z.string().url().optional(),
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Custom OAuth error with error code for frontend handling
 */
class OAuthError extends Error {
  code: OAuthErrorCode
  details?: {
    existingProvider?: string
    email?: string
  }

  constructor(
    message: string,
    code: OAuthErrorCode,
    details?: { existingProvider?: string; email?: string }
  ) {
    super(message)
    this.name = 'OAuthError'
    this.code = code
    this.details = details
  }
}

/**
 * Generate JWT and refresh tokens for a user
 */
async function generateAuthTokens(userId: string, email: string) {
  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured')
  }

  const expiresIn = Number(process.env['JWT_EXPIRATION']) || 900 // 15 minutes
  const refreshExpiresIn = Number(process.env['REFRESH_TOKEN_EXPIRATION']) || 2592000 // 30 days

  const token = jwt.sign({ userId, email }, jwtSecret, { expiresIn })
  const refreshToken = generateRefreshToken()
  const refreshTokenHash = hashToken(refreshToken)
  const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

  // Store refresh token
  const db = getDbClient()
  await db.insert(schema.refreshTokens).values({
    userId,
    tokenHash: refreshTokenHash,
    expiresAt: refreshExpiresAt,
  })

  return { token, refreshToken, expiresIn, refreshExpiresIn }
}

/**
 * Process OAuth callback - handles login, registration, and account linking
 *
 * Edge cases handled (T18.10):
 * 1. Same email from different providers - check email verification before auto-linking
 * 2. OAuth account already linked to different user
 * 3. Email mismatch (stored separately as providerEmail)
 */
async function processOAuthCallback(
  userInfo: OAuthUserInfo,
  accessToken: string,
  scopes: string[],
  linkToUserId: string | null
): Promise<{
  user: { id: string; email: string; name: string }
  isNewUser: boolean
  isLinkedAccount: boolean
}> {
  const db = getDbClient()

  // Check if OAuth account already exists
  const [existingOAuthAccount] = await db
    .select({
      id: schema.oauthAccounts.id,
      userId: schema.oauthAccounts.userId,
    })
    .from(schema.oauthAccounts)
    .where(
      and(
        eq(schema.oauthAccounts.provider, userInfo.provider),
        eq(schema.oauthAccounts.providerAccountId, userInfo.providerAccountId)
      )
    )
    .limit(1)

  // Case 1: OAuth account exists - login
  if (existingOAuthAccount) {
    // Get the linked user
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.id, existingOAuthAccount.userId))
      .limit(1)

    if (!user) {
      throw new Error('User not found for OAuth account')
    }

    // Update OAuth account with latest tokens
    await db
      .update(schema.oauthAccounts)
      .set({
        accessToken,
        scopes,
        providerEmail: userInfo.email,
        providerName: userInfo.name,
        providerAvatarUrl: userInfo.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.oauthAccounts.id, existingOAuthAccount.id))

    return {
      user: { id: user.id, email: user.email, name: user.name || '' },
      isNewUser: false,
      isLinkedAccount: false,
    }
  }

  // Case 2: Linking to existing account (from settings)
  if (linkToUserId) {
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.id, linkToUserId))
      .limit(1)

    if (!user) {
      throw new Error('User not found for linking')
    }

    // Create OAuth account linked to existing user
    await db.insert(schema.oauthAccounts).values({
      userId: user.id,
      provider: userInfo.provider,
      providerAccountId: userInfo.providerAccountId,
      providerEmail: userInfo.email,
      providerUsername: userInfo.username,
      providerName: userInfo.name,
      providerAvatarUrl: userInfo.avatarUrl,
      accessToken,
      scopes,
    })

    return {
      user: { id: user.id, email: user.email, name: user.name || '' },
      isNewUser: false,
      isLinkedAccount: true,
    }
  }

  // Case 3: Check if user with same email exists (T18.10 - Edge case handling)
  if (userInfo.email) {
    const [existingUser] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.email, userInfo.email.toLowerCase()))
      .limit(1)

    if (existingUser) {
      // User with same email exists - need to decide how to handle

      // Check what OAuth accounts the existing user already has
      const existingOAuthAccounts = await db
        .select({
          provider: schema.oauthAccounts.provider,
        })
        .from(schema.oauthAccounts)
        .where(eq(schema.oauthAccounts.userId, existingUser.id))

      const existingProviders = existingOAuthAccounts.map((acc) => acc.provider)
      const hasPassword = !!(existingUser.passwordHash && existingUser.passwordHash.length > 0)

      // T18.10: If email is NOT verified by the new provider, don't auto-link
      // This prevents account takeover via unverified email
      if (!userInfo.emailVerified) {
        // Determine the existing login method for the error message
        let existingMethod = 'password'
        if (existingProviders.length > 0) {
          existingMethod = existingProviders[0] || 'oauth'
        } else if (!hasPassword) {
          // Edge case: user has account but no login method (shouldn't happen)
          existingMethod = 'unknown'
        }

        throw new OAuthError(
          `An account with this email already exists. Since your ${userInfo.provider} email is not verified, ` +
          `we cannot automatically link your accounts for security reasons. ` +
          `Please sign in with your existing ${existingMethod} account, then link ${userInfo.provider} from Settings.`,
          OAuthErrorCode.EMAIL_EXISTS_UNVERIFIED,
          {
            existingProvider: existingMethod,
            email: userInfo.email,
          }
        )
      }

      // T18.10: Email IS verified - safe to auto-link
      // This is the secure path: provider has verified the email belongs to the user
      await db.insert(schema.oauthAccounts).values({
        userId: existingUser.id,
        provider: userInfo.provider,
        providerAccountId: userInfo.providerAccountId,
        providerEmail: userInfo.email,
        providerUsername: userInfo.username,
        providerName: userInfo.name,
        providerAvatarUrl: userInfo.avatarUrl,
        accessToken,
        scopes,
      })

      return {
        user: { id: existingUser.id, email: existingUser.email, name: existingUser.name || '' },
        isNewUser: false,
        isLinkedAccount: true,
      }
    }
  }

  // Case 4: New user - create account
  if (!userInfo.email) {
    throw new OAuthError(
      'Email is required for registration. Please ensure your email is visible in your provider settings.',
      OAuthErrorCode.EMAIL_REQUIRED
    )
  }

  // Create new user
  const [newUser] = await db
    .insert(schema.users)
    .values({
      email: userInfo.email.toLowerCase(),
      name: userInfo.name || userInfo.username || 'User',
      passwordHash: '', // OAuth users don't have password initially
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })

  if (!newUser) {
    throw new Error('Failed to create user')
  }

  // Create OAuth account for new user
  await db.insert(schema.oauthAccounts).values({
    userId: newUser.id,
    provider: userInfo.provider,
    providerAccountId: userInfo.providerAccountId,
    providerEmail: userInfo.email,
    providerUsername: userInfo.username,
    providerName: userInfo.name,
    providerAvatarUrl: userInfo.avatarUrl,
    accessToken,
    scopes,
  })

  // Send welcome email (non-blocking)
  if (isEmailServiceConfigured()) {
    sendWelcomeEmail(newUser.email, newUser.name || 'there').catch((err) => {
      console.error('Failed to send welcome email:', err)
    })
  }

  return {
    user: { id: newUser.id, email: newUser.email, name: newUser.name || '' },
    isNewUser: true,
    isLinkedAccount: false,
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /auth/oauth/authorize
 *
 * Generate OAuth authorization URL with state token for CSRF protection.
 * User should be redirected to the returned URL.
 */
oauthRoutes.post('/authorize', authRateLimit, smallBodyLimit, async (c) => {
  try {
    const body = await c.req.json()
    const validation = OAuthAuthorizeSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { provider, redirectUrl } = validation.data

    // Check if provider is configured
    if (provider === 'github') {
      if (!isGitHubConfigured()) {
        return c.json(
          {
            success: false,
            error: 'GitHub OAuth is not configured',
          },
          503
        )
      }
    } else if (provider === 'google') {
      if (!isGoogleConfigured()) {
        return c.json(
          {
            success: false,
            error: 'Google OAuth is not configured',
          },
          503
        )
      }
    }

    // Generate state token
    const state = generateOAuthState()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Store state in database
    const db = getDbClient()
    await db.insert(schema.oauthAuthStates).values({
      state,
      provider,
      redirectUrl: redirectUrl || null,
      expiresAt,
    })

    // Build authorization URL
    let authUrl: string
    if (provider === 'github') {
      authUrl = buildAuthAuthorizationUrl(state)
    } else {
      // Google OAuth
      authUrl = buildGoogleAuthorizationUrl(state)
    }

    return c.json({
      success: true,
      data: {
        url: authUrl,
        state,
        expiresIn: 900, // 15 minutes in seconds
      },
    })
  } catch (error) {
    console.error('OAuth authorize error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

/**
 * POST /auth/oauth/callback
 *
 * Exchange OAuth code for access token and log in or register user.
 * Returns JWT tokens for authentication.
 */
oauthRoutes.post('/callback', authRateLimit, smallBodyLimit, async (c) => {
  try {
    const body = await c.req.json()
    const validation = OAuthCallbackSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { provider, code, state } = validation.data
    const db = getDbClient()

    // Validate state token
    const [storedState] = await db
      .select()
      .from(schema.oauthAuthStates)
      .where(
        and(
          eq(schema.oauthAuthStates.state, state),
          eq(schema.oauthAuthStates.provider, provider)
        )
      )
      .limit(1)

    if (!storedState) {
      return c.json(
        {
          success: false,
          error: 'Invalid state token',
        },
        400
      )
    }

    // Check if state is expired
    if (new Date() > storedState.expiresAt) {
      return c.json(
        {
          success: false,
          error: 'State token has expired',
        },
        400
      )
    }

    // Check if state was already used
    if (storedState.usedAt) {
      return c.json(
        {
          success: false,
          error: 'State token has already been used',
        },
        400
      )
    }

    // Mark state as used
    await db
      .update(schema.oauthAuthStates)
      .set({ usedAt: new Date() })
      .where(eq(schema.oauthAuthStates.id, storedState.id))

    // Exchange code for access token
    let accessToken: string
    let scopes: string[]
    let userInfo: OAuthUserInfo

    if (provider === 'github') {
      const tokenResult = await exchangeCodeForTokenAuth(code)
      if (!tokenResult) {
        return c.json(
          {
            success: false,
            error: 'Failed to exchange code for token',
          },
          400
        )
      }

      accessToken = tokenResult.accessToken
      scopes = tokenResult.scope.split(' ').filter(Boolean)

      // Fetch user info from GitHub
      const githubUser = await fetchGitHubUser(accessToken)
      if (!githubUser) {
        return c.json(
          {
            success: false,
            error: 'Failed to fetch GitHub user info',
          },
          400
        )
      }

      // Get email with verification status (T18.10)
      let email = githubUser.email
      let emailVerified = false // Assume unverified if from profile

      if (!email) {
        // Fetch from /user/emails endpoint which includes verification status
        const emailResult = await fetchGitHubEmailWithVerification(accessToken)
        if (emailResult) {
          email = emailResult.email
          emailVerified = emailResult.verified
        }
      } else {
        // Email from profile - need to verify from /user/emails
        const emailResult = await fetchGitHubEmailWithVerification(accessToken)
        if (emailResult && emailResult.email.toLowerCase() === email.toLowerCase()) {
          emailVerified = emailResult.verified
        }
      }

      userInfo = {
        provider: 'github',
        providerAccountId: String(githubUser.id),
        email,
        emailVerified,
        username: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      }
    } else {
      // Google OAuth
      const tokenResult = await exchangeGoogleCodeForToken(code)
      if (!tokenResult) {
        return c.json(
          {
            success: false,
            error: 'Failed to exchange code for token',
          },
          400
        )
      }

      accessToken = tokenResult.accessToken
      scopes = tokenResult.scope.split(' ').filter(Boolean)

      // Fetch user info from Google
      const googleUser = await fetchGoogleUser(accessToken)
      if (!googleUser) {
        return c.json(
          {
            success: false,
            error: 'Failed to fetch Google user info',
          },
          400
        )
      }

      userInfo = {
        provider: 'google',
        providerAccountId: googleUser.sub,
        email: googleUser.email,
        // Google always verifies email before allowing OAuth
        // The email_verified field confirms this (T18.10)
        emailVerified: googleUser.email_verified,
        username: null, // Google doesn't have usernames
        name: googleUser.name,
        avatarUrl: googleUser.picture,
      }
    }

    // Process the OAuth callback (login/register/link)
    const result = await processOAuthCallback(
      userInfo,
      accessToken,
      scopes,
      storedState.linkToUserId
    )

    // Generate auth tokens
    const tokens = await generateAuthTokens(result.user.id, result.user.email)

    return c.json({
      success: true,
      data: {
        user: result.user,
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        refreshExpiresIn: tokens.refreshExpiresIn,
        isNewUser: result.isNewUser,
        isLinkedAccount: result.isLinkedAccount,
        redirectUrl: storedState.redirectUrl,
      },
    })
  } catch (error) {
    console.error('OAuth callback error:', error)

    // Handle specific OAuth errors with error codes (T18.10)
    if (error instanceof OAuthError) {
      return c.json(
        {
          success: false,
          error: error.message,
          errorCode: error.code,
          details: error.details,
        },
        400
      )
    }

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      500
    )
  }
})

/**
 * GET /auth/oauth/accounts
 *
 * List OAuth accounts linked to the authenticated user.
 * Protected route - requires JWT authentication.
 *
 * Also returns `hasPassword` to help frontend determine if unlinking is allowed.
 */
oauthRoutes.get('/accounts', jwtAuth, async (c) => {
  try {
    const authContext = getAuth(c)
    const db = getDbClient()

    // Get user's OAuth accounts
    const accounts = await db
      .select({
        id: schema.oauthAccounts.id,
        provider: schema.oauthAccounts.provider,
        providerEmail: schema.oauthAccounts.providerEmail,
        providerUsername: schema.oauthAccounts.providerUsername,
        providerName: schema.oauthAccounts.providerName,
        providerAvatarUrl: schema.oauthAccounts.providerAvatarUrl,
        createdAt: schema.oauthAccounts.createdAt,
      })
      .from(schema.oauthAccounts)
      .where(eq(schema.oauthAccounts.userId, authContext.user.id))

    // Check if user has a password set
    const [user] = await db
      .select({
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, authContext.user.id))
      .limit(1)

    const hasPassword = !!(user?.passwordHash && user.passwordHash.length > 0)

    return c.json({
      success: true,
      data: {
        accounts,
        hasPassword,
      },
    })
  } catch (error) {
    console.error('Get OAuth accounts error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

/**
 * POST /auth/oauth/link
 *
 * Generate OAuth authorization URL to link a new provider to existing account.
 * Protected route - requires JWT authentication.
 */
oauthRoutes.post('/link', jwtAuth, authRateLimit, smallBodyLimit, async (c) => {
  try {
    const authContext = getAuth(c)
    const body = await c.req.json()
    const validation = OAuthLinkSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { provider, redirectUrl } = validation.data
    const db = getDbClient()

    // Check if provider is already linked
    const [existingAccount] = await db
      .select({ id: schema.oauthAccounts.id })
      .from(schema.oauthAccounts)
      .where(
        and(
          eq(schema.oauthAccounts.userId, authContext.user.id),
          eq(schema.oauthAccounts.provider, provider)
        )
      )
      .limit(1)

    if (existingAccount) {
      return c.json(
        {
          success: false,
          error: `${provider} account is already linked`,
        },
        409
      )
    }

    // Check if provider is configured
    if (provider === 'github') {
      if (!isGitHubConfigured()) {
        return c.json(
          {
            success: false,
            error: 'GitHub OAuth is not configured',
          },
          503
        )
      }
    } else if (provider === 'google') {
      if (!isGoogleConfigured()) {
        return c.json(
          {
            success: false,
            error: 'Google OAuth is not configured',
          },
          503
        )
      }
    }

    // Generate state token with link flag
    const state = generateOAuthState()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Store state with linkToUserId
    await db.insert(schema.oauthAuthStates).values({
      state,
      provider,
      redirectUrl: redirectUrl || null,
      linkToUserId: authContext.user.id,
      expiresAt,
    })

    // Build authorization URL
    let authUrl: string
    if (provider === 'github') {
      authUrl = buildAuthAuthorizationUrl(state)
    } else {
      // Google OAuth - hint user's email for easier linking
      authUrl = buildGoogleAuthorizationUrl(state, {
        loginHint: authContext.user.email,
        prompt: 'consent',
      })
    }

    return c.json({
      success: true,
      data: {
        url: authUrl,
        state,
        expiresIn: 900,
      },
    })
  } catch (error) {
    console.error('OAuth link error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

/**
 * DELETE /auth/oauth/accounts/:provider
 *
 * Unlink an OAuth provider from the authenticated user's account.
 * Protected route - requires JWT authentication.
 *
 * Note: Users must have at least one login method (password or another OAuth).
 */
oauthRoutes.delete('/accounts/:provider', jwtAuth, async (c) => {
  try {
    const authContext = getAuth(c)
    const provider = c.req.param('provider') as 'github' | 'google'
    const db = getDbClient()

    // Validate provider
    if (provider !== 'github' && provider !== 'google') {
      return c.json(
        {
          success: false,
          error: 'Invalid provider',
        },
        400
      )
    }

    // Get user to check if they have a password
    const [user] = await db
      .select({
        id: schema.users.id,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, authContext.user.id))
      .limit(1)

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        404
      )
    }

    // Count OAuth accounts for this user
    const oauthAccounts = await db
      .select({ id: schema.oauthAccounts.id, provider: schema.oauthAccounts.provider })
      .from(schema.oauthAccounts)
      .where(eq(schema.oauthAccounts.userId, authContext.user.id))

    // Check if user has password or another OAuth account
    const hasPassword = user.passwordHash && user.passwordHash.length > 0
    const otherOAuthAccounts = oauthAccounts.filter((acc) => acc.provider !== provider)

    if (!hasPassword && otherOAuthAccounts.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Cannot unlink the only login method. Set a password first or link another OAuth provider.',
        },
        400
      )
    }

    // Find and delete the OAuth account
    const accountToDelete = oauthAccounts.find((acc) => acc.provider === provider)

    if (!accountToDelete) {
      return c.json(
        {
          success: false,
          error: `${provider} account is not linked`,
        },
        404
      )
    }

    await db
      .delete(schema.oauthAccounts)
      .where(eq(schema.oauthAccounts.id, accountToDelete.id))

    return c.json({
      success: true,
      data: {
        message: `${provider} account unlinked successfully`,
      },
    })
  } catch (error) {
    console.error('OAuth unlink error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

/**
 * GET /auth/oauth/providers
 *
 * Get available OAuth providers and their configuration status.
 * Public route - no authentication required.
 */
oauthRoutes.get('/providers', async (c) => {
  return c.json({
    success: true,
    data: {
      providers: [
        {
          id: 'github',
          name: 'GitHub',
          configured: isGitHubConfigured(),
          scopes: GITHUB_SCOPES,
        },
        {
          id: 'google',
          name: 'Google',
          configured: isGoogleConfigured(),
          scopes: GOOGLE_SCOPES,
        },
      ],
    },
  })
})

export { oauthRoutes }
