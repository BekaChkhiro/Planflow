/**
 * Environment-specific configuration for performance tests
 */

// Detect environment from env var or default to local
const ENV = __ENV.PERF_ENV || 'local';

// Environment configurations
const environments = {
  local: {
    baseUrl: __ENV.API_URL || 'http://localhost:3001',
    // Test credentials (should be seeded before running tests)
    testUser: {
      email: 'perf-test@planflow.dev',
      password: 'PerfTest123!',
    },
    proUser: {
      email: 'perf-pro@planflow.dev',
      password: 'PerfPro123!',
    },
    // Lower VU counts for local testing
    maxVUs: 50,
    // Shorter durations for local
    defaultDuration: '30s',
  },

  staging: {
    baseUrl: __ENV.API_URL || 'https://api-staging.planflow.dev',
    testUser: {
      email: 'perf-test@planflow.dev',
      password: __ENV.PERF_TEST_PASSWORD || 'PerfTest123!',
    },
    proUser: {
      email: 'perf-pro@planflow.dev',
      password: __ENV.PERF_PRO_PASSWORD || 'PerfPro123!',
    },
    // Higher limits for staging
    maxVUs: 300,
    defaultDuration: '5m',
  },

  production: {
    baseUrl: __ENV.API_URL || 'https://api.planflow.dev',
    testUser: {
      email: 'perf-test@planflow.dev',
      password: __ENV.PERF_TEST_PASSWORD,
    },
    proUser: {
      email: 'perf-pro@planflow.dev',
      password: __ENV.PERF_PRO_PASSWORD,
    },
    // Be conservative in production
    maxVUs: 100,
    defaultDuration: '2m',
  },
};

// Get current environment config
export const config = environments[ENV] || environments.local;

// Export individual values for convenience
export const baseUrl = config.baseUrl;
export const testUser = config.testUser;
export const proUser = config.proUser;
export const maxVUs = config.maxVUs;
export const defaultDuration = config.defaultDuration;

// Log environment on import
console.log(`[Perf] Environment: ${ENV}`);
console.log(`[Perf] Base URL: ${baseUrl}`);
