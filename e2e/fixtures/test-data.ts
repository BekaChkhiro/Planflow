/**
 * Test data and factories for E2E tests
 */

export const testUsers = {
  standard: {
    email: 'test@planflow.tools',
    password: 'TestPassword123!',
    name: 'Test User',
  },
  proUser: {
    email: 'pro@planflow.tools',
    password: 'ProPassword123!',
    name: 'Pro User',
  },
  // For registration tests - unique email each time
  newUser: () => ({
    email: `newuser-${Date.now()}@planflow.tools`,
    password: 'NewUserPassword123!',
    name: 'New Test User',
  }),
};

export const testProjects = {
  sample: {
    name: 'Test Project',
    description: 'A test project for E2E testing',
  },
  withPlan: {
    name: 'Project With Plan',
    description: 'A project with a complete plan',
  },
  // Generate unique project name
  unique: () => ({
    name: `Test Project ${Date.now()}`,
    description: `E2E test project created at ${new Date().toISOString()}`,
  }),
};

export const testTokens = {
  standard: {
    name: 'Test Token',
    expiresInDays: 30,
  },
  neverExpires: {
    name: 'Permanent Token',
    // No expiresInDays means never expires
  },
  shortLived: {
    name: 'Short-lived Token',
    expiresInDays: 1,
  },
  // Generate unique token name
  unique: () => ({
    name: `Token ${Date.now()}`,
    expiresInDays: 30,
  }),
};

// API response types for type safety in tests
export interface AuthResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string;
      name: string;
    };
    token: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  };
  error?: string;
}

export interface ProjectResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    description: string | null;
    userId: string;
    plan: unknown;
    createdAt: string;
    updatedAt: string;
  };
  error?: string;
}

export interface ProjectsListResponse {
  success: boolean;
  data?: Array<ProjectResponse['data']>;
  error?: string;
}

export interface ApiTokenResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    token?: string; // Only returned on creation
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
  error?: string;
}

export interface ApiTokensListResponse {
  success: boolean;
  data?: Array<Omit<ApiTokenResponse['data'], 'token'>>;
  error?: string;
}

// =============================================================================
// OAuth Types
// =============================================================================

export interface OAuthAuthorizeResponse {
  success: boolean;
  data?: {
    url: string;
    state: string;
    expiresIn: number;
  };
  error?: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string;
      name: string;
    };
    token: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    isNewUser: boolean;
    isLinkedAccount: boolean;
    redirectUrl?: string;
  };
  error?: string;
  errorCode?: string;
  details?: {
    existingProvider?: string;
    email?: string;
  };
}

export interface OAuthAccount {
  id: string;
  provider: 'github' | 'google';
  providerEmail: string | null;
  providerUsername: string | null;
  providerName: string | null;
  providerAvatarUrl: string | null;
  createdAt: string;
}

export interface OAuthAccountsResponse {
  success: boolean;
  data?: {
    accounts: OAuthAccount[];
    hasPassword: boolean;
  };
  error?: string;
}

export interface OAuthProvidersResponse {
  success: boolean;
  data?: {
    providers: Array<{
      id: string;
      name: string;
      configured: boolean;
      scopes: string[];
    }>;
  };
  error?: string;
}

// OAuth Error Codes (T18.10)
export const OAuthErrorCodes = {
  EMAIL_EXISTS_UNVERIFIED: 'EMAIL_EXISTS_UNVERIFIED',
  EMAIL_EXISTS_DIFFERENT_PROVIDER: 'EMAIL_EXISTS_DIFFERENT_PROVIDER',
  EMAIL_REQUIRED: 'EMAIL_REQUIRED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  INVALID_STATE: 'INVALID_STATE',
  STATE_EXPIRED: 'STATE_EXPIRED',
  STATE_USED: 'STATE_USED',
} as const;

export type OAuthErrorCode = typeof OAuthErrorCodes[keyof typeof OAuthErrorCodes];
