import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { CreateFeedbackRequestSchema } from '@planflow/shared'
import { getDbClient, schema } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'

const feedbackRoutes = new Hono()

// Submit feedback (authenticated users only)
feedbackRoutes.post('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateFeedbackRequestSchema.safeParse(body)

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

    const { category, rating, message, pageUrl } = validation.data
    const db = getDbClient()

    const [feedback] = await db
      .insert(schema.feedback)
      .values({
        userId: user.id,
        category,
        rating,
        message,
        pageUrl,
      })
      .returning({
        id: schema.feedback.id,
        category: schema.feedback.category,
        rating: schema.feedback.rating,
        message: schema.feedback.message,
        createdAt: schema.feedback.createdAt,
      })

    return c.json(
      {
        success: true,
        data: { feedback },
      },
      201
    )
  } catch (error) {
    console.error('Submit feedback error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Get user's feedback history (authenticated users only)
feedbackRoutes.get('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const feedbackList = await db
      .select({
        id: schema.feedback.id,
        category: schema.feedback.category,
        rating: schema.feedback.rating,
        message: schema.feedback.message,
        createdAt: schema.feedback.createdAt,
      })
      .from(schema.feedback)
      .where(eq(schema.feedback.userId, user.id))
      .orderBy(desc(schema.feedback.createdAt))
      .limit(50)

    return c.json({
      success: true,
      data: { feedback: feedbackList },
    })
  } catch (error) {
    console.error('Get feedback error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { feedbackRoutes }
