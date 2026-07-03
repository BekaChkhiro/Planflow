import { Hono } from 'hono'
import { auth } from '../middleware/auth.js'
import {
  startPipeline,
  pausePipeline,
  resumePipeline,
  stopPipeline,
  getPipeline,
} from '../services/pipeline.service.js'
import {
  saveRoutineConfig,
  getRoutineConfig,
  deleteRoutineConfig,
} from '../services/routine-config.service.js'

export const pipelineRoutes = new Hono()

// MARK: - Routine config (shared by desktop app & website)

pipelineRoutes.put('/:id/routine-config', auth, async (c) => {
  const projectId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const fireUrl: string = body.fireUrl
  const token: string = body.token
  if (!fireUrl || !token || !fireUrl.includes('/fire')) {
    return c.json({ success: false, error: 'fireUrl and token are required' }, 400)
  }
  await saveRoutineConfig(projectId, fireUrl, token)
  return c.json({ success: true, data: { fireUrl, hasToken: true } })
})

pipelineRoutes.get('/:id/routine-config', auth, async (c) => {
  const config = await getRoutineConfig(c.req.param('id'))
  return c.json({
    success: true,
    data: config ? { fireUrl: config.fireUrl, hasToken: true } : null,
  })
})

pipelineRoutes.delete('/:id/routine-config', auth, async (c) => {
  await deleteRoutineConfig(c.req.param('id'))
  return c.json({ success: true })
})

// MARK: - Pipeline control

pipelineRoutes.post('/:id/pipeline/start', auth, async (c) => {
  const projectId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  let fireUrl: string | undefined = body.fireUrl
  let token: string | undefined = body.token

  // Fall back to the stored routine config (used by the website, which has no
  // local secret store).
  if (!fireUrl || !token) {
    const stored = await getRoutineConfig(projectId)
    if (stored) {
      fireUrl = fireUrl || stored.fireUrl
      token = token || stored.token
    }
  }
  // Persist the config when passed inline, so future starts don't need it.
  if (body.fireUrl && body.token) {
    await saveRoutineConfig(projectId, body.fireUrl, body.token)
  }

  if (!fireUrl || !token || !fireUrl.includes('/fire')) {
    return c.json(
      { success: false, error: 'No routine configured. Save a routine /fire URL and token first.' },
      400
    )
  }
  const state = startPipeline(projectId, fireUrl, token)
  return c.json({ success: true, data: state })
})

pipelineRoutes.get('/:id/pipeline', auth, async (c) => {
  const state = getPipeline(c.req.param('id'))
  return c.json({ success: true, data: state })
})

pipelineRoutes.post('/:id/pipeline/pause', auth, async (c) => {
  const state = pausePipeline(c.req.param('id'))
  if (!state) return c.json({ success: false, error: 'No active pipeline' }, 404)
  return c.json({ success: true, data: state })
})

pipelineRoutes.post('/:id/pipeline/resume', auth, async (c) => {
  const state = resumePipeline(c.req.param('id'))
  if (!state) return c.json({ success: false, error: 'No active pipeline' }, 404)
  return c.json({ success: true, data: state })
})

pipelineRoutes.delete('/:id/pipeline', auth, async (c) => {
  stopPipeline(c.req.param('id'))
  return c.json({ success: true })
})
