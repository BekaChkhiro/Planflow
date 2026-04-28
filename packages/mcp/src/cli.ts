/**
 * PlanFlow MCP — CLI subcommands.
 *
 * The same `planflow-mcp` binary dispatches to either the MCP server
 * (default, no args) or one of these short-lived CLI commands. Designed
 * for git hooks and shell scripts where spinning up the full MCP
 * stdio protocol would be overkill.
 *
 *   planflow-mcp index       — incremental index of cwd
 *   planflow-mcp status      — print index status
 *   planflow-mcp help        — usage
 *
 * Each command exits with code 0 on success, 1 on error. We deliberately
 * keep stderr quiet by default (no logger noise) so a pre-commit hook
 * stays out of the way.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { getApiClient } from './api-client.js'
import {
  isAuthenticated,
  lookupProjectByPath,
  getStoredCurrentProjectId,
} from './config.js'
import { logger } from './logger.js'

// ---------------------------------------------------------------------------
// Shared scanning logic — kept aligned with planflow_index defaults.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 20
const DELAY_MS = 21_000
const MAX_FILE_SIZE = 1024 * 1024
const MAX_BATCH_BYTES = 4 * 1024 * 1024

const DEFAULT_INCLUDE = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.md',
  '.mdx',
  '.json',
  '.prisma',
  '.sql',
  '.css',
  '.html',
  '.yml',
  '.yaml',
]

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.svelte-kit',
  '.nuxt',
  '.vercel',
  '.cache',
  'dist',
  'build',
  'out',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
  '__tests__',
  'generated',
  '.prisma',
])

const SKIP_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.generated\.[jt]sx?$/, /\.gen\.[jt]sx?$/]

const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'])

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

type ScannedFile = { path: string; content: string; language?: string }

function scanCwd(baseDir: string, files: ScannedFile[] = []): ScannedFile[] {
  const items = readdirSync(baseDir, { withFileTypes: true })

  function walk(dir: string) {
    const dirItems = readdirSync(dir, { withFileTypes: true })
    for (const item of dirItems) {
      const fullPath = join(dir, item.name)
      const relPath = relative(baseDir, fullPath)

      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name)) continue
        walk(fullPath)
        continue
      }

      // Skip lockfiles and generated patterns
      if (LOCKFILES.has(item.name)) continue
      if (SKIP_FILE_PATTERNS.some((re) => re.test(item.name))) continue

      const ext = extname(item.name).toLowerCase()
      if (!DEFAULT_INCLUDE.includes(ext)) continue

      try {
        const stats = statSync(fullPath)
        if (stats.size > MAX_FILE_SIZE) continue
        const content = readFileSync(fullPath, 'utf-8')
        files.push({ path: relPath, content, language: detectLanguage(relPath) })
      } catch {
        // Read failure — ignore in CLI mode.
      }
    }
  }

  // Use the items reference to avoid an unused-var warning while still
  // letting the recursive walker do the real work.
  void items
  walk(baseDir)
  return files
}

// ---------------------------------------------------------------------------
// Resolution helpers (mirror what the MCP `use` tool does in-session).
// ---------------------------------------------------------------------------

function resolveProjectId(): string | null {
  // 1. cwd-link mapping (set by `planflow_use` with link:true)
  const fromMap = lookupProjectByPath(process.cwd())
  if (fromMap) return fromMap

  // 2. global config fallback (last-used)
  return getStoredCurrentProjectId()
}

function packBatches(files: ScannedFile[]): ScannedFile[][] {
  const batches: ScannedFile[][] = []
  let current: ScannedFile[] = []
  let bytes = 0
  for (const f of files) {
    const size = Buffer.byteLength(f.content, 'utf-8')
    if ((current.length >= BATCH_SIZE || bytes + size > MAX_BATCH_BYTES) && current.length > 0) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(f)
    bytes += size
  }
  if (current.length > 0) batches.push(current)
  return batches
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Subcommand: index (incremental)
// ---------------------------------------------------------------------------

export async function runIndexCommand(): Promise<number> {
  if (!isAuthenticated()) {
    process.stderr.write(
      'planflow-mcp: not authenticated. Run `planflow_login` from Claude first to save your token.\n'
    )
    return 1
  }

  const projectId = resolveProjectId()
  if (!projectId) {
    process.stderr.write(
      `planflow-mcp: no project linked to ${process.cwd()}.\n` +
        '  Run `planflow_use(projectId: "...")` from Claude first to bind this directory.\n'
    )
    return 1
  }

  const cwd = process.cwd()
  process.stdout.write(`planflow-mcp: scanning ${cwd}...\n`)

  const files = scanCwd(cwd)
  if (files.length === 0) {
    process.stdout.write('  (no indexable files found)\n')
    return 0
  }

  const client = getApiClient()

  // Fetch existing hashes — empty {} for first-time index, no-op skip.
  let indexedHashes: Record<string, string> = {}
  try {
    const result = await client.getFileHashes(projectId)
    indexedHashes = result.hashes
  } catch (err) {
    process.stderr.write(`  (could not fetch index hashes: ${String(err)} — proceeding with full index)\n`)
  }

  let unchanged = 0
  const changed: ScannedFile[] = []
  for (const file of files) {
    const localHash = createHash('sha256').update(file.content).digest('hex')
    if (indexedHashes[file.path] && indexedHashes[file.path] === localHash) {
      unchanged++
    } else {
      changed.push(file)
    }
  }

  if (changed.length === 0) {
    process.stdout.write(`  index already up to date (${unchanged} unchanged)\n`)
    return 0
  }

  process.stdout.write(
    `  ${changed.length} changed, ${unchanged} unchanged — indexing changed files...\n`
  )

  const batches = packBatches(changed)
  let totalIndexed = 0
  let totalChunks = 0
  let failed = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!
    try {
      const result = await client.indexProject(projectId, batch)
      totalIndexed += result.filesIndexed
      totalChunks += result.chunksIndexed
    } catch (err) {
      process.stderr.write(`  batch ${i + 1}/${batches.length} failed: ${String(err)}\n`)
      failed += batch.length
    }
    if (i < batches.length - 1) {
      // Same Voyage rate-limit consideration as the in-session tool.
      await sleep(DELAY_MS)
    }
  }

  const summary =
    `planflow-mcp: indexed ${totalIndexed} file(s), ${totalChunks} chunk(s)` +
    (unchanged > 0 ? `, ${unchanged} unchanged` : '') +
    (failed > 0 ? `, ${failed} failed` : '') +
    '\n'
  process.stdout.write(summary)
  return failed > 0 ? 1 : 0
}

// ---------------------------------------------------------------------------
// Subcommand: status
// ---------------------------------------------------------------------------

export async function runStatusCommand(): Promise<number> {
  if (!isAuthenticated()) {
    process.stderr.write('planflow-mcp: not authenticated.\n')
    return 1
  }

  const projectId = resolveProjectId()
  if (!projectId) {
    process.stderr.write(`planflow-mcp: no project linked to ${process.cwd()}.\n`)
    return 1
  }

  const client = getApiClient()
  try {
    const status = await client.getIndexStatus(projectId)
    process.stdout.write(
      [
        `Project: ${projectId}`,
        `Indexed: ${status.indexed ? 'yes' : 'no'}`,
        `Chunks:  ${status.chunks.toLocaleString()}`,
        `Files:   ${status.indexedFiles.toLocaleString()}`,
        `Last indexed: ${status.lastIndexedAt ?? 'unknown'}`,
        '',
      ].join('\n')
    )
    return 0
  } catch (err) {
    process.stderr.write(`planflow-mcp: status check failed: ${String(err)}\n`)
    return 1
  }
}

// ---------------------------------------------------------------------------
// Subcommand: help
// ---------------------------------------------------------------------------

export function runHelpCommand(): number {
  process.stdout.write(
    [
      'planflow-mcp — PlanFlow MCP server and CLI',
      '',
      'Usage:',
      '  planflow-mcp                Start the MCP server (default, used by Claude / IDEs)',
      '  planflow-mcp index          Incremental index of the current directory',
      '  planflow-mcp status         Print index status for the linked project',
      '  planflow-mcp help           Show this message',
      '',
      'Auth and project linking are managed via the MCP tools',
      '(planflow_login, planflow_use). Run those once from Claude;',
      'the CLI subcommands then read the same config.',
      '',
    ].join('\n')
  )
  return 0
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Returns true if the args matched a CLI subcommand and the caller
 * should NOT start the MCP server. The dispatcher itself takes care of
 * calling process.exit() on completion.
 */
export async function dispatchCli(args: string[]): Promise<boolean> {
  const cmd = (args[0] ?? '').replace(/^--/, '')
  if (!cmd) return false // no args → MCP server mode

  // Silence the in-session info logger — CLI output should be tight.
  logger.setLevel('error')

  let exitCode = 0
  switch (cmd) {
    case 'index':
      exitCode = await runIndexCommand()
      break
    case 'status':
      exitCode = await runStatusCommand()
      break
    case 'help':
    case '-h':
    case 'h':
      exitCode = runHelpCommand()
      break
    default:
      process.stderr.write(`planflow-mcp: unknown command "${cmd}"\n`)
      runHelpCommand()
      exitCode = 1
  }

  process.exit(exitCode)
}
