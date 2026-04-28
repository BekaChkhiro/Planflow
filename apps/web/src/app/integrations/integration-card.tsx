'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface IntegrationCardProps {
  name: string
  badge?: string
  description: string
  configPath: string
  configLanguage: 'json' | 'toml' | 'yaml'
  configSnippet: string
  docsUrl?: string
}

export function IntegrationCard({
  name,
  badge,
  description,
  configPath,
  configLanguage,
  configSnippet,
  docsUrl,
}: IntegrationCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configSnippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Older browsers / iframes — silent fail keeps the UI from breaking
      // if clipboard access is denied; the snippet stays selectable so the
      // user can copy manually.
    }
  }

  return (
    <article className="rounded-lg border bg-card transition-colors hover:border-primary/50">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg">{name}</h3>
            {badge && (
              <Badge variant="secondary" className="text-xs">
                {badge}
              </Badge>
            )}
          </div>
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
              aria-label={`${name} MCP docs`}
            >
              Docs
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        {/* Config path */}
        <div className="text-xs text-muted-foreground mb-2">
          <span className="font-medium text-foreground">Config file:</span>{' '}
          <code className="font-mono text-xs">{configPath}</code>
        </div>

        {/* Snippet */}
        <div className="relative">
          <pre className="rounded-md bg-zinc-950 text-zinc-50 px-4 py-3 text-xs font-mono overflow-x-auto pr-12">
            <code>{configSnippet}</code>
          </pre>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="absolute top-2 right-2 h-7 w-7 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
            aria-label={copied ? 'Copied' : 'Copy snippet'}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Language pill */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase font-medium tracking-wide">
            {configLanguage}
          </span>
          <Link
            href="/docs/mcp-installation"
            className="text-xs text-primary hover:underline"
          >
            Detailed setup →
          </Link>
        </div>
      </div>
    </article>
  )
}
