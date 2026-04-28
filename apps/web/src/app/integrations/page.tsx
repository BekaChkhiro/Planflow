import { Metadata } from 'next'
import Link from 'next/link'
import { Navbar, Footer } from '@/components/landing'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IntegrationCard } from './integration-card'
import { ArrowRight, ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Integrations - PlanFlow',
  description:
    'Use PlanFlow MCP with Claude Code, Cursor, Continue, Cline, Codex, Zed, Windsurf, and more. One install, every AI dev tool.',
}

// ---------------------------------------------------------------------------
// Tier 1 — Native MCP support
// Each entry produces a card with the install command + the JSON / TOML
// snippet a user pastes into that client's config. Snippets are kept short
// and copy-paste-ready.
// ---------------------------------------------------------------------------

const tier1: Array<{
  name: string
  badge?: string
  description: string
  configPath: string
  configLanguage: 'json' | 'toml'
  configSnippet: string
  docsUrl?: string
}> = [
  {
    name: 'Claude Code',
    badge: 'Recommended',
    description:
      'Official CLI from Anthropic. Run `claude` in any project directory.',
    configPath: '~/.claude.json',
    configLanguage: 'json',
    configSnippet: `{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}`,
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/mcp',
  },
  {
    name: 'Claude Desktop',
    description: 'Official Claude.ai desktop app for Mac and Windows.',
    configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
    configLanguage: 'json',
    configSnippet: `{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}`,
    docsUrl: 'https://modelcontextprotocol.io/quickstart/user',
  },
  {
    name: 'Cursor',
    description: 'AI-first code editor — Settings → MCP Servers.',
    configPath: '~/.cursor/mcp.json (or per-project .cursor/mcp.json)',
    configLanguage: 'json',
    configSnippet: `{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}`,
    docsUrl: 'https://docs.cursor.com/context/model-context-protocol',
  },
  {
    name: 'Continue.dev',
    description: 'Open-source AI assistant for VS Code and JetBrains.',
    configPath: '~/.continue/config.yaml',
    configLanguage: 'json',
    configSnippet: `experimental:
  modelContextProtocolServers:
    - transport:
        type: stdio
        command: planflow-mcp`,
    docsUrl: 'https://docs.continue.dev/customize/model-context-protocol',
  },
  {
    name: 'Cline',
    description: 'VS Code extension — autonomous AI dev agent.',
    configPath: 'Cline → MCP Servers → Edit MCP Settings',
    configLanguage: 'json',
    configSnippet: `{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "disabled": false
    }
  }
}`,
    docsUrl: 'https://docs.cline.bot/mcp/configuring-mcp-servers',
  },
  {
    name: 'Codex CLI',
    badge: 'v0.16+',
    description: 'OpenAI Codex CLI — added MCP support in 0.16.',
    configPath: '~/.codex/config.toml',
    configLanguage: 'toml',
    configSnippet: `[mcp_servers.planflow]
command = "planflow-mcp"`,
    docsUrl: 'https://github.com/openai/codex',
  },
  {
    name: 'Zed',
    description: 'High-performance editor with native MCP support.',
    configPath: '~/.config/zed/settings.json',
    configLanguage: 'json',
    configSnippet: `{
  "context_servers": {
    "planflow": {
      "command": {
        "path": "planflow-mcp",
        "args": []
      }
    }
  }
}`,
    docsUrl: 'https://zed.dev/docs/assistant/model-context-protocol',
  },
  {
    name: 'Windsurf',
    description: 'Codeium IDE — Settings → Cascade → MCP Servers.',
    configPath: '~/.codeium/windsurf/mcp_config.json',
    configLanguage: 'json',
    configSnippet: `{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}`,
    docsUrl: 'https://docs.windsurf.com/windsurf/cascade/mcp',
  },
]

// ---------------------------------------------------------------------------
// Tier 2 — Adapter-based integrations.
// ChatGPT and friends don't speak MCP yet, so we route through the public
// REST API. Section is intentionally short — the goal is to point users at
// the right path, not duplicate full setup docs.
// ---------------------------------------------------------------------------

