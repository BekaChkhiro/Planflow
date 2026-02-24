/**
 * Google OAuth Utilities
 *
 * Handles Google OAuth flow for "Continue with Google" authentication.
 * Similar to github.ts but for Google OAuth 2.0.
 */
import crypto from 'crypto'

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] || ''
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] || ''
const GOOGLE_REDIRECT_URI = process.env['GOOGLE_REDIRECT_URI'] || ''

// Google OAuth URLs
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

// Google OAuth scopes for authentication
// - openid: Required for OpenID Connect
// - email: Access user's email address
// - profile: Access user's basic profile (name, picture)
export const GOOGLE_SCOPES = ['openid', 'email', 'profile']

/**
 * Check if Google OAuth is configured
 */
export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI)
}

/**
 * Get Google OAuth configuration info (without secrets)
 */
export function getGoogleConfig() {
  return {
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: GOOGLE_SCOPES,
    configured: isGoogleConfigured(),
  }
}

/**
 * Generate a secure random state token for CSRF protection
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Build the Google OAuth authorization URL
 *
 * @param state - CSRF protection state token
 * @param options - Additional options
 */
export function buildGoogleAuthorizationUrl(
  state: string,
  options: {
    prompt?: 'none' | 'consent' | 'select_account'
    loginHint?: string
  } = {}
): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state,
    access_type: 'offline', // Request refresh token
    include_granted_scopes: 'true',
  })

  // Prompt for consent to get refresh token (first time or if needed)
  if (options.prompt) {
    params.set('prompt', options.prompt)
  } else {
    // Default to consent to ensure we get a refresh token
    params.set('prompt', 'consent')
  }

  // Pre-fill email if provided (for linking accounts)
  if (options.loginHint) {
    params.set('login_hint', options.loginHint)
  }

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export interface GoogleTokenResponse {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  tokenType: string
  idToken: string | null
  scope: string
}

export async function exchangeGoogleCodeForToken(
  code: string
): Promise<GoogleTokenResponse | null> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }).toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google token exchange failed:', response.status, errorText)
      return null
    }

    const data = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      token_type?: string
      id_token?: string
      scope?: string
      error?: string
      error_description?: string
    }

    if (data.error) {
      console.error('Google OAuth error:', data.error, data.error_description)
      return null
    }

    if (!data.access_token) {
      console.error('No access token in Google response')
      return null
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type || 'Bearer',
      idToken: data.id_token || null,
      scope: data.scope || '',
    }
  } catch (error) {
    console.error('Error exchanging Google code for token:', error)
    return null
  }
}

/**
 * Google user info from userinfo endpoint
 */
export interface GoogleUser {
  sub: string // Google's unique user ID
  email: string
  email_verified: boolean
  name: string | null
  given_name: string | null
  family_name: string | null
  picture: string | null
  locale: string | null
}

/**
 * Fetch Google user info using access token
 */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser | null> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch Google user:', response.status, response.statusText)
      return null
    }

    const data = (await response.json()) as GoogleUser

    return {
      sub: data.sub,
      email: data.email,
      email_verified: data.email_verified,
      name: data.name,
      given_name: data.given_name,
      family_name: data.family_name,
      picture: data.picture,
      locale: data.locale,
    }
  } catch (error) {
    console.error('Error fetching Google user:', error)
    return null
  }
}

/**
 * Refresh Google access token using refresh token
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    if (!response.ok) {
      console.error('Google token refresh failed:', response.status, response.statusText)
      return null
    }

    const data = (await response.json()) as {
      access_token?: string
      expires_in?: number
      error?: string
    }

    if (data.error || !data.access_token) {
      console.error('Google refresh token error:', data.error)
      return null
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    }
  } catch (error) {
    console.error('Error refreshing Google token:', error)
    return null
  }
}

/**
 * Check if access token is still valid
 */
export async function validateGoogleAccessToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return response.ok
  } catch {
    return false
  }
}

/**
 * Revoke Google access token
 * Unlike GitHub, Google has a revocation endpoint
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    // Google returns 200 on success
    return response.ok
  } catch (error) {
    console.error('Error revoking Google token:', error)
    return false
  }
}
