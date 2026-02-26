import Link from 'next/link'
import { Metadata } from 'next'
import { Rocket, Terminal, BookOpen, Command, Wrench, Code2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Documentation - PlanFlow',
  description: 'Learn how to use PlanFlow - AI-native project management for Claude Code',
}

const guides = [
  {
    title: 'Getting Started',
    description: 'Set up your account, install MCP server, and connect Claude Code',
    href: '/docs/getting-started',
    icon: Rocket,
  },
  {
    title: 'MCP Installation',
    description: 'Detailed MCP server installation and configuration guide',
    href: '/docs/mcp-installation',
    icon: Terminal,
  },
  {
    title: 'User Guide',
    description: 'Complete guide to the web dashboard - projects, teams, tasks',
    href: '/docs/user-guide',
    icon: BookOpen,
  },
  {
    title: 'Plugin Commands',
    description: 'Reference for all CLI commands - /planNew, /planUpdate, /pfSync',
    href: '/docs/plugin-commands',
    icon: Command,
  },
  {
    title: 'MCP Tools',
    description: 'Reference for MCP server tools - planflow_login, planflow_sync',
    href: '/docs/mcp-tools',
    icon: Wrench,
  },
  {
    title: 'Examples',
    description: 'Code snippets and usage examples for common workflows',
    href: '/docs/examples',
    icon: Code2,
  },
]

export default function DocsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">PlanFlow Documentation</h1>
        <p className="text-muted-foreground text-lg">
          Learn how to use PlanFlow for AI-native project management with Claude Code.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => {
          const Icon = guide.icon
          return (
            <Link
              key={guide.href}
              href={guide.href}
              className="group block rounded-lg border p-4 hover:border-primary hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">
                    {guide.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {guide.description}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="mt-12 rounded-lg border bg-muted/30 p-6">
        <h2 className="font-semibold mb-2">Quick Start</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Create a PlanFlow account at <Link href="/register" className="text-primary hover:underline">planflow.tools/register</Link></li>
          <li>Install the MCP server with <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-xs font-mono">npm install -g planflow-mcp</code></li>
          <li>Run <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-xs font-mono">/pfLogin</code> in Claude Code to connect</li>
          <li>Create your first plan with <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-xs font-mono">/planNew</code></li>
        </ol>
      </div>
    </div>
  )
}
