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
import { createHash } from 'node:crypto'
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
import { minimatch } from './_glob.js'
import { coerceBoolean } from './_coerce.js'
import * as progress from '../progress.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Files per batch when scanning a directory. Tuned for Voyage AI free tier. */
const BATCH_SIZE = 20
/**
 * Delay between batches.
 *
 * Default 21,000ms = safe for Voyage AI's free tier (3 RPM, leaves margin).
 * Override via `PLANFLOW_INDEX_DELAY_MS` env var when the user's Voyage
 * account is on a paid tier:
 *   • Tier 1 (paid, 2,000 RPM)        → 2000ms or even 1000ms
 *   • Tier 2 ($100+ spent, 4,000 RPM) → 500ms
 *   • Enterprise                       → 100ms
 *
 * Indexing 2,000 files drops from ~2 hours on free tier to ~10 minutes
 * on Tier 1. Always-conservative default keeps free-tier users from
 * accidentally getting rate-limited; opt-in for paid users.
 */
const DELAY_MS = (() => {
  const raw = process.env['PLANFLOW_INDEX_DELAY_MS']
  const parsed = raw ? parseInt(raw, 10) : NaN
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  return 21_000
})()
/** Per-file content cap; matches the backend limit. */
const MAX_FILE_SIZE = 1024 * 1024
/**
 * Soft cap on total batch payload bytes. Helps avoid 413 / "request entity
 * too large" responses when even legitimately-sized files happen to
 * cluster together in one batch. Empirically ~4MB lands well within
 * default Hono / Node body limits (we leave headroom for headers).
 */
const MAX_BATCH_BYTES = 4 * 1024 * 1024

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
    dryRun: coerceBoolean()
      .default(false)
      .describe(
        'When true, scan and report what WOULD be indexed (file count, languages, sizes) without sending anything to the backend. No Voyage tokens spent. Useful before a big directory ingest.'
      ),
    purge: coerceBoolean()
      .default(false)
      .describe(
        'When true, wipe every existing chunk for the project BEFORE indexing. Use this when an earlier index run included files you have since added to exclude (e.g. Prisma generated client) and you want a clean re-index. Requires owner/admin role on the project. Skipped when dryRun:true.'
      ),
    incremental: coerceBoolean()
      .default(true)
      .describe(
        'When true (default), skip files whose content hash already matches what is stored in the index — only changed/new files cost embedding tokens. Set false to force re-embedding everything (e.g. after changing chunking strategy). Ignored in dryRun.'
      ),
    removeMissing: coerceBoolean()
      .default(false)
      .describe(
        'When true (directory mode only), remove from the index any files that are present in the index but no longer exist in the scanned directory. Useful after deleting / renaming files. Default false to be safe — explicit opt-in.'
      ),
  })
  .refine((d) => !(d.directory && d.files), {
    message: 'Provide either `directory` or `files`, not both.',
  })

type IndexInput = z.infer<typeof IndexInputSchema>

// ---------------------------------------------------------------------------
// File include/exclude logic (minimatch helper from _glob.ts)
// ---------------------------------------------------------------------------

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

Two ingestion modes (one is auto-selected):

