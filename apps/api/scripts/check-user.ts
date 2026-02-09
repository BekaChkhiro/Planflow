import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import * as schema from '../src/db/schema'

async function checkUser(email: string, password: string) {
  const sql = neon(process.env['DATABASE_URL_POOLED'] || process.env['DATABASE_URL']!)
  const db = drizzle(sql, { schema })

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  if (user.length === 0) {
    console.log('User not found!')
    return
  }

  console.log('User:', user[0].name, user[0].email)
  console.log('Password hash:', user[0].passwordHash.substring(0, 20) + '...')
  console.log('Updated at:', user[0].updatedAt)

  // Test password
  const isValid = await bcrypt.compare(password, user[0].passwordHash)
  console.log('Password "' + password + '" is valid:', isValid)
}

const email = process.argv[2] || 'datiobashvili1@gmail.com'
const password = process.argv[3] || 'Data123!'

checkUser(email, password).catch(console.error)
