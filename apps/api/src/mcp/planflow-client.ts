/**
 * Minimal request-scoped PlanFlow API client for the hosted MCP endpoint.
 * Every call is authenticated with the token embedded in the MCP connector URL,
 * so the hosted server stays multi-tenant and stateless.
 */
export class PlanflowClient {
  constructor(
    private readonly base: string,
    private readonly token: string
  ) {}

  private async req(path: string, init?: RequestInit): Promise<unknown> {
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
    if (!res.ok) {
      throw new Error(body?.error || body?.message || `HTTP ${res.status}`)
    }
    // Unwrap the standard { success, data } envelope when present.
    return body?.data ?? body
  }

  me() {
    return this.req('/auth/me')
  }

  tasks(projectId: string) {
    return this.req(`/projects/${projectId}/tasks`)
  }

  updateTask(projectId: string, taskId: string, patch: Record<string, unknown>) {
    return this.req(`/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  addComment(projectId: string, taskId: string, content: string) {
    return this.req(`/projects/${projectId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }
}