1. Directory scan — recursively walks a directory.
   When neither \`directory\` nor \`files\` is provided, this mode is used and
   the directory defaults to the MCP server's cwd — i.e. "index the repo
   I'm running in". You can also pass it explicitly:
   planflow_index()                                   # cwd default
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

Tip — clean re-index after tightening excludes:
  planflow_index(directory: ".", purge: true)
  Wipes every existing chunk before re-indexing. Use when the previous
  index included files you've since added to exclude (e.g. Prisma
  generated client) and you want to drop them from search results.
  Requires owner/admin role on the project.

Tip — speed up indexing on a paid Voyage account:
  Default batch delay is 21s (free tier, 3 RPM). On Tier 1+ paid
  accounts you can drop it dramatically by setting the env var
  PLANFLOW_INDEX_DELAY_MS before launching the MCP server. 2,000ms is
  a safe Tier 1 value (300+ RPM headroom); 500ms is fine on Tier 2.
  A 2,000-file repo goes from ~2 hours → ~10 minutes on Tier 1.

Incremental mode (DEFAULT — incremental:true):
  After the initial index, re-running planflow_index only re-embeds
  files whose content has actually changed. Each file's SHA-256 hash is
  stored alongside its chunks; the tool fetches that map up front and
  skips files whose local hash matches. After editing 3 files in a 280-
  file repo, you re-index 3 files, not 280 — saves Voyage tokens and
  several minutes of wall time.

  Set incremental:false to force re-embedding everything (e.g. when
  the chunker / embedder version changed).

  Pair with removeMissing:true to also drop files from the index that
  no longer exist on disk (e.g. after deleting / git rm):
    planflow_index(directory: ".", removeMissing: true)

Response includes a \`skippedFiles\` block when the backend couldn't store
some files (unsupported language, chunker failure, oversize, embed
failure) — so you don't have to detective-work which files didn't make it.

Prerequisites:
  • Logged in via planflow_login()
  • Project selected via planflow_use() OR pass projectId explicitly`,

  inputSchema: IndexInputSchema,

  async execute(
    input: IndexInput,
    ctx?: import('./types.js').ToolExecutionContext
  ): Promise<ReturnType<typeof createSuccessResult>> {
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

    // Run purge first if requested (and not a dry run). Doing it here
    // (rather than per-mode) keeps the behavior identical for both
    // ingestion modes and avoids accidentally double-purging.
    let purgeNotice = ''
    if (input.purge && !input.dryRun) {
      try {
        const client = getApiClient()
        const purgeResult = await client.purgeIndex(projectId)
        purgeNotice = `🧹 Purged ${purgeResult.purgedChunks} pre-existing chunk(s) before indexing.\n\n`
        logger.info('Index purged before re-index', { projectId, purgedChunks: purgeResult.purgedChunks })
      } catch (err) {
        logger.error('Purge failed', { error: String(err) })
        return mapIndexError(err, projectId)
      }
    }

    // Dispatch on mode. Files mode wins if both somehow set (refine prevents it).
    // If neither is set, default `directory` to the MCP server's cwd — the most
    // common workflow is "index this repo I'm in" so making it the no-arg
    // default is a real ergonomic win.
    if (input.files) {
      return executeFilesMode(projectId, input.files, input.dryRun, purgeNotice, ctx)
    }

    const directory = input.directory ?? process.cwd()
    return executeDirectoryMode(
      projectId,
      directory,
      input.include,
      input.exclude,
      input.dryRun,
      purgeNotice,
      input.incremental,
      input.removeMissing,
      ctx
    )
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
  dryRun: boolean,
  purgeNotice = '',
  incremental = true,
  removeMissing = false,
  ctx?: import('./types.js').ToolExecutionContext
) {
  // Resolve directory path (expand ~)
  const dirPath = rawDirectory.startsWith('~')
    ? rawDirectory.replace(/^~/, process.env['HOME'] || '')
    : rawDirectory

  logger.info('Scanning directory', { path: dirPath, projectId, dryRun, incremental, removeMissing })

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

    // Incremental mode: ask the backend which files are already indexed
    // with which content hash. Files whose local hash matches get skipped
    // entirely — saves the entire chunk → embed → store path. The server
    // also re-checks (defence in depth) so even if our local skip is
    // wrong we don't double-store.
    let unchangedLocally = 0
    let workingFiles: ScannedFile[] = files
    let removedMissingFiles: string[] = []

    if (incremental || removeMissing) {
      const client = getApiClient()
      let indexedHashes: Record<string, string> = {}
      try {
        const result = await client.getFileHashes(projectId)
        indexedHashes = result.hashes
      } catch (err) {
        // First-time index will 404 the file-hashes endpoint or return
        // empty — both fine. Treat as "nothing indexed yet".
        logger.warn('Could not fetch file hashes; proceeding without incremental skip', {
          error: String(err),
        })
      }

      if (incremental && Object.keys(indexedHashes).length > 0) {
        workingFiles = []
        for (const file of files) {
          const localHash = createHash('sha256').update(file.content).digest('hex')
          if (indexedHashes[file.path] && indexedHashes[file.path] === localHash) {
            unchangedLocally++
          } else {
            workingFiles.push(file)
          }
        }
        logger.info('Incremental filter applied', {
          totalScanned: files.length,
          unchanged: unchangedLocally,
          willIndex: workingFiles.length,
        })
      }

      if (removeMissing && Object.keys(indexedHashes).length > 0) {
        const localPaths = new Set(files.map((f) => f.path))
        const missing = Object.keys(indexedHashes).filter((p) => !localPaths.has(p))
        if (missing.length > 0) {
          try {
            const result = await client.removeFilesFromIndex(projectId, missing)
            removedMissingFiles = missing
            logger.info('Removed missing files from index', {
              requested: missing.length,
              removed: result.removedFiles,
            })
          } catch (err) {
            logger.warn('Failed to remove missing files', { error: String(err) })
          }
        }
      }
    }

    if (workingFiles.length === 0) {
      return createSuccessResult(
        purgeNotice +
          `✅ Index already up to date — nothing to re-embed.\n\n` +
          `📁 Directory: ${dirPath}\n` +
          `📄 Files scanned: ${files.length}\n` +
          `⏭️  Unchanged (hash match): ${unchangedLocally}\n` +
          (removedMissingFiles.length > 0
            ? `🗑️  Removed (no longer on disk): ${removedMissingFiles.length}\n`
            : '') +
          `\n💡 Force re-embed: planflow_index(directory: "${rawDirectory}", incremental: false)`
      )
    }

    logger.info(`Found ${workingFiles.length} files to index`, { count: workingFiles.length })

    // Group files into batches that respect both the count limit and the
    // payload-size limit. A single oversized file (e.g. an unfiltered
    // generated client) shouldn't drag down its 19 batch-mates.
    const batches = packBatches(workingFiles)

    // Start tracking progress. Total = files we'll actually re-embed, so
    // skip-count from incremental mode doesn't inflate the denominator.
    // ctx.sendProgress (if present) routes to MCP notifications/progress
    // so Claude can render a live status line during the call.
    progress.start(
      'planflow_index',
      `Indexing ${workingFiles.length} file(s) in ${batches.length} batch(es)`,
      workingFiles.length,
      ctx?.sendProgress
    )
    const indexStart = Date.now()

    const client = getApiClient()
    let totalFilesIndexed = 0
    let totalChunksIndexed = 0
    const batchCount = batches.length
    const failedFiles: Array<{ path: string; error: string }> = []
    const allSkipped: SkippedFileSummary[] = []

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]!
      const batchNum = batchIdx + 1

      logger.info(`Indexing batch ${batchNum}/${batchCount}`, { batchSize: batch.length })

      // ETA: extrapolate from average batch wall-time observed so far.
      // For batch 1 we don't have data, so omit; the CLI will just hide
      // the ETA line until we've got enough samples.
      const elapsedMs = Date.now() - indexStart
      const avgBatchMs = batchNum > 1 ? elapsedMs / (batchNum - 1) : null
      const remainingBatches = batchCount - batchNum + 1
      const etaSeconds =
        avgBatchMs !== null ? Math.round((avgBatchMs * remainingBatches) / 1000) : undefined

      progress.update({
        label: `Batch ${batchNum} of ${batchCount} — ${totalFilesIndexed}/${workingFiles.length} files indexed`,
        current: totalFilesIndexed,
        etaSeconds,
      })

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
        logger.error(`Batch ${batchNum} failed — retrying per-file`, { error: errMessage })

        // One bad file shouldn't ditch the whole batch. Retry each file on
        // its own so we surface exactly which paths failed and salvage
        // every chunk-able neighbor. Voyage rate limit is the main cost
        // here (one call per file), but failures are rare so this is
        // acceptable as a recovery path.
        for (let fIdx = 0; fIdx < batch.length; fIdx++) {
          const file = batch[fIdx]!
          try {
            const result = await client.indexProject(projectId, [file])
            totalFilesIndexed += result.filesIndexed
            totalChunksIndexed += result.chunksIndexed
            if (result.skippedFiles) allSkipped.push(...result.skippedFiles)
            logger.debug('Per-file retry succeeded', { path: file.path })
            progress.update({
              label: `Batch ${batchNum} (per-file retry) — ${totalFilesIndexed}/${workingFiles.length} files indexed`,
              current: totalFilesIndexed,
            })
          } catch (retryErr) {
            const detail = retryErr instanceof Error ? retryErr.message : String(retryErr)
            logger.error('Per-file retry failed', { path: file.path, error: detail })
            failedFiles.push({ path: file.path, error: detail })
          }
          // Pace the retries — same Voyage rate limit applies whether the
          // call carries 1 file or 20.
          if (fIdx < batch.length - 1) await sleep(DELAY_MS)
        }
      }

      // Update after the batch settles (batched insert + skip+failed counts).
      progress.update({
        label: `Batch ${batchNum} of ${batchCount} done — ${totalFilesIndexed}/${workingFiles.length} files indexed`,
        current: totalFilesIndexed,
      })

      if (batchIdx < batches.length - 1) {
        logger.info(`Waiting ${DELAY_MS}ms before next batch...`)
        await sleep(DELAY_MS)
      }
    }

    if (totalFilesIndexed === 0 && failedFiles.length > 0) {
      const firstError = failedFiles[0]?.error ?? 'unknown error'
      progress.fail(`All batches errored. First error: ${firstError}`)
      return createErrorResult(
        `❌ Indexing failed — every file errored.\n\n` +
          `📁 Directory: ${dirPath}\n` +
          `📄 Files scanned: ${files.length}\n` +
          `🚫 Files indexed: 0\n` +
          `❗ Files failed: ${failedFiles.length}\n\n` +
          `First error: ${firstError}\n\n` +
          `💡 Common causes:\n` +
          `  • Embedding service unavailable (try again later)\n` +
          `  • Rate limit exceeded\n` +
          `  • Invalid project ID`
      )
    }

    // Build a per-file failures block (paths, capped to 10 examples). The
    // user explicitly asked to know WHICH files failed — counts alone
    // aren't enough to diagnose.
    const failedBlock = formatFailedFilesBlock(failedFiles)
    const skippedBlock = formatSkippedFilesBlock(allSkipped)

    const incrementalBlock =
      unchangedLocally > 0 ? `⏭️  Unchanged (hash match): ${unchangedLocally}\n` : ''
    const removedBlock =
      removedMissingFiles.length > 0
        ? `🗑️  Removed (no longer on disk): ${removedMissingFiles.length}\n`
        : ''

    progress.complete(
      `Indexed ${totalFilesIndexed} file(s), ${totalChunksIndexed} chunk(s)` +
        (unchangedLocally > 0 ? `, ${unchangedLocally} unchanged` : '') +
        (failedFiles.length > 0 ? `, ${failedFiles.length} failed` : '')
    )

    return createSuccessResult(
      purgeNotice +
        `✅ Indexing complete!\n\n` +
        `📁 Directory: ${dirPath}\n` +
        `📄 Files scanned: ${files.length}\n` +
        `📦 Files indexed: ${totalFilesIndexed}\n` +
        `🧩 Chunks indexed: ${totalChunksIndexed}\n` +
        incrementalBlock +
        removedBlock +
        failedBlock +
        skippedBlock +
        `\n💡 Next steps:\n` +
        `  • planflow_index_status() — verify staleness / breakdown\n` +
        `  • planflow_search(query: "...") — semantic search\n` +
        `  • planflow_context(query: "...", layers: ["vector"])`
    )
  } catch (error) {
    logger.error('Directory indexing failed', { error: String(error) })
    progress.fail(error instanceof Error ? error.message : String(error))
    return mapIndexError(error, projectId)
  }
}

