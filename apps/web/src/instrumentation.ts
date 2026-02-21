/**
 * Next.js Instrumentation
 *
 * This file is used to initialize monitoring tools like Sentry.
 * It runs before your application starts.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    // Server-side Sentry initialization
    await import('../sentry.server.config')
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    // Edge runtime Sentry initialization
    await import('../sentry.edge.config')
  }
}
