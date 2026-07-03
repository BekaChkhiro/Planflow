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
 * Exposes every PlanFlow tool that is backed by the cloud API. Local /
 * filesystem-only tools (index, worktree, sync-push, plan authoring, login/use)
 * are intentionally omitted — they operate on a local codebase directory that a
 * hosted endpoint does not have; a cloud session uses its own file tools instead.
 */
export function buildMcpServer(apiBase: string, token: string): McpServer {
  const c = new PlanflowClient(apiBase, token)
  const server = new McpServer(
    { name: 'planflow', version: '0.2.0' },
    { instructions: 'PlanFlow project & task management. All operations are scoped to the authenticated user via the connector token.' }
  )

  const tool = <A extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: A,
    handler: (args: z.infer<z.ZodObject<A>>) => Promise<unknown>
  ) => {
    server.tool(name, description, schema, async (args: any) => {
      try {
        return ok(await handler(args))
      } catch (e) {
        return fail(e)
      }
    })
  }

  // Identity
  tool('planflow_whoami', 'Show the authenticated PlanFlow user.', {}, () => c.me())

  // Projects
  tool('planflow_projects', 'List all your projects across organizations.', {}, () => c.projects())
  tool('planflow_project', 'Get a single project.', { projectId: z.string() }, ({ projectId }) =>
    c.project(projectId)
  )
  tool('planflow_project_plan', 'Get a project\'s plan (PROJECT_PLAN.md markdown).', { projectId: z.string() }, ({ projectId }) =>
    c.projectPlan(projectId)
  )
  tool(
    'planflow_create',
    'Create a new project in an organization.',
    { organizationId: z.string(), name: z.string(), description: z.string().optional() },
    ({ organizationId, name, description }) => c.createProject(organizationId, name, description)
  )
  tool('planflow_organizations', 'List your organizations.', {}, () => c.organizations())

  // Tasks
  tool('planflow_task_list', 'List all tasks for a project.', { projectId: z.string() }, ({ projectId }) =>
    c.tasks(projectId)
  )
  tool(
    'planflow_task_start',
    'Mark a task as in progress.',
    { projectId: z.string(), taskId: z.string().describe('Human task ID, e.g. "T1.2"') },
    ({ projectId, taskId }) => c.updateTask(projectId, taskId, { status: 'IN_PROGRESS' })
  )
  tool(
    'planflow_task_done',
    'Mark a task done, with an optional summary comment.',
    { projectId: z.string(), taskId: z.string(), summary: z.string().optional() },
    async ({ projectId, taskId, summary }) => {
      const r = await c.updateTask(projectId, taskId, { status: 'DONE' })
      if (summary) {
        try {
          await c.addComment(projectId, taskId, summary)
        } catch {
          /* non-fatal */
        }
      }
      return r
    }
  )
  tool(
    'planflow_task_update',
    'Update a task status (TODO / IN_PROGRESS / DONE / BLOCKED).',
    { projectId: z.string(), taskId: z.string(), status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']) },
    ({ projectId, taskId, status }) => c.updateTask(projectId, taskId, { status })
  )
  tool(
    'planflow_task_edit',
    'Edit a task\'s fields (name, description, complexity, estimatedHours, dependencies).',
    {
      projectId: z.string(),
      taskId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      complexity: z.enum(['Low', 'Medium', 'High']).optional(),
      estimatedHours: z.number().optional(),
      dependencies: z.array(z.string()).optional(),
    },
    ({ projectId, taskId, ...patch }) => c.updateTask(projectId, taskId, patch)
  )
  tool(
    'planflow_working_on',
    'Signal that you are actively working on a task (presence + lock).',
    { projectId: z.string(), taskId: z.string() },
    ({ projectId, taskId }) => c.workingOn(projectId, taskId)
  )
  tool(
    'planflow_task_delete',
    'Delete one or more tasks by their human task IDs (e.g. ["T1.2","T1.3"]).',
    { projectId: z.string(), taskIds: z.array(z.string()) },
    ({ projectId, taskIds }) => c.deleteTasks(projectId, taskIds)
  )
  tool(
    'planflow_tasks_bulk_update',
    'Bulk-update multiple existing tasks. Each item needs a taskId plus the fields to change.',
    {
      projectId: z.string(),
      tasks: z.array(
        z.object({
          taskId: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional(),
          complexity: z.enum(['Low', 'Medium', 'High']).optional(),
          estimatedHours: z.number().optional(),
          dependencies: z.array(z.string()).optional(),
        })
      ),
    },
    ({ projectId, tasks }) => c.bulkUpdateTasks(projectId, tasks)
  )
  tool(
    'planflow_tasks_reorder',
    'Reorder tasks on the board. Provide each taskId with its new displayOrder.',
    {
      projectId: z.string(),
      tasks: z.array(z.object({ taskId: z.string(), displayOrder: z.number() })),
    },
    ({ projectId, tasks }) => c.reorderTasks(projectId, tasks)
  )
  tool(
    'planflow_plan_update',
    'Replace the project plan (PROJECT_PLAN.md markdown). Tasks are automatically re-parsed and synced from the new plan — use this to rebuild or restructure the whole plan from scratch.',
    { projectId: z.string(), plan: z.string().describe('Full PROJECT_PLAN.md markdown') },
    ({ projectId, plan }) => c.updatePlan(projectId, plan)
  )

  // Comments
  tool('planflow_comments', 'List comments on a task.', { projectId: z.string(), taskId: z.string() }, ({ projectId, taskId }) =>
    c.comments(projectId, taskId)
  )
  tool(
    'planflow_comment',
    'Add a comment to a task.',
    { projectId: z.string(), taskId: z.string(), content: z.string() },
    ({ projectId, taskId, content }) => c.addComment(projectId, taskId, content)
  )

  // Activity & changes
  tool(
    'planflow_activity',
    'View recent activity for a project (optionally a single task).',
    { projectId: z.string(), taskId: z.string().optional(), limit: z.number().optional() },
    ({ projectId, taskId, limit }) => c.activity(projectId, { taskId, limit })
  )
  tool(
    'planflow_changes',
    'View the recent code-changes stream for a project.',
    { projectId: z.string(), limit: z.number().optional() },
    ({ projectId, limit }) => c.changes(projectId, { limit })
  )

  // Notifications
  tool(
    'planflow_notifications',
    'List your notifications.',
    { projectId: z.string().optional(), unreadOnly: z.boolean().optional(), limit: z.number().optional() },
    (opts) => c.notifications(opts)
  )

  // Knowledge
  tool(
    'planflow_recall',
    'Recall saved project knowledge (optionally filtered by a search term).',
    { projectId: z.string(), search: z.string().optional(), type: z.string().optional(), limit: z.number().optional() },
    ({ projectId, ...opts }) => c.listKnowledge(projectId, opts)
  )
  tool(
    'planflow_remember',
    'Save a piece of project knowledge (decision, pattern, convention, etc.).',
    {
      projectId: z.string(),
      title: z.string(),
      content: z.string(),
      type: z.enum(['architecture', 'pattern', 'convention', 'decision', 'dependency', 'environment', 'other']).optional(),
      tags: z.array(z.string()).optional(),
    },
    ({ projectId, ...data }) => c.createKnowledge(projectId, data)
  )

  // Semantic search
  tool(
    'planflow_search',
    'Semantic + keyword search over a project\'s indexed codebase.',
    { projectId: z.string(), query: z.string(), limit: z.number().optional() },
    ({ projectId, query, limit }) => c.search(projectId, query, limit)
  )
  tool(
    'planflow_explore',
    'Explore a project: semantic search results plus related knowledge and recent activity.',
    { projectId: z.string(), query: z.string() },
    async ({ projectId, query }) => {
      const [code, knowledge, activity] = await Promise.all([
        c.search(projectId, query, 8).catch(() => null),
        c.listKnowledge(projectId, { search: query, limit: 5 }).catch(() => null),
        c.activity(projectId, { limit: 5 }).catch(() => null),
      ])
      return { code, knowledge, activity }
    }
  )
  tool('planflow_index_status', 'Show the cloud index status for a project.', { projectId: z.string() }, ({ projectId }) =>
    c.indexStatus(projectId)
  )

  return server
}
