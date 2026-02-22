import { Hono } from 'hono'
import { CreateCheckoutRequestSchema } from '@planflow/shared'
import { auth, jwtAuth, getAuth } from '../middleware/index.js'
import { subscriptionService, ServiceError } from '../services/index.js'
import { logger } from '../lib/logger.js'

const subscriptionsRoutes = new Hono()

// Helper to handle service errors
const handleServiceError = (c: any, error: unknown) => {
  if (error instanceof ServiceError) {
    return c.json({
      success: false,
      error: error.message,
      code: error.code,
    }, error.statusCode as any)
  }

  logger.error({ err: error }, 'Subscription error')
  return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
}

// GET /subscriptions/current - Get current subscription (supports both JWT and API tokens)
subscriptionsRoutes.get('/current', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const subscription = await subscriptionService.getCurrentSubscription(user.id)

    return c.json({
      success: true,
      data: { subscription },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /subscriptions/checkout - Create checkout session (JWT only)
subscriptionsRoutes.post('/checkout', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateCheckoutRequestSchema.safeParse(body)

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

    const { tier } = validation.data

    // Build redirect URLs - use web app URL from referrer or fallback
    const origin = c.req.header('origin') || c.req.header('referer')?.replace(/\/$/, '') || 'http://localhost:3000'
    const successUrl = `${origin}/checkout/success`
    const cancelUrl = `${origin}/checkout/cancel`

    const checkoutUrl = await subscriptionService.createCheckout(user.id, {
      tier,
      successUrl,
      cancelUrl,
    })

    return c.json({
      success: true,
      data: { checkoutUrl },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /subscriptions/portal - Create customer portal session (JWT only)
subscriptionsRoutes.post('/portal', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const portalUrl = await subscriptionService.createPortalUrl(user.id)

    return c.json({
      success: true,
      data: { portalUrl },
    })
  } catch (error) {
    // Handle specific error for no billing account
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') {
      return c.json(
        {
          success: false,
          error: 'No billing account found. You may be on the free tier or your subscription is still being set up.',
        },
        404
      )
    }
    return handleServiceError(c, error)
  }
})

export { subscriptionsRoutes }
