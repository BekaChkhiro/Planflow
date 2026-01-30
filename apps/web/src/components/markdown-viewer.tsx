'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownViewerProps {
  content: string
  className?: string
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
        // Headings
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:text-2xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4',
        'prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-3 prose-h2:mt-8',
        'prose-h3:text-lg prose-h3:mb-2 prose-h3:mt-6',
        'prose-h4:text-base prose-h4:mb-2 prose-h4:mt-4',
        // Paragraphs
        'prose-p:text-muted-foreground prose-p:leading-relaxed',
        // Links
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        // Lists
        'prose-ul:my-2 prose-ol:my-2',
        'prose-li:text-muted-foreground prose-li:my-0.5',
        // Code
        'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted prose-pre:border prose-pre:rounded-lg',
        // Blockquotes
        'prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r',
        'prose-blockquote:not-italic prose-blockquote:text-muted-foreground',
        // Horizontal rules
        'prose-hr:border-border prose-hr:my-6',
        // Strong/Bold
        'prose-strong:font-semibold prose-strong:text-foreground',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom table styling for better appearance
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b bg-muted/50">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left font-medium text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => {
            // Check if this cell contains task status indicators
            const content = String(children)
            let statusBadge = null

            if (content.includes('DONE')) {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  DONE
                </span>
              )
            } else if (content.includes('IN_PROGRESS')) {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  IN_PROGRESS
                </span>
              )
            } else if (content.includes('BLOCKED')) {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  BLOCKED
                </span>
              )
            } else if (content.includes('TODO')) {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                  TODO
                </span>
              )
            }

            // If we have a status badge, replace the text content with the badge
            if (statusBadge) {
              return (
                <td className="px-4 py-2 text-muted-foreground">
                  {statusBadge}
                </td>
              )
            }

            return (
              <td className="px-4 py-2 text-muted-foreground">{children}</td>
            )
          },
          tr: ({ children }) => (
            <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              {children}
            </tr>
          ),
          // Task list checkboxes
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  {...props}
                />
              )
            }
            return <input type={type} {...props} />
          },
          // Code blocks with better styling
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            // Check if it's an inline code or code block
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className={cn('font-mono', className)} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
