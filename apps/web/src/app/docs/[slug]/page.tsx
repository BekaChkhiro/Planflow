import { promises as fs } from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

// Map URL slugs to file names (user-facing docs only)
const slugToFile: Record<string, string> = {
  'getting-started': 'GETTING_STARTED.md',
  'mcp-installation': 'MCP_INSTALLATION.md',
  'user-guide': 'USER_GUIDE.md',
  'plugin-commands': 'PLUGIN_COMMANDS.md',
  'mcp-tools': 'MCP_TOOLS.md',
  'examples': 'EXAMPLES.md',
}

const slugToTitle: Record<string, string> = {
  'getting-started': 'Getting Started',
  'mcp-installation': 'MCP Installation',
  'user-guide': 'User Guide',
  'plugin-commands': 'Plugin Commands',
  'mcp-tools': 'MCP Tools Reference',
  'examples': 'Examples',
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

// Generate slug from text
function generateSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Map markdown file links to Next.js routes (user-facing docs only)
function transformLinks(content: string): string {
  return content
    // User-facing docs
    .replace(/\(\.\/GETTING_STARTED\.md\)/g, '(/docs/getting-started)')
    .replace(/\(\.\/MCP_INSTALLATION\.md\)/g, '(/docs/mcp-installation)')
    .replace(/\(\.\/USER_GUIDE\.md\)/g, '(/docs/user-guide)')
    .replace(/\(\.\/PLUGIN_COMMANDS\.md\)/g, '(/docs/plugin-commands)')
    .replace(/\(\.\/MCP_TOOLS\.md\)/g, '(/docs/mcp-tools)')
    .replace(/\(\.\/EXAMPLES\.md\)/g, '(/docs/examples)')
    .replace(/\(\.\/index\.md\)/g, '(/docs)')
    // Remove links to developer docs (not available in user docs)
    .replace(/\[([^\]]+)\]\(\.\/API_REFERENCE\.md\)/g, '$1')
    .replace(/\[([^\]]+)\]\(\.\.\/packages\/[^)]+\)/g, '$1')
    // Handle anchor links to other user docs
    .replace(/\(\.\/([A-Z_]+)\.md#([^)]+)\)/g, (match, file, anchor) => {
      const fileToSlug: Record<string, string> = {
        'GETTING_STARTED': 'getting-started',
        'MCP_INSTALLATION': 'mcp-installation',
        'USER_GUIDE': 'user-guide',
        'PLUGIN_COMMANDS': 'plugin-commands',
        'MCP_TOOLS': 'mcp-tools',
        'EXAMPLES': 'examples',
      }
      if (fileToSlug[file]) {
        return `(/docs/${fileToSlug[file]}#${anchor})`
      }
      return match // Keep as-is if not found
    })
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params
  const fileName = slugToFile[slug]

  if (!fileName) {
    notFound()
  }

  const filePath = path.join(process.cwd(), 'src', 'content', 'docs', fileName)
  let content = ''

  try {
    content = await fs.readFile(filePath, 'utf-8')
    content = transformLinks(content)
  } catch {
    notFound()
  }

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('/') || href?.startsWith('#')) {
              return <Link href={href} className="text-primary hover:underline">{children}</Link>
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-4 py-2 text-left font-semibold text-foreground">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-4 py-2 text-foreground">{children}</td>
          ),
          pre: ({ children }) => (
            <pre className="bg-zinc-100 dark:bg-zinc-900 rounded-lg p-4 overflow-x-auto text-zinc-800 dark:text-zinc-200">{children}</pre>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
            }
            return <code className={`${className} text-zinc-800 dark:text-zinc-200`} {...props}>{children}</code>
          },
          h1: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h1 id={id} className="text-3xl font-bold mt-8 mb-4 first:mt-0 scroll-mt-4 text-foreground">{children}</h1>
          },
          h2: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h2 id={id} className="text-2xl font-semibold mt-8 mb-4 pb-2 border-b border-border scroll-mt-4 text-foreground">{children}</h2>
          },
          h3: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h3 id={id} className="text-xl font-semibold mt-6 mb-3 scroll-mt-4 text-foreground">{children}</h3>
          },
          h4: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return <h4 id={id} className="text-lg font-semibold mt-4 mb-2 scroll-mt-4 text-foreground">{children}</h4>
          },
          p: ({ children }) => (
            <p className="my-4 text-foreground leading-7">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-4 list-disc list-inside space-y-2 text-foreground">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 list-decimal list-inside space-y-2 text-foreground">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground">{children}</blockquote>
          ),
          hr: () => <hr className="my-8 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
