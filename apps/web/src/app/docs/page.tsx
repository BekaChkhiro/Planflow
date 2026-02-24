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

// Generate slug from text
function generateSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
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
            if (href?.startsWith('/') || href?.startsWith('#')) {
              return <Link href={href} className="text-primary hover:underline">{children}</Link>
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-4 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-4 py-2">{children}</td>
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
          h1: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h1 id={id} className="text-3xl font-bold mt-8 mb-4 first:mt-0 scroll-mt-4">{children}</h1>
          },
          h2: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h2 id={id} className="text-2xl font-semibold mt-8 mb-4 pb-2 border-b scroll-mt-4">{children}</h2>
          },
          h3: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h3 id={id} className="text-xl font-semibold mt-6 mb-3 scroll-mt-4">{children}</h3>
          },
          h4: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h4 id={id} className="text-lg font-semibold mt-4 mb-2 scroll-mt-4">{children}</h4>
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic my-4">{children}</blockquote>
          ),
          hr: () => <hr className="my-8 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
