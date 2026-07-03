import type { Context } from 'hono'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { buildMcpServer } from './server.js'

/**
 * Public hosted MCP endpoint. The per-user PlanFlow API token is carried in the
 * URL (path `/mcp/:token` or `?token=`), so the connector needs no OAuth flow —
 * the token both authenticates and scopes every request.
 *
 * Runs statelessly: a fresh server + transport per request.
 */
export async function handleMcpRequest(c: Context): Promise<Response> {
  const url = new URL(c.req.url)
  const token = c.req.param('token') || url.searchParams.get('token') || ''

  if (!token) {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Missing PlanFlow token in MCP URL' }, id: null }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Call the API on the loopback interface, not the public origin: going back
  // out through the edge proxy triggers an http→https redirect, and fetch drops
  // the Authorization header across that redirect (→ "Authentication required").
  const apiBase = process.env.MCP_SELF_URL || `http://127.0.0.1:${process.env.PORT || 3001}`
  const server = buildMcpServer(apiBase, token)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    return await transport.handleRequest(c.req.raw)
  } finally {
    // Best-effort cleanup of the per-request server/transport.
    void server.close?.()
  }
}
