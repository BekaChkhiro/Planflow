/**
 * Script to reset a user's password
 * Usage: npx tsx scripts/reset-password.ts <email> <new-password>
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import * as schema from '../src/db/schema'

async function resetPassword(email: string, newPassword: string) {
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
    console.error(`User with email "${email}" not found`)
    process.exit(1)
  }

  console.log(`Found user: ${user[0].name} (${user[0].email})`)

  // Hash the new password
  const saltRounds = 12
  const passwordHash = await bcrypt.hash(newPassword, saltRounds)

  // Update password in database
  await db
    .update(schema.users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user[0].id))

  console.log(`\nSuccessfully reset password for ${email}!`)
}

// Get arguments from command line
const email = process.argv[2]
const newPassword = process.argv[3]

if (!email || !newPassword) {
  console.error('Usage: npx tsx scripts/reset-password.ts <email> <new-password>')
  process.exit(1)
}

if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters long')
  process.exit(1)
}

resetPassword(email, newPassword).catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
