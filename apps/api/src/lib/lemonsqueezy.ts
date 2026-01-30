/**
 * LemonSqueezy API Client
 *
 * Creates checkout sessions for PlanFlow subscriptions.
 * API Docs: https://docs.lemonsqueezy.com/api
 */

const LEMON_SQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1'

interface CreateCheckoutOptions {
  variantId: string
  userId: string
  userEmail: string
  successUrl: string
  cancelUrl: string
}

interface LemonSqueezyCheckoutResponse {
  data: {
    id: string
    type: 'checkouts'
    attributes: {
      url: string
    }
  }
}

/**
 * Creates a LemonSqueezy checkout URL for a subscription.
 *
 * @param options - Checkout options including variant, user info, and redirect URLs
 * @returns The checkout URL where the user should be redirected
 */
export async function createCheckoutUrl(options: CreateCheckoutOptions): Promise<string> {
  const apiKey = process.env['LEMON_SQUEEZY_API_KEY']
  const storeId = process.env['LEMON_SQUEEZY_STORE_ID']

  if (!apiKey) {
    throw new Error('LEMON_SQUEEZY_API_KEY is not configured')
  }

  if (!storeId) {
    throw new Error('LEMON_SQUEEZY_STORE_ID is not configured')
  }

  const { variantId, userId, userEmail, successUrl, cancelUrl } = options

  const response = await fetch(`${LEMON_SQUEEZY_API_URL}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: userEmail,
            custom: {
              user_id: userId,
            },
          },
          checkout_options: {
            embed: false,
            media: true,
            logo: true,
          },
          product_options: {
            redirect_url: successUrl,
          },
          expires_at: null,
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: storeId,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variantId,
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('LemonSqueezy API error:', errorText)
    throw new Error(`Failed to create checkout: ${response.status}`)
  }

  const data = (await response.json()) as LemonSqueezyCheckoutResponse

  // Return the URL directly - don't modify it as it contains a signature
  return data.data.attributes.url
}

/**
 * Maps a LemonSqueezy variant ID to a subscription tier.
 */
export function getVariantIdForTier(tier: 'pro' | 'team'): string {
  const proVariantId = process.env['LEMON_SQUEEZY_PRO_VARIANT_ID']
  const teamVariantId = process.env['LEMON_SQUEEZY_TEAM_VARIANT_ID']

  if (tier === 'pro') {
    if (!proVariantId) {
      throw new Error('LEMON_SQUEEZY_PRO_VARIANT_ID is not configured')
    }
    return proVariantId
  }

  if (!teamVariantId) {
    throw new Error('LEMON_SQUEEZY_TEAM_VARIANT_ID is not configured')
  }
  return teamVariantId
}

/**
 * Maps a LemonSqueezy variant ID to a subscription tier.
 */
export function getTierFromVariantId(variantId: string): 'pro' | 'team' | null {
  const proVariantId = process.env['LEMON_SQUEEZY_PRO_VARIANT_ID']
  const teamVariantId = process.env['LEMON_SQUEEZY_TEAM_VARIANT_ID']

  if (variantId === proVariantId) {
    return 'pro'
  }
  if (variantId === teamVariantId) {
    return 'team'
  }
  return null
}

/**
 * Maps LemonSqueezy subscription status to our internal status.
 */
export function mapLemonSqueezyStatus(
  status: string
): 'active' | 'canceled' | 'past_due' | 'trialing' {
  switch (status) {
    case 'active':
      return 'active'
    case 'on_trial':
      return 'trialing'
    case 'paused':
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'cancelled':
    case 'expired':
      return 'canceled'
    default:
      return 'active'
  }
}

interface LemonSqueezyCustomerPortalResponse {
  data: {
    type: 'customer-portals'
    id: string
    attributes: {
      url: string
    }
  }
}

/**
 * Creates a LemonSqueezy customer portal URL.
 * The customer portal allows users to manage their subscription, payment methods, and invoices.
 *
 * @param customerId - The LemonSqueezy customer ID
 * @returns The portal URL where the user should be redirected
 */
export async function createCustomerPortalUrl(customerId: string): Promise<string> {
  const apiKey = process.env['LEMON_SQUEEZY_API_KEY']

  if (!apiKey) {
    throw new Error('LEMON_SQUEEZY_API_KEY is not configured')
  }

  const response = await fetch(`${LEMON_SQUEEZY_API_URL}/customers/${customerId}/customer-portal`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('LemonSqueezy customer portal API error:', errorText)
    throw new Error(`Failed to create customer portal: ${response.status}`)
  }

  const data = (await response.json()) as LemonSqueezyCustomerPortalResponse

  return data.data.attributes.url
}

/**
 * Verifies a LemonSqueezy webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env['LEMON_SQUEEZY_WEBHOOK_SECRET']

  if (!secret) {
    console.error('LEMON_SQUEEZY_WEBHOOK_SECRET is not configured')
    return false
  }

  // LemonSqueezy uses HMAC SHA256 for webhook signatures
  const crypto = require('crypto')
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

// ============================================
// Webhook Types
// ============================================

/**
 * LemonSqueezy webhook event names
 */
export type LemonSqueezyWebhookEvent =
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_resumed'
  | 'subscription_paused'
  | 'subscription_expired'
  | 'subscription_payment_success'
  | 'subscription_payment_failed'
  | 'order_created'
  | 'order_refunded'

/**
 * LemonSqueezy subscription status values
 */
export type LemonSqueezySubscriptionStatus =
  | 'on_trial'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'unpaid'
  | 'cancelled'
  | 'expired'

/**
 * Custom data passed through checkout
 */
export interface LemonSqueezyCustomData {
  user_id?: string
  [key: string]: unknown
}

/**
 * Subscription item with custom data
 */
export interface LemonSqueezySubscriptionItem {
  custom_data?: LemonSqueezyCustomData
}

/**
 * Order item with custom data
 */
export interface LemonSqueezyOrderItem {
  custom_data?: LemonSqueezyCustomData
}

/**
 * Subscription attributes from webhook payload
 */
export interface LemonSqueezySubscriptionAttributes {
  store_id: number
  customer_id: number
  order_id: number
  product_id: number
  variant_id: number
  product_name: string
  variant_name: string
  user_name: string
  user_email: string
  status: LemonSqueezySubscriptionStatus
  status_formatted: string
  card_brand: string | null
  card_last_four: string | null
  pause: unknown
  cancelled: boolean
  trial_ends_at: string | null
  billing_anchor: number
  renews_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
  test_mode: boolean
  first_subscription_item?: LemonSqueezySubscriptionItem
}

/**
 * Order attributes from webhook payload
 */
export interface LemonSqueezyOrderAttributes {
  store_id: number
  customer_id: number
  identifier: string
  order_number: number
  user_name: string
  user_email: string
  currency: string
  currency_rate: string
  subtotal: number
  discount_total: number
  tax: number
  total: number
  subtotal_usd: number
  discount_total_usd: number
  tax_usd: number
  total_usd: number
  tax_name: string
  tax_rate: string
  status: string
  status_formatted: string
  refunded: boolean
  refunded_at: string | null
  refunded_amount: number
  subtotal_formatted: string
  discount_total_formatted: string
  tax_formatted: string
  total_formatted: string
  created_at: string
  updated_at: string
  test_mode: boolean
  first_order_item?: LemonSqueezyOrderItem
}

/**
 * Webhook meta information
 */
export interface LemonSqueezyWebhookMeta {
  event_name: LemonSqueezyWebhookEvent
  event_id: string
  webhook_id: string
  custom_data?: LemonSqueezyCustomData
  test_mode: boolean
}

/**
 * Full webhook payload structure
 */
export interface LemonSqueezyWebhookPayload {
  meta: LemonSqueezyWebhookMeta
  data: {
    type: 'subscriptions' | 'orders'
    id: string
    attributes: LemonSqueezySubscriptionAttributes | LemonSqueezyOrderAttributes
  }
}
