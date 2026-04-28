/**
 * PlanFlow MCP Server — planflow_index (unified)
 *
 * One tool for two ingestion modes:
 *   1. Directory scan: recursively walk a directory, glob-filter, batch
 *      uploads (rate-limit safe), report results.
 *   2. Explicit files: caller supplies an in-memory file list (path/content).
 *
 * Backend (Voyage-code-3 → LanceDB) is the same for both. Markdown / docs
 * are detected automatically from extension by the backend, so there is no
 * separate "index_docs" tool.
 *
 * Replaces (and supersedes) the previous trio:
 *   • planflow_index           → "files" mode here
 *   • planflow_index_docs      → removed; backend auto-detects docs
 *   • planflow_index_directory → "directory" mode here
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

/** Files per batch when scanning a directory. Tuned for Voyage AI free tier. */
const BATCH_SIZE = 20
/** Delay between batches — safe for Voyage AI free tier (3 RPM). */
const DELAY_MS = 21_000
/** Per-file content cap; matches the backend limit. */
const MAX_FILE_SIZE = 1024 * 1024

const DEFAULT_INCLUDE = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.md',
  '**/*.mdx',
  '**/*.json',
  '**/*.prisma',
  '**/*.sql',
  '**/*.css',
  '**/*.html',
  '**/*.yml',
  '**/*.yaml',
]

const DEFAULT_EXCLUDE = [
  // Dependencies & VCS
  '**/node_modules/**',
  '**/.git/**',
  // Framework / build outputs
  '**/.next/**',
  '**/.svelte-kit/**',
  '**/.nuxt/**',
  '**/.vercel/**',
  '**/.cache/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.turbo/**',
  // Test artifacts
  '**/coverage/**',
  '**/test-results/**',
  '**/playwright-report/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/__tests__/**',
  // Auto-generated code (Prisma client, GraphQL codegen, etc.) —
  // these are huge type-only files that exhaust embedding budget
  // without adding signal.
  '**/generated/**',
  '**/.prisma/**',
  '**/*.generated.ts',
  '**/*.generated.tsx',
  '**/*.gen.ts',
  // Lockfiles (huge, deterministic, no semantic value for code search)
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
]

// ---------------------------------------------------------------------------
// Schema — coercible string-or-array helper
// ---------------------------------------------------------------------------

function coercibleStringArray(defaultValue: string[]) {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) return defaultValue
      if (typeof val === 'string') return [val]
      if (Array.isArray(val)) return val
      return defaultValue
    },
    z.array(z.string())
  )
}

// ---------------------------------------------------------------------------
// Input schema (polymorphic)
// ---------------------------------------------------------------------------

const FileInputSchema = z.object({
  path: z.string().min(1).describe('Relative file path (e.g., "src/index.ts")'),
  content: z.string().describe('File content as string'),
  language: z.string().optional().describe('Optional language override; auto-detected if omitted.'),
})

const IndexInputSchema = z
  .object({
    projectId: z
      .string()
      .uuid('Project ID must be a valid UUID')
      .optional()
      .describe('Project ID. Uses current project from planflow_use() if omitted.'),

    // ── Mode 1: directory scan ────────────────────────────────────────────
    directory: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Path to a directory to scan recursively. Provide either `directory` OR `files`, not both.'
      ),
    include: coercibleStringArray(DEFAULT_INCLUDE).describe(
      'Glob pattern(s) for files to include when scanning a directory. Single string or array.'
    ),
    exclude: coercibleStringArray(DEFAULT_EXCLUDE).describe(
      'Glob pattern(s) to skip when scanning a directory. Single string or array.'
    ),

    // ── Mode 2: explicit files ────────────────────────────────────────────
    files: z
      .array(FileInputSchema)
      .min(1)
      .max(500)
      .optional()
      .describe(
        'Array of files to index directly. Use when you already have content in memory. Max 500 files.'
      ),

    // ── Modifiers ────────────────────────────────────────────────────────
    dryRun: z
      .boolean()
      .default(false)
      .describe(
        'When true, scan and report what WOULD be indexed (file count, languages, sizes) without sending anything to the backend. No Voyage tokens spent. Useful before a big directory ingest.'
      ),
  })
  .refine((d) => Boolean(d.directory) !== Boolean(d.files), {
    message: 'Provide exactly one of `directory` or `files` (not both, not neither).',
  })

