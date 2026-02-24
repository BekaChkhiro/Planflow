import { promises as fs } from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

// Map URL slugs to file names
const slugToFile: Record<string, string> = {
  'getting-started': 'GETTING_STARTED.md',
  'mcp-installation': 'MCP_INSTALLATION.md',
  'user-guide': 'USER_GUIDE.md',
  'plugin-commands': 'PLUGIN_COMMANDS.md',
  'mcp-tools': 'MCP_TOOLS.md',
  'examples': 'EXAMPLES.md',
  'api-reference': 'API_REFERENCE.md',
  'api-integrations': 'API_INTEGRATIONS.md',
  'api-realtime': 'API_REALTIME.md',
  'api-notifications': 'API_NOTIFICATIONS.md',
  'architecture': 'ARCHITECTURE.md',
  'development': 'DEVELOPMENT.md',
  'contributing': 'CONTRIBUTING.md',
}

const slugToTitle: Record<string, string> = {
  'getting-started': 'Getting Started',
  'mcp-installation': 'MCP Installation',
  'user-guide': 'User Guide',
  'plugin-commands': 'Plugin Commands',
  'mcp-tools': 'MCP Tools Reference',
  'examples': 'Examples',
  'api-reference': 'API Reference',
  'api-integrations': 'Integrations API',
  'api-realtime': 'Real-time API',
  'api-notifications': 'Notifications API',
  'architecture': 'Architecture',
  'development': 'Development Setup',
  'contributing': 'Contributing',
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return Object.keys(slugToFile).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const title = slugToTitle[slug] || 'Documentation'
  return {
    title: `${title} - PlanFlow Docs`,
    description: `PlanFlow ${title} documentation`,
  }
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
    .replace(/\(\.\/index\.md\)/g, '(/docs)')
    // Handle anchor links within same doc
    .replace(/\(#([^)]+)\)/g, '(#$1)')
    // Handle anchor links to other docs
    .replace(/\(\.\/([A-Z_]+)\.md#([^)]+)\)/g, (_, file, anchor) => {
      const fileToSlug: Record<string, string> = {
        'GETTING_STARTED': 'getting-started',
        'MCP_INSTALLATION': 'mcp-installation',
        'USER_GUIDE': 'user-guide',
        'PLUGIN_COMMANDS': 'plugin-commands',
        'MCP_TOOLS': 'mcp-tools',
        'EXAMPLES': 'examples',
        'API_REFERENCE': 'api-reference',
        'API_INTEGRATIONS': 'api-integrations',
        'API_REALTIME': 'api-realtime',
        'API_NOTIFICATIONS': 'api-notifications',
        'ARCHITECTURE': 'architecture',
        'DEVELOPMENT': 'development',
        'CONTRIBUTING': 'contributing',
      }
      return `(/docs/${fileToSlug[file] || file.toLowerCase()}#${anchor})`
    })
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params
  const fileName = slugToFile[slug]

  if (!fileName) {
    notFound()
  }

  const filePath = path.join(process.cwd(), '..', '..', 'docs', fileName)
  let content = ''

  try {
    content = await fs.readFile(filePath, 'utf-8')
    content = transformLinks(content)
  } catch (error) {
    notFound()
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
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse">{children}</table>
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
              return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
            }
            return <code className={className} {...props}>{children}</code>
          },
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold mt-8 mb-4 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-2xl font-semibold mt-8 mb-4 pb-2 border-b">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xl font-semibold mt-6 mb-3">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-lg font-semibold mt-4 mb-2">{children}</h4>
          ),
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
