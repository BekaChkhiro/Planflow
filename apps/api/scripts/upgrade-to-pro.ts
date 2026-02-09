/**
 * Script to upgrade a user to Pro tier
 * Usage: npx tsx scripts/upgrade-to-pro.ts <email> [--lifetime]
 */

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'

async function upgradeUserToPro(email: string, lifetime: boolean = false) {
  const connectionString = process.env['DATABASE_URL_POOLED'] || process.env['DATABASE_URL']

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_URL_POOLED environment variable is required')
  }

  const sql = neon(connectionString)
  const db = drizzle(sql, { schema })

  // Find user by email
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  if (user.length === 0) {
    console.error(`❌ User with email "${email}" not found`)
    process.exit(1)
  }

  const userId = user[0].id
  console.log(`✓ Found user: ${user[0].name} (${user[0].email})`)

  // Check if subscription exists
  const existingSubscription = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1)

  const now = new Date()
  // Set period end: lifetime = 100 years, otherwise 1 year
  const yearsToAdd = lifetime ? 100 : 1
  const periodEnd = new Date(now.getTime() + yearsToAdd * 365 * 24 * 60 * 60 * 1000)

  if (existingSubscription.length > 0) {
    // Update existing subscription
    await db
      .update(schema.subscriptions)
      .set({
        tier: 'pro',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        updatedAt: now,
      })
      .where(eq(schema.subscriptions.userId, userId))

    console.log(`✓ Updated subscription to Pro tier`)
  } else {
    // Create new subscription
    await db.insert(schema.subscriptions).values({
      userId,
      tier: 'pro',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })

    console.log(`✓ Created new Pro subscription`)
  }

  console.log(`\n🎉 Successfully upgraded ${email} to Pro tier!`)
  if (lifetime) {
    console.log(`   Period: LIFETIME (${periodEnd.getFullYear()})`)
  } else {
    console.log(`   Period: ${now.toISOString()} - ${periodEnd.toISOString()}`)
  }
}

// Get email from command line argument
const args = process.argv.slice(2)
const lifetime = args.includes('--lifetime')
const email = args.find(arg => !arg.startsWith('--'))

if (!email) {
  console.error('Usage: npx tsx scripts/upgrade-to-pro.ts <email> [--lifetime]')
  process.exit(1)
}

upgradeUserToPro(email, lifetime).catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
