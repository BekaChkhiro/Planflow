import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { PlanflowClient } from './planflow-client.js'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
})
const fail = (e: unknown): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
})

/**
 * Builds a stateless PlanFlow MCP server bound to a single user's API token.
 * Exposes the task-lifecycle tools a cloud routine needs to drive PlanFlow.
 */
export function buildMcpServer(apiBase: string, token: string): McpServer {
  const client = new PlanflowClient(apiBase, token)
  const server = new McpServer(
    { name: 'planflow', version: '0.1.0' },
    { instructions: 'PlanFlow task management. Use these tools to read and update tasks for a project. All operations are scoped to the authenticated user.' }
  )

  server.tool('planflow_whoami', 'Show the authenticated PlanFlow user.', {}, async () => {
    try {
      return ok(await client.me())
    } catch (e) {
      return fail(e)
    }
  })

  server.tool(
    'planflow_task_list',
    'List all tasks for a project.',
    { projectId: z.string().describe('PlanFlow project ID (UUID)') },
    async ({ projectId }) => {
      try {
        return ok(await client.tasks(projectId))
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.tool(
    'planflow_task_start',
    'Mark a task as in progress.',
    { projectId: z.string(), taskId: z.string().describe('Human task ID, e.g. "T1.2"') },
    async ({ projectId, taskId }) => {
      try {
        return ok(await client.updateTask(projectId, taskId, { status: 'IN_PROGRESS' }))
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.tool(
    'planflow_task_done',
    'Mark a task as done, with an optional summary comment.',
    { projectId: z.string(), taskId: z.string(), summary: z.string().optional() },
    async ({ projectId, taskId, summary }) => {
      try {
        const result = await client.updateTask(projectId, taskId, { status: 'DONE' })
        if (summary) {
          try {
            await client.addComment(projectId, taskId, summary)
          } catch {
            // Non-fatal: status change already succeeded.
          }
        }
        return ok(result)
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.tool(
    'planflow_task_update',
    'Update a task status (TODO / IN_PROGRESS / DONE / BLOCKED).',
    {
      projectId: z.string(),
      taskId: z.string(),
      status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']),
    },
    async ({ projectId, taskId, status }) => {
      try {
        return ok(await client.updateTask(projectId, taskId, { status }))
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.tool(
    'planflow_comment',
    'Add a comment to a task.',
    { projectId: z.string(), taskId: z.string(), content: z.string() },
    async ({ projectId, taskId, content }) => {
      try {
        return ok(await client.addComment(projectId, taskId, content))
      } catch (e) {
        return fail(e)
      }
    }
  )

  return server
}
