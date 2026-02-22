import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import {
  UpdateProfileRequestSchema,
  ChangePasswordRequestSchema,
} from '@planflow/shared'
import { getDbClient, schema } from '../db/index.js'
import {
  jwtAuth,
  getAuth,
  passwordRateLimit,
  smallBodyLimit,
} from '../middleware/index.js'

const usersRoutes = new Hono()

// Update user profile
usersRoutes.patch('/profile', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = UpdateProfileRequestSchema.safeParse(body)

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

    const { name, email } = validation.data

    // Check if at least one field is provided
    if (name === undefined && email === undefined) {
      return c.json(
        {
          success: false,
          error: 'At least one field (name or email) must be provided',
        },
        400
      )
    }

    const db = getDbClient()

    // If email is being changed, check if it's already taken
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase()))
        .limit(1)

      if (existingUser.length > 0) {
        return c.json(
          {
            success: false,
            error: 'A user with this email already exists',
          },
          409
        )
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (email !== undefined) updateData['email'] = email.toLowerCase()

    const [updatedUser] = await db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, user.id))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })

    if (!updatedUser) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        user: updatedUser,
      },
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Change password (with rate limiting)
usersRoutes.patch('/password', passwordRateLimit, smallBodyLimit, jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = ChangePasswordRequestSchema.safeParse(body)

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

    const { currentPassword, newPassword } = validation.data
    const db = getDbClient()

    // Get user's current password hash
    const [currentUser] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    if (!currentUser) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        404
      )
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.passwordHash)

    if (!isValidPassword) {
      return c.json(
        {
          success: false,
          error: 'Current password is incorrect',
        },
        401
      )
    }

    // Hash new password
    const saltRounds = 12
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds)

    // Update password
    await db
      .update(schema.users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id))

    return c.json({
      success: true,
      data: {
        message: 'Password changed successfully',
      },
    })
  } catch (error) {
    console.error('Change password error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

export { usersRoutes }