// ---------------------------------------------------------------------------
// Mode 2: explicit files
// ---------------------------------------------------------------------------

async function executeFilesMode(
  projectId: string,
  files: Array<z.infer<typeof FileInputSchema>>,
  dryRun: boolean,
  purgeNotice = '',
  ctx?: import('./types.js').ToolExecutionContext
) {
  logger.info('Indexing files (explicit mode)', { projectId, fileCount: files.length, dryRun })

  // Auto-detect language for each file when the caller didn't specify one.
  // Without this, markdown / docs files silently fail backend chunking
  // because the backend's FileScanner only recognises programming languages
  // and we'd otherwise pass `language: undefined`. Directory mode already
  // does this — keeping the two modes symmetric is the whole point of the
  // unified tool.
  const filesWithLanguage = files.map((f) => ({
    ...f,
    language: f.language ?? detectLanguage(f.path),
  }))

  if (dryRun) {
    return createSuccessResult(formatDryRunPreview(null, filesWithLanguage, [], []))
  }

  progress.start(
    'planflow_index',
    `Indexing ${filesWithLanguage.length} file(s) (explicit files mode)`,
    filesWithLanguage.length,
    ctx?.sendProgress
  )

  try {
    const client = getApiClient()
    const result = await client.indexProject(projectId, filesWithLanguage)
    const durationSec = (result.durationMs / 1000).toFixed(1)
    const skippedBlock = formatSkippedFilesBlock(result.skippedFiles ?? [])

    progress.complete(
      `Indexed ${result.filesIndexed} file(s), ${result.chunksIndexed} chunk(s) in ${durationSec}s`
    )

    return createSuccessResult(
      purgeNotice +
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
    progress.fail(error instanceof Error ? error.message : String(error))
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

// ---------------------------------------------------------------------------
// Batch packing
//
// Greedy first-fit: walk the file list and start a new batch whenever the
// current one would exceed either the count limit OR the byte limit by
// adding the next file. This avoids splitting an already-good batch but
// still ensures no batch ships with a single file > MAX_FILE_SIZE (those
// were filtered out by scanDirectory anyway) or > MAX_BATCH_BYTES total.
// ---------------------------------------------------------------------------

function packBatches(files: ScannedFile[]): ScannedFile[][] {
  const batches: ScannedFile[][] = []
  let current: ScannedFile[] = []
  let currentBytes = 0

  for (const file of files) {
    const size = Buffer.byteLength(file.content, 'utf-8')
    const wouldOverflow =
      current.length >= BATCH_SIZE || currentBytes + size > MAX_BATCH_BYTES

    if (wouldOverflow && current.length > 0) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += size
  }
  if (current.length > 0) batches.push(current)

  return batches
}

function formatFailedFilesBlock(failed: Array<{ path: string; error: string }>): string {
  if (failed.length === 0) return ''
  const lines: string[] = ['', `❗ ${failed.length} file(s) failed:`]
  for (const f of failed.slice(0, 10)) {
    lines.push(`  • ${f.path} — ${f.error.slice(0, 100)}`)
  }
  if (failed.length > 10) lines.push(`  ... and ${failed.length - 10} more`)
  return lines.join('\n') + '\n'
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