type IndexInput = z.infer<typeof IndexInputSchema>

// ---------------------------------------------------------------------------
// Glob matching (minimatch-style — handles **/*.ts, prefix/**, prefix/**/suffix)
// ---------------------------------------------------------------------------

function minimatch(path: string, pattern: string): boolean {
  if (pattern.startsWith('**/')) {
    const rest = pattern.slice(3)
    if (rest === '') return true
    const parts = path.split('/')
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/')
      if (minimatch(suffix, rest)) return true
    }
    return false
  }

  const globstarIdx = pattern.indexOf('/**/')
  if (globstarIdx !== -1) {
    const prefix = pattern.slice(0, globstarIdx)
    const suffix = pattern.slice(globstarIdx + 4)
    if (!path.startsWith(prefix)) return false
    const restPath = path.slice(prefix.length)
    const parts = restPath.split('/')
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/')
      if (minimatch(subPath, suffix)) return true
    }
    return false
  }

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return path === prefix || path.startsWith(prefix + '/')
  }

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${regexPattern}$`).test(path)
}

function shouldIncludeFile(
  relPath: string,
  include: string[],
  exclude: string[]
): boolean {
  for (const pattern of exclude) {
    if (minimatch(relPath, pattern)) return false
  }
  for (const pattern of include) {
    if (minimatch(relPath, pattern)) return true
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

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
  '__tests__',
  '.svelte-kit',
  '.vercel',
  '.cache',
  'out',
  '.nuxt',
])

type ScannedFile = { path: string; content: string; language?: string }

function scanDirectory(
  dir: string,
  baseDir: string,
  include: string[],
  exclude: string[],
  files: ScannedFile[] = []
): ScannedFile[] {
  const items = readdirSync(dir, { withFileTypes: true })

  for (const item of items) {
    const fullPath = join(dir, item.name)
    const relPath = relative(baseDir, fullPath)

    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue
      scanDirectory(fullPath, baseDir, include, exclude, files)
    } else {
      if (!shouldIncludeFile(relPath, include, exclude)) continue
      try {
        const stats = statSync(fullPath)
        if (stats.size > MAX_FILE_SIZE) {
          logger.warn('Skipping oversized file', { path: relPath, size: stats.size })
          continue
        }
        const content = readFileSync(fullPath, 'utf-8')
        files.push({ path: relPath, content, language: detectLanguage(relPath) })
      } catch (err) {
        logger.warn('Failed to read file', { path: relPath, error: String(err) })
      }
    }
  }

  return files
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const indexTool: ToolDefinition<IndexInput> = {
  name: 'planflow_index',

  description: `Index code and documentation into a PlanFlow project's vector database.

Two ingestion modes (provide exactly one):

1. Directory scan — recursively walks a directory:
   planflow_index(directory: "/path/to/project")
   planflow_index(directory: ".", include: "src/**/*.ts", exclude: "**/*.test.ts")

   • File discovery uses include/exclude globs (sensible defaults for code+docs).
   • Auto-batches (20 files at a time) with a 21s delay — safe for Voyage AI
     free tier. Large repos can take several minutes; the call blocks until
     done. Some MCP runtimes time out on long executions — for very large
     repos, prefer the explicit-files mode and feed in slices yourself.

