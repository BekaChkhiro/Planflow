import { Hono } from 'hono'
import { auth } from '../middleware/auth.js'
import {
  startPipeline,
  pausePipeline,
  resumePipeline,
  stopPipeline,
  getPipeline,
} from '../services/pipeline.service.js'

export const pipelineRoutes = new Hono()

// Start a sequential task pipeline for a project.
pipelineRoutes.post('/:id/pipeline/start', auth, async (c) => {
  const projectId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const fireUrl: string = body.fireUrl
  const token: string = body.token
  if (!fireUrl || !token || !fireUrl.includes('/fire')) {
    return c.json({ success: false, error: 'fireUrl and token are required' }, 400)
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
