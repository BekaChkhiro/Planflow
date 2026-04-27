/**
 * PlanFlow MCP Server — Index Directory Tool
 *
 * Recursively indexes an entire directory into a PlanFlow project.
 * Handles batching and rate-limit delays automatically.
 *
 * Usage:
 *   planflow_index_directory(
 *     projectId: "uuid",
 *     directory: "/path/to/project",
 *     include: ["star/star/*.ts", "star/star/*.tsx", "star/star/*.md"],
 *     exclude: ["star/star/node_modules/star", "star/star/.next/star", "star/star/*.test.ts"]
 *   )
 */

import { z } from 'zod'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import { getCurrentProjectId } from './use.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_SIZE = 20
const DELAY_MS = 21000 // 21s — safe for Voyage AI free tier (3 RPM)
const MAX_FILE_SIZE = 1024 * 1024 // 1 MB per file

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const IndexDirectoryInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID to index into. Uses current project from planflow_use() if omitted.'),
  directory: z
    .string()
    .min(1, 'Directory path cannot be empty')
    .describe('Absolute or relative path to the directory to index.'),
  include: z
    .array(z.string())
    .default(['**/*'])
    .describe('Glob patterns for files to include (e.g. ["**/*.ts", "**/*.tsx"]).'),
  exclude: z
    .array(z.string())
    .default([
      '**/node_modules/**',
      '**/.git/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
    ])
    .describe('Glob patterns for files to exclude.'),
})

type IndexDirectoryInput = z.infer<typeof IndexDirectoryInputSchema>

// ---------------------------------------------------------------------------
// File matching helpers
// ---------------------------------------------------------------------------

function matchGlob(path: string, pattern: string): boolean {
  // Simple glob matching: ** matches any directories, * matches any chars except /
  const parts = pattern.split('/')
  const pathParts = path.split('/')

  let pi = 0
  let gi = 0

  while (gi < parts.length && pi < pathParts.length) {
    const g = parts[gi]
    const p = pathParts[pi]

    if (g === '**') {
      // ** matches zero or more directories
      if (gi === parts.length - 1) return true // ** at end matches everything
      gi++
      const nextG = parts[gi]
      // Find nextG in remaining path
      while (pi < pathParts.length) {
        if (matchSegment(pathParts[pi], nextG)) {
          break
        }
        pi++
      }
      if (pi >= pathParts.length) return false
      gi++
      pi++
    } else {
      if (!matchSegment(p, g)) return false
      gi++
      pi++
    }
  }

  // Handle trailing **
  while (gi < parts.length && parts[gi] === '**') gi++

  return gi === parts.length && pi === pathParts.length
}

function matchSegment(value: string, pattern: string): boolean {
  // Simple * matching within a segment
  const parts = pattern.split('*')
  if (parts.length === 1) return value === pattern

  let pos = 0
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '') continue
    const idx = value.indexOf(part, pos)
    if (idx === -1) return false
    pos = idx + part.length
  }
  return true
}

function shouldIncludeFile(relPath: string, include: string[], exclude: string[]): boolean {
  // Check exclude first
  for (const pattern of exclude) {
    if (matchGlob(relPath, pattern)) return false
  }
  // Check include
  for (const pattern of include) {
    if (matchGlob(relPath, pattern)) return true
  }
  return false
}

function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.json': 'json',
    '.prisma': 'prisma',
    '.sql': 'sql',
    '.css': 'css',
    '.html': 'html',
    '.yml': 'yaml',
    '.yaml': 'yaml',
  }
  return map[ext]
}

// ---------------------------------------------------------------------------
// File scanner
// ---------------------------------------------------------------------------

