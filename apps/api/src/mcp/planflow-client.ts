/**
 * Request-scoped PlanFlow API client for the hosted MCP endpoint. Every call is
 * authenticated with the token embedded in the MCP connector URL, so the hosted
 * server stays multi-tenant and stateless. Endpoints mirror the PlanFlow REST API.
 */
export class PlanflowClient {
  constructor(
    private readonly base: string,
    private readonly token: string
  ) {}

  private async req(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    const text = await res.text()
    let body: any
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = text
    }
    if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`)
    return body?.data ?? body
  }

  private qs(params: Record<string, unknown>): string {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') sp.append(k, String(v))
    }
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  // Identity
  me() {
    return this.req('/auth/me')
  }

  // Organizations & projects
  organizations() {
    return this.req('/organizations')
  }
  async projects() {
    const orgsRes: any = await this.organizations()
    const orgs: any[] = orgsRes?.organizations ?? orgsRes ?? []
    const all: any[] = []
    for (const org of orgs) {
      try {
        const res: any = await this.req(`/projects${this.qs({ organizationId: org.id })}`)
        const list = res?.projects ?? res ?? []
        for (const p of list) all.push({ ...p, organizationName: org.name })
      } catch {
        /* skip org on error */
      }
    }
    return all
  }
  project(id: string) {
    return this.req(`/projects/${id}`)
  }
  projectPlan(id: string) {
    return this.req(`/projects/${id}/plan`)
  }
  createProject(organizationId: string, name: string, description?: string) {
    return this.req('/projects', {
      method: 'POST',
      body: JSON.stringify({ organizationId, name, description }),
    })
  }

  // Tasks
  tasks(projectId: string) {
    return this.req(`/projects/${projectId}/tasks`)
  }
  updateTask(projectId: string, taskId: string, patch: Record<string, unknown>) {
    return this.req(`/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }
  deleteTasks(projectId: string, taskIds: string[]) {
    return this.req(`/projects/${projectId}/tasks/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    })
  }
  bulkUpdateTasks(projectId: string, tasks: unknown[]) {
    return this.req(`/projects/${projectId}/tasks`, {
      method: 'PUT',
      body: JSON.stringify({ tasks }),
    })
  }
  reorderTasks(projectId: string, tasks: Array<{ taskId: string; displayOrder: number }>) {
    return this.req(`/projects/${projectId}/tasks/reorder`, {
      method: 'POST',
      body: JSON.stringify({ tasks }),
    })
  }
  updatePlan(projectId: string, plan: string) {
    return this.req(`/projects/${projectId}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan }),
    })
  }
  workingOn(projectId: string, taskId: string) {
    return this.req(`/projects/${projectId}/tasks/${taskId}/work`, { method: 'POST', body: '{}' })
  }

  // Comments
  comments(projectId: string, taskId: string) {
    return this.req(`/projects/${projectId}/tasks/${taskId}/comments`)
  }
  addComment(projectId: string, taskId: string, content: string) {
    return this.req(`/projects/${projectId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }

  // Activity & changes
  activity(projectId: string, opts: { taskId?: string; limit?: number } = {}) {
    return this.req(`/projects/${projectId}/activity${this.qs(opts)}`)
  }
  changes(projectId: string, opts: { limit?: number } = {}) {
    return this.req(`/projects/${projectId}/changes${this.qs(opts)}`)
  }

  // Notifications
  notifications(opts: { projectId?: string; unreadOnly?: boolean; limit?: number } = {}) {
    return this.req(`/notifications${this.qs(opts)}`)
  }

  // Knowledge
  listKnowledge(projectId: string, opts: { search?: string; type?: string; limit?: number } = {}) {
    return this.req(`/projects/${projectId}/knowledge${this.qs(opts)}`)
  }
  createKnowledge(
    projectId: string,
    data: { title: string; content: string; type?: string; tags?: string[] }
  ) {
    return this.req(`/projects/${projectId}/knowledge`, { method: 'POST', body: JSON.stringify(data) })
  }

  // Semantic search (RAG) & index
  search(projectId: string, query: string, limit = 10) {
    return this.req(`/projects/${projectId}/search`, {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
  }
  indexStatus(projectId: string) {
    return this.req(`/projects/${projectId}/index-status`)
  }
}