const tier2 = [
  {
    name: 'ChatGPT',
    description:
      'Use a Custom GPT pointed at the PlanFlow REST API. OAuth handles auth automatically.',
    cta: 'Coming soon — public Custom GPT',
    secondaryCta: 'Build your own with the API',
    apiPath: '/docs/mcp-installation',
  },
  {
    name: 'Kimi Code',
    description:
      'Moonshot AI tooling — MCP support is rolling out. Use the same `planflow-mcp` install once enabled.',
    cta: 'Check Kimi Code release notes',
  },
  {
    name: 'Other LLMs / custom agents',
    description:
      'Anything that can call HTTP APIs can use PlanFlow. The MCP server is a wrapper around our public REST API at api.planflow.tools.',
    cta: 'See the API reference',
    apiPath: '/docs',
  },
]

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-16 lg:py-24">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Integrations
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
            One install. <span className="text-primary">Every AI dev tool.</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            PlanFlow ships as an MCP server, so any client that speaks the Model
            Context Protocol can use it — Claude Code, Cursor, Continue, Cline,
            Codex, Zed, Windsurf, and more. Install once, configure your client,
            done.
          </p>
        </section>

        {/* Quick install */}
        <section className="mx-auto max-w-3xl mb-16">
          <div className="rounded-lg border bg-muted/30 p-6">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              Install the MCP server (works for every Tier 1 client below)
            </h2>
            <pre className="rounded-md bg-zinc-950 text-zinc-50 px-4 py-3 text-sm font-mono overflow-x-auto">
              <code>npm install -g planflow-mcp</code>
            </pre>
            <p className="text-sm text-muted-foreground mt-3">
              Requires Node.js 20+. After installing, add the snippet for your
              client below.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
              <div>
                <span className="font-medium">2.</span> Add the config snippet
                for your client (below).
              </div>
              <div>
                <span className="font-medium">3.</span> Restart the client and{' '}
                <Link href="/register" className="text-primary hover:underline">
                  sign up
                </Link>{' '}
                for a token.
              </div>
            </div>
          </div>
        </section>

        {/* Tier 1 — MCP-native */}
        <section className="mb-20">
          <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                MCP-native clients
              </h2>
              <p className="text-muted-foreground">
                These clients support the Model Context Protocol natively.
                Install once, paste the snippet.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {tier1.length} clients supported
            </Badge>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {tier1.map((client) => (
              <IntegrationCard
                key={client.name}
                name={client.name}
                badge={client.badge}
                description={client.description}
                configPath={client.configPath}
                configLanguage={client.configLanguage}
                configSnippet={client.configSnippet}
                docsUrl={client.docsUrl}
              />
            ))}
          </div>
        </section>

        {/* Tier 2 — Adapter-based */}
        <section className="mb-20">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-2">
              Other integrations
            </h2>
            <p className="text-muted-foreground">
              Clients without MCP support — bridge via the PlanFlow REST API.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {tier2.map((client) => (
              <div
                key={client.name}
                className="rounded-lg border p-6 hover:border-primary/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">{client.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {client.description}
                </p>
                <p className="text-sm font-medium mb-1">{client.cta}</p>
                {client.secondaryCta && client.apiPath && (
                  <Link
                    href={client.apiPath}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
                  >
                    {client.secondaryCta}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-2xl text-center rounded-lg border bg-muted/30 p-8">
          <h2 className="text-2xl font-bold mb-3">
            Don&apos;t see your client?
          </h2>
          <p className="text-muted-foreground mb-6">
            If your tool speaks MCP, the snippet above will work — just point it
            at <code className="font-mono text-sm">planflow-mcp</code>. If it
            doesn&apos;t, the REST API at{' '}
            <code className="font-mono text-sm">api.planflow.tools</code> covers
            anything else.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button asChild>
              <Link href="/docs/mcp-installation">
                Read the install guide
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/BekaChkhiro/Planflow/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                Request a client
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