2. Explicit files — you supply paths and content:
   planflow_index(files: [
     { path: "src/index.ts", content: "..." },
     { path: "README.md",    content: "..." },
   ])

   • Single round-trip. Max 500 files / 1 MB each.
   • language is auto-detected from the extension on the backend; pass
     \`language\` only to override.

Backend pipeline for both modes:
  Tree-sitter chunking → Voyage-code-3 embedding → LanceDB upsert.
  Markdown / text files use paragraph chunking, also auto-detected.

Use this when:
  • Bootstrapping a new project ("index this repo")
  • Refreshing after meaningful code changes (check planflow_index_status first)
  • Adding docs (READMEs, ADRs, architecture notes — pass them in files mode
    or include "**/*.md" in the directory mode globs)

Tip — dry-run before a big ingest:
  planflow_index(directory: ".", dryRun: true)
  Reports file count, language breakdown, size, and an estimated wall-time
  WITHOUT calling the backend. Recommended for large repos so you can
  adjust include/exclude before committing to a multi-minute call.

Response includes a \`skippedFiles\` block when the backend couldn't store
some files (unsupported language, chunker failure, oversize, embed
failure) — so you don't have to detective-work which files didn't make it.

Prerequisites:
  • Logged in via planflow_login()
  • Project selected via planflow_use() OR pass projectId explicitly`,

  inputSchema: IndexInputSchema,

  async execute(input: IndexInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_index(projectId: "uuid", ...)\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")'
      )
    }

    // Dispatch on mode. The Zod refine() ensures exactly one is set.
    if (input.directory) {
      return executeDirectoryMode(
        projectId,
        input.directory,
        input.include,
        input.exclude,
        input.dryRun
      )
    }

    if (input.files) {
      return executeFilesMode(projectId, input.files, input.dryRun)
    }

    // Should be unreachable thanks to .refine()
    return createErrorResult('❌ Invalid input: provide either `directory` or `files`.')
  },
}

// ---------------------------------------------------------------------------
// Mode 1: directory scan
// ---------------------------------------------------------------------------

async function executeDirectoryMode(
  projectId: string,
  rawDirectory: string,
  include: string[],
  exclude: string[],
  dryRun: boolean
) {
  // Resolve directory path (expand ~)
  const dirPath = rawDirectory.startsWith('~')
    ? rawDirectory.replace(/^~/, process.env['HOME'] || '')
    : rawDirectory

  logger.info('Scanning directory', { path: dirPath, projectId, dryRun })

  try {
    const files = scanDirectory(dirPath, dirPath, include, exclude)

    if (files.length === 0) {
      return createErrorResult(
        `❌ No files matched in ${dirPath}\n\n` +
          `Include: ${include.join(', ')}\n` +
          `Exclude: ${exclude.join(', ')}`
      )
    }

    if (dryRun) {
      return createSuccessResult(formatDryRunPreview(dirPath, files, include, exclude))
    }

    logger.info(`Found ${files.length} files to index`, { count: files.length })

    const client = getApiClient()
    let totalFilesIndexed = 0
    let totalChunksIndexed = 0
    const batchCount = Math.ceil(files.length / BATCH_SIZE)
    const failedBatches: Array<{ batchNum: number; error: string; fileCount: number }> = []
    const allSkipped: SkippedFileSummary[] = []

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1

      logger.info(`Indexing batch ${batchNum}/${batchCount}`, { batchSize: batch.length })

      try {
        const result = await client.indexProject(projectId, batch)
        totalFilesIndexed += result.filesIndexed
        totalChunksIndexed += result.chunksIndexed
        if (result.skippedFiles && result.skippedFiles.length > 0) {
          allSkipped.push(...result.skippedFiles)
        }
        logger.info(`Batch ${batchNum} complete`, {
          filesIndexed: result.filesIndexed,
          chunksIndexed: result.chunksIndexed,
          skipped: result.skippedFiles?.length ?? 0,
        })
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err)
        logger.error(`Batch ${batchNum} failed`, { error: errMessage })
        failedBatches.push({ batchNum, error: errMessage, fileCount: batch.length })
      }

      if (i + BATCH_SIZE < files.length) {
        logger.info(`Waiting ${DELAY_MS}ms before next batch...`)
        await sleep(DELAY_MS)
      }
    }

    if (totalFilesIndexed === 0 && failedBatches.length > 0) {
      const firstError = failedBatches[0]?.error ?? 'unknown error'
      return createErrorResult(
        `❌ Indexing failed — all ${failedBatches.length} batch(es) errored.\n\n` +
          `📁 Directory: ${dirPath}\n` +
          `📄 Files scanned: ${files.length}\n` +
          `🚫 Files indexed: 0\n\n` +
          `First error: ${firstError}\n\n` +
          `💡 Common causes:\n` +
          `  • Embedding service unavailable (try again later)\n` +
          `  • Rate limit exceeded\n` +
          `  • Invalid project ID`
      )
    }

    const warningBlock =
      failedBatches.length > 0
        ? `\n⚠️  ${failedBatches.length} of ${batchCount} batch(es) failed (${failedBatches.reduce(
            (sum, b) => sum + b.fileCount,
            0
          )} files skipped).\n   First error: ${failedBatches[0]?.error}\n`
        : ''

    const skippedBlock = formatSkippedFilesBlock(allSkipped)

    return createSuccessResult(
      `✅ Indexing complete!\n\n` +
        `📁 Directory: ${dirPath}\n` +
        `📄 Files scanned: ${files.length}\n` +
        `📦 Files indexed: ${totalFilesIndexed}\n` +
        `🧩 Chunks indexed: ${totalChunksIndexed}\n` +
        warningBlock +
        skippedBlock +
        `\n💡 Next steps:\n` +
        `  • planflow_index_status() — verify staleness / breakdown\n` +
        `  • planflow_search(query: "...") — semantic search\n` +
        `  • planflow_context(query: "...", layers: ["vector"])`
    )
  } catch (error) {
    logger.error('Directory indexing failed', { error: String(error) })
    return mapIndexError(error, projectId)
  }
}

