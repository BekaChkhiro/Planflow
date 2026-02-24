import { promises as fs } from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Documentation - PlanFlow',
  description: 'PlanFlow documentation - guides, API reference, and developer resources',
}

// Map markdown file links to Next.js routes
function transformLinks(content: string): string {
  return content
    .replace(/\(\.\/GETTING_STARTED\.md\)/g, '(/docs/getting-started)')
    .replace(/\(\.\/MCP_INSTALLATION\.md\)/g, '(/docs/mcp-installation)')
    .replace(/\(\.\/USER_GUIDE\.md\)/g, '(/docs/user-guide)')
    .replace(/\(\.\/PLUGIN_COMMANDS\.md\)/g, '(/docs/plugin-commands)')
    .replace(/\(\.\/MCP_TOOLS\.md\)/g, '(/docs/mcp-tools)')
    .replace(/\(\.\/EXAMPLES\.md\)/g, '(/docs/examples)')
    .replace(/\(\.\/API_REFERENCE\.md\)/g, '(/docs/api-reference)')
    .replace(/\(\.\/API_INTEGRATIONS\.md\)/g, '(/docs/api-integrations)')
    .replace(/\(\.\/API_REALTIME\.md\)/g, '(/docs/api-realtime)')
    .replace(/\(\.\/API_NOTIFICATIONS\.md\)/g, '(/docs/api-notifications)')
    .replace(/\(\.\/ARCHITECTURE\.md\)/g, '(/docs/architecture)')
    .replace(/\(\.\/DEVELOPMENT\.md\)/g, '(/docs/development)')
    .replace(/\(\.\/CONTRIBUTING\.md\)/g, '(/docs/contributing)')
    // Handle anchor links
    .replace(/\(\.\/([A-Z_]+)\.md#([^)]+)\)/g, '(/docs/$1#$2)')
}

export default async function DocsPage() {
  const filePath = path.join(process.cwd(), '..', '..', 'docs', 'index.md')
  let content = ''

  try {
    content = await fs.readFile(filePath, 'utf-8')
    content = transformLinks(content)
  } catch (error) {
    content = '# Documentation\n\nDocumentation files not found. Please check the installation.'
  }

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('/')) {
              return <Link href={href} className="text-primary hover:underline">{children}</Link>
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full">{children}</table>
            </div>
          ),
          pre: ({ children }) => (
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto">{children}</pre>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return <code className="bg-muted px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>
            }
            return <code className={className} {...props}>{children}</code>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
