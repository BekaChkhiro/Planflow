import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@planflow/shared'],

  // Enable React strict mode for development
  reactStrictMode: true,

  // Optimize images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },

  // Redirects (add as needed)
  async redirects() {
    return []
  },
}

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Organization and project from Sentry dashboard
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for source map upload
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only upload source maps in production builds
  silent: !process.env.CI,

  // Hide source maps from the client (recommended for security)
  hideSourceMaps: true,

  // Disable source map upload in development
  disableServerWebpackPlugin: process.env.NODE_ENV !== 'production',
  disableClientWebpackPlugin: process.env.NODE_ENV !== 'production',

  // Automatically instrument components for better error context
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite
  // This can help avoid ad blockers blocking Sentry requests
  tunnelRoute: '/monitoring',

  // Automatically tree-shake unused Sentry code
  disableLogger: true,
}

// Only wrap with Sentry if DSN is configured
const config = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig

export default config