// ---------------------------------------------------------------------------
// Mode 2: explicit files
// ---------------------------------------------------------------------------

async function executeFilesMode(
  projectId: string,
  files: Array<z.infer<typeof FileInputSchema>>,
  dryRun: boolean
) {
  logger.info('Indexing files (explicit mode)', { projectId, fileCount: files.length, dryRun })

  if (dryRun) {
    return createSuccessResult(formatDryRunPreview(null, files, [], []))
  }

  try {
    const client = getApiClient()
    const result = await client.indexProject(projectId, files)
    const durationSec = (result.durationMs / 1000).toFixed(1)
    const skippedBlock = formatSkippedFilesBlock(result.skippedFiles ?? [])

    return createSuccessResult(
      `✅ Indexing complete\n\n` +
        `📁 Files indexed: ${result.filesIndexed}\n` +
        `🧩 Chunks created: ${result.chunksIndexed}\n` +
        `⏱️  Duration: ${durationSec}s\n` +
        skippedBlock +
        `\n💡 Next steps:\n` +
        `  • planflow_index_status() — verify breakdown\n` +
        `  • planflow_search(query: "...")\n` +
        `  • planflow_context(query: "...")`
    )
  } catch (error) {
    logger.error('Indexing failed', { error: String(error) })
    return mapIndexError(error, projectId)
  }
}

// ---------------------------------------------------------------------------
// Skipped-files formatter
//
// Backend returns one entry per skipped file with a short reason code; we
// roll them up by reason and surface a concise block so an LLM caller knows
// exactly what didn't make it in (instead of having to infer from the
// indexed/scanned diff). Examples are capped to keep the response small.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dry-run preview
//
// Shows the user / LLM exactly what would be sent to the backend if dryRun
// were dropped — file count, language breakdown, total size, and an
// estimate of how long the directory mode will block (driven by the
// rate-limit delay between batches). Lets the caller bail out early
// instead of committing to a multi-minute call they don't want.
// ---------------------------------------------------------------------------

