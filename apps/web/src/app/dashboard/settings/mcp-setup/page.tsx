'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, Check, Terminal, Server, Zap, ExternalLink, CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className={className}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  )
}

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg bg-gray-900 p-4">
      <CopyButton
        text={code}
        className="absolute right-2 top-2 text-gray-400 hover:text-white hover:bg-gray-800"
      />
      <pre className="overflow-x-auto text-sm text-gray-100 pr-10">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function StepNumber({ number }: { number: number }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
      {number}
    </div>
  )
}

const mcpConfigMac = `{
  "mcpServers": {
    "planflow": {
      "command": "npx",
      "args": ["-y", "@planflow/mcp-server"],
      "env": {
        "PLANFLOW_API_TOKEN": "your-api-token-here"
      }
    }
  }
}`

const mcpConfigWindows = `{
  "mcpServers": {
    "planflow": {
      "command": "npx.cmd",
      "args": ["-y", "@planflow/mcp-server"],
      "env": {
        "PLANFLOW_API_TOKEN": "your-api-token-here"
      }
    }
  }
}`

export default function MCPSetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">MCP Setup</h2>
        <p className="text-sm text-gray-500">
          Connect Claude Code to PlanFlow for seamless project management
        </p>
      </div>

      <Separator />

      {/* What is MCP */}
      <div className="rounded-lg border bg-blue-50 border-blue-200 p-4">
        <div className="flex gap-3">
          <Zap className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">What is MCP?</p>
            <p className="mt-1">
              The Model Context Protocol (MCP) allows Claude Code to interact with external tools
              and services. The PlanFlow MCP server enables you to manage projects, sync plans,
              and update tasks directly from your terminal.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Start Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Quick Start
          </CardTitle>
          <CardDescription>
            Get up and running in 3 simple steps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <StepNumber number={1} />
              <div>
                <p className="font-medium text-gray-900">Create API Token</p>
                <p className="text-sm text-gray-500">Generate a token for authentication</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <StepNumber number={2} />
              <div>
                <p className="font-medium text-gray-900">Configure Claude</p>
                <p className="text-sm text-gray-500">Add MCP server to your config</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <StepNumber number={3} />
              <div>
                <p className="font-medium text-gray-900">Start Using</p>
                <p className="text-sm text-gray-500">Use PlanFlow tools in Claude</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Generate Token */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <StepNumber number={1} />
            <div>
              <CardTitle>Generate an API Token</CardTitle>
              <CardDescription>
                You need an API token to authenticate the MCP server with your PlanFlow account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Go to the API Tokens page and create a new token. Give it a descriptive name
            like &quot;Claude Code - MacBook&quot; so you can identify it later.
          </p>
          <div className="flex items-center gap-4">
            <Button asChild>
              <Link href="/dashboard/settings/tokens">
                Go to API Tokens
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> Copy your token immediately after creation.
              For security reasons, it won&apos;t be shown again.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Configure Claude Code */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <StepNumber number={2} />
            <div>
              <CardTitle>Configure Claude Code</CardTitle>
              <CardDescription>
                Add the PlanFlow MCP server to your Claude Code configuration
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Open your Claude Code settings file and add the PlanFlow MCP server configuration.
            Replace <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">your-api-token-here</code> with
            the token you created in Step 1.
          </p>

          <Tabs defaultValue="mac" className="w-full">
            <TabsList>
              <TabsTrigger value="mac">macOS / Linux</TabsTrigger>
              <TabsTrigger value="windows">Windows</TabsTrigger>
            </TabsList>
            <TabsContent value="mac" className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Config file location:
                </p>
                <CodeBlock code="~/.config/claude/claude_desktop_config.json" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Add this configuration:
                </p>
                <CodeBlock code={mcpConfigMac} language="json" />
              </div>
            </TabsContent>
            <TabsContent value="windows" className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Config file location:
                </p>
                <CodeBlock code="%APPDATA%\\Claude\\claude_desktop_config.json" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Add this configuration:
                </p>
                <CodeBlock code={mcpConfigWindows} language="json" />
              </div>
            </TabsContent>
          </Tabs>

          <div className="rounded-md bg-gray-50 border p-3">
            <p className="text-sm text-gray-600">
              <strong>Tip:</strong> If you already have other MCP servers configured,
              add the <code className="rounded bg-gray-200 px-1 py-0.5">&quot;planflow&quot;</code> entry
              inside your existing <code className="rounded bg-gray-200 px-1 py-0.5">&quot;mcpServers&quot;</code> object.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Verify Installation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <StepNumber number={3} />
            <div>
              <CardTitle>Verify Installation</CardTitle>
              <CardDescription>
                Test that the MCP server is working correctly
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Restart Claude Code to load the new configuration. Then try one of these commands
            to verify the connection:
          </p>

          <div className="space-y-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-medium text-gray-700">Check your account</p>
              </div>
              <CodeBlock code="Ask Claude: &quot;Use planflow_whoami to check my account&quot;" />
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-medium text-gray-700">List your projects</p>
              </div>
              <CodeBlock code="Ask Claude: &quot;Use planflow_projects to list my projects&quot;" />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Success!</p>
              <p className="mt-1">
                If you see your account information or project list, the MCP server is configured correctly.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Tools */}
      <Card>
        <CardHeader>
          <CardTitle>Available MCP Tools</CardTitle>
          <CardDescription>
            Commands you can use with Claude Code after setup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: 'planflow_whoami', desc: 'Check your account info' },
              { name: 'planflow_projects', desc: 'List all your projects' },
              { name: 'planflow_create', desc: 'Create a new project' },
              { name: 'planflow_sync', desc: 'Sync plans (push/pull)' },
              { name: 'planflow_task_list', desc: 'View project tasks' },
              { name: 'planflow_task_update', desc: 'Update task status' },
              { name: 'planflow_task_next', desc: 'Get next recommended task' },
              { name: 'planflow_notifications', desc: 'Check notifications' },
            ].map((tool) => (
              <div key={tool.name} className="flex items-center gap-3 rounded-lg border p-3">
                <code className="rounded bg-gray-100 px-2 py-1 text-xs font-mono text-gray-800">
                  {tool.name}
                </code>
                <span className="text-sm text-gray-600">{tool.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-900 text-sm">MCP server not loading?</p>
              <ul className="mt-1 list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Make sure Claude Code is fully restarted after config changes</li>
                <li>Check that the JSON syntax is valid (no trailing commas)</li>
                <li>Verify Node.js is installed and available in your PATH</li>
              </ul>
            </div>
            <Separator />
            <div>
              <p className="font-medium text-gray-900 text-sm">Authentication errors?</p>
              <ul className="mt-1 list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Double-check your API token is correctly copied</li>
                <li>Make sure the token hasn&apos;t expired</li>
                <li>Try creating a new token if issues persist</li>
              </ul>
            </div>
            <Separator />
            <div>
              <p className="font-medium text-gray-900 text-sm">Still having issues?</p>
              <p className="mt-1 text-sm text-gray-600">
                Check our{' '}
                <a
                  href="https://docs.planflow.tools/mcp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  documentation
                </a>
                {' '}or{' '}
                <a
                  href="https://github.com/planflow/mcp-server/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  open an issue
                </a>
                {' '}on GitHub.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