function scanDirectory(
  dir: string,
  baseDir: string,
  include: string[],
  exclude: string[],
  files: Array<{ path: string; content: string; language?: string }> = []
): Array<{ path: string; content: string; language?: string }> {
  const items = readdirSync(dir, { withFileTypes: true })

  for (const item of items) {
    const fullPath = join(dir, item.name)
    const relPath = relative(baseDir, fullPath)

    if (item.isDirectory()) {
      // Skip excluded directories early for performance
      if (['node_modules', '.git', '.next', 'dist', 'build', '.turbo', 'coverage',
           'test-results', 'playwright-report', '__tests__'].includes(item.name)) {
        continue
      }
      scanDirectory(fullPath, baseDir, include, exclude, files)
    } else {
      if (shouldIncludeFile(relPath, include, exclude)) {
        try {
          const stats = statSync(fullPath)
          if (stats.size > MAX_FILE_SIZE) {
            logger.warn('Skipping oversized file', { path: relPath, size: stats.size })
            continue
          }
          const content = readFileSync(fullPath, 'utf-8')
          files.push({
            path: relPath,
            content,
            language: detectLanguage(relPath),
          })
        } catch (err) {
          logger.warn('Failed to read file', { path: relPath, error: String(err) })
        }
      }
    }
  }

  return files
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const indexDirectoryTool: ToolDefinition<IndexDirectoryInput> = {
  name: 'planflow_index_directory',

  description: `Recursively index an entire directory into a PlanFlow project.

Automatically handles:
  • File discovery via glob patterns
  • Batching (20 files per API call)
  • Rate-limit delays between batches (21s)

Perfect for indexing a full codebase without manually listing every file.

Usage:
  planflow_index_directory(
    directory: "/Users/you/project",
    include: ["**/*.ts", "**/*.tsx", "**/*.md"],
    exclude: ["**/node_modules/**", "**/*.test.ts"]
  )

Parameters:
  - projectId (optional): Project UUID (uses current project if omitted)
  - directory (required): Path to directory to index
  - include (optional): Glob patterns for files to include (default: all files)
  - exclude (optional): Glob patterns for files to skip (default: common build/test dirs)

Prerequisites:
  • Must be logged in with planflow_login()
  • Set current project with planflow_use() or pass projectId`,

  inputSchema: IndexDirectoryInputSchema,

  async execute(input: IndexDirectoryInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_index_directory(projectId: "uuid", ...)\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first:\n' +
          '  planflow_login(token: "your-api-token")'
      )
    }

    // Resolve directory path
    const dirPath = input.directory.startsWith('~')
      ? input.directory.replace(/^~/, process.env.HOME || '')
      : input.directory

    logger.info('Scanning directory', { path: dirPath, projectId })

    try {
      // Scan files
      const files = scanDirectory(dirPath, dirPath, input.include, input.exclude)

      if (files.length === 0) {
        return createErrorResult(
          `❌ No files matched in ${dirPath}\n\n` +
            `Include: ${input.include.join(', ')}\n` +
            `Exclude: ${input.exclude.join(', ')}`
        )
      }

      logger.info(`Found ${files.length} files to index`, { count: files.length })

      const client = getApiClient()
      let totalFilesIndexed = 0
      let totalChunksIndexed = 0
      const batchCount = Math.ceil(files.length / BATCH_SIZE)

      // Process in batches
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1

        logger.info(`Indexing batch ${batchNum}/${batchCount}`, {
          batchSize: batch.length,
        })

        try {
          const result = await client.indexProject(projectId, batch)
          totalFilesIndexed += result.filesIndexed
          totalChunksIndexed += result.chunksIndexed

          logger.info(`Batch ${batchNum} complete`, {
            filesIndexed: result.filesIndexed,
            chunksIndexed: result.chunksIndexed,
          })
        } catch (err) {
          logger.error(`Batch ${batchNum} failed`, { error: String(err) })
          // Continue with next batch, don't fail everything
        }

        // Delay between batches (except for the last one)
        if (i + BATCH_SIZE < files.length) {
          logger.info(`Waiting ${DELAY_MS}ms before next batch...`)
          await sleep(DELAY_MS)
        }
      }

      return createSuccessResult(
        `✅ Indexing complete!\n\n` +
          `📁 Directory: ${dirPath}\n` +
          `📄 Files scanned: ${files.length}\n` +
          `📦 Files indexed: ${totalFilesIndexed}\n` +
          `🧩 Chunks indexed: ${totalChunksIndexed}\n\n` +
          `💡 Next steps:\n` +
          `  • planflow_search(query: "your question here")\n` +
          `  • planflow_context(query: "...", layers: ["vector"])`
      )
    } catch (error) {
      logger.error('Directory indexing failed', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult('❌ Authentication error. Please log in again.')
      }

      if (error instanceof ApiError) {
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Indexing failed: ${message}`)
    }
  },
}