function formatDryRunPreview(
  dirPath: string | null,
  files: ScannedFile[],
  include: string[],
  exclude: string[]
): string {
  // Aggregate by language and total size
  const byLanguage = new Map<string, { count: number; bytes: number }>()
  let totalBytes = 0
  for (const f of files) {
    const lang = f.language ?? 'unknown'
    const bytes = Buffer.byteLength(f.content, 'utf-8')
    const cur = byLanguage.get(lang) ?? { count: 0, bytes: 0 }
    cur.count += 1
    cur.bytes += bytes
    byLanguage.set(lang, cur)
    totalBytes += bytes
  }

  // For directory mode, estimate blocking time based on batch delay schedule.
  // Files mode is a single round-trip so we just say "~one round-trip".
  const isDirectoryMode = dirPath !== null
  const batchCount = Math.ceil(files.length / BATCH_SIZE)
  const interBatchDelaySec = isDirectoryMode ? ((batchCount - 1) * DELAY_MS) / 1000 : 0
  // Assume ~10s per batch for embedding + storage as a baseline.
  const apiTimeSec = isDirectoryMode ? batchCount * 10 : 10
  const estimatedSec = interBatchDelaySec + apiTimeSec

  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2)
  const formatTime = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}s`
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${m}m ${s}s`
  }

  const lines: string[] = [
    `🔍 Dry run — nothing was sent to the backend.`,
    ``,
  ]

  if (isDirectoryMode) {
    lines.push(`📁 Directory: ${dirPath}`)
  } else {
    lines.push(`📁 Mode: explicit files`)
  }
  lines.push(`📄 Files: ${files.length}`)
  lines.push(`📦 Total size: ${formatMB(totalBytes)} MB`)
  if (isDirectoryMode) {
    lines.push(`🔢 Batches: ${batchCount} (${BATCH_SIZE} files each)`)
    lines.push(`⏱️  Estimated wall time: ~${formatTime(estimatedSec)} (blocking)`)
  }
  lines.push(``)

  if (byLanguage.size > 0) {
    lines.push(`Languages:`)
    const sorted = [...byLanguage.entries()].sort((a, b) => b[1].count - a[1].count)
    for (const [lang, stats] of sorted) {
      lines.push(`  ${lang.padEnd(14)} ${String(stats.count).padStart(4)} files (${formatMB(stats.bytes)} MB)`)
    }
    lines.push(``)
  }

  if (isDirectoryMode && (include.length > 0 || exclude.length > 0)) {
    lines.push(`Filters in effect:`)
    if (include.length > 0) lines.push(`  include: ${include.slice(0, 5).join(', ')}${include.length > 5 ? '...' : ''}`)
    if (exclude.length > 0) lines.push(`  exclude: ${exclude.slice(0, 5).join(', ')}${exclude.length > 5 ? '...' : ''}`)
    lines.push(``)
  }

  lines.push(`💡 To actually index, drop dryRun:`)
  if (isDirectoryMode) {
    lines.push(`  planflow_index(directory: "${dirPath}")`)
  } else {
    lines.push(`  planflow_index(files: [...])`)
  }

  return lines.join('\n')
}

type SkippedFileSummary = {
  path: string
  reason: 'unsupported_language' | 'chunker_failed' | 'no_chunks' | 'embed_failed'
  detail?: string
}

const REASON_LABELS: Record<SkippedFileSummary['reason'], string> = {
  unsupported_language: 'unsupported language',
  chunker_failed: 'chunker / parser failed',
  no_chunks: 'no extractable chunks',
  embed_failed: 'embedding API failed',
}

function formatSkippedFilesBlock(skipped: SkippedFileSummary[]): string {
  if (skipped.length === 0) return ''

  // Group by reason
  const byReason = new Map<SkippedFileSummary['reason'], SkippedFileSummary[]>()
  for (const s of skipped) {
    const arr = byReason.get(s.reason) ?? []
    arr.push(s)
    byReason.set(s.reason, arr)
  }

  const lines: string[] = ['', `⚠️  ${skipped.length} file(s) skipped:`]
  for (const [reason, items] of byReason) {
    lines.push(`   ${REASON_LABELS[reason]} (${items.length}):`)
    // Show up to 5 example paths per reason to keep the response small.
    const examples = items.slice(0, 5)
    for (const item of examples) {
      lines.push(`     • ${item.path}${item.detail ? ` — ${item.detail.slice(0, 80)}` : ''}`)
    }
    if (items.length > 5) {
      lines.push(`     ... and ${items.length - 5} more`)
    }
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Shared error mapping
// ---------------------------------------------------------------------------

function mapIndexError(error: unknown, projectId: string) {
  if (error instanceof AuthError) {
    return createErrorResult(
      '❌ Authentication error. Please log out and log in again.\n' +
        '  planflow_logout()\n' +
        '  planflow_login(token: "your-new-token")'
    )
  }

  if (error instanceof ApiError) {
    if (error.statusCode === 404) {
      return createErrorResult(
        `❌ Project not found: ${projectId}\n\n` +
          'Use planflow_projects() to list your available projects.'
      )
    }
    if (error.statusCode === 503) {
      return createErrorResult(
        '❌ Embedding service is not configured.\n\n' +
          'The RAG backend is temporarily unavailable. Please try again later.'
      )
    }
    if (error.statusCode === 400) {
      return createErrorResult(`❌ Invalid request: ${error.message}`)
    }
    return createErrorResult(`❌ API error: ${error.message}`)
  }

  const message = error instanceof Error ? error.message : String(error)
  return createErrorResult(`❌ Indexing failed: ${message}`)
}
