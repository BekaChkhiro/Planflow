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

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, extname, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { getApiClient } from './api-client.js'
import {
  isAuthenticated,
  lookupProjectByPath,
  getStoredCurrentProjectId,
} from './config.js'
import { logger } from './logger.js'
import { CLAUDE_MD_SECTION, CLAUDE_MD_VERSION, spliceSection } from './cli-init-template.js'

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
// Subcommand: init
//
// Drops a CLAUDE.md template (or merges into an existing one) so Claude
// Code reads the planflow workflow on every session. Idempotent —
// re-running upgrades the section in place rather than duplicating.
//
// Two scopes:
//   default            → cwd / CLAUDE.md (project-local)
//   --global / --user  → ~/.claude/CLAUDE.md (every Claude Code session)
//
// Note: as of v0.2.8 the MCP server itself returns these instructions
// in the initialize handshake, so the CLAUDE.md write is mostly a
// belt-and-suspenders safety net for clients that don't surface
// server-level instructions yet, and for Claude Code sessions that
// happen outside an MCP-aware context.
// ---------------------------------------------------------------------------

function getClaudeMdPath(scope: 'local' | 'global'): string {
  if (scope === 'global') {
    return join(homedir(), '.claude', 'CLAUDE.md')
  }
  return join(process.cwd(), 'CLAUDE.md')
}

export function runInitCommand(args: string[]): number {
  const scope: 'local' | 'global' = args.includes('--global') || args.includes('--user') ? 'global' : 'local'
  const claudeMdPath = getClaudeMdPath(scope)

  let existing = ''
  if (existsSync(claudeMdPath)) {
    try {
      existing = readFileSync(claudeMdPath, 'utf-8')
    } catch (err) {
      process.stderr.write(`planflow-mcp: failed to read existing CLAUDE.md: ${String(err)}\n`)
      return 1
    }
  } else {
    // For global mode the parent directory may not exist yet.
    try {
      mkdirSync(dirname(claudeMdPath), { recursive: true })
    } catch (err) {
      process.stderr.write(
        `planflow-mcp: failed to create ${dirname(claudeMdPath)}: ${String(err)}\n`
      )
      return 1
    }
  }

  const next = existing ? spliceSection(existing) : CLAUDE_MD_SECTION + '\n'

  if (next === existing) {
    process.stdout.write(
      `planflow-mcp: ${scope === 'global' ? 'global' : 'project'} CLAUDE.md already up to date (planflow section v${CLAUDE_MD_VERSION}).\n`
    )
    return 0
  }

  try {
    writeFileSync(claudeMdPath, next, 'utf-8')
  } catch (err) {
    process.stderr.write(`planflow-mcp: failed to write CLAUDE.md: ${String(err)}\n`)
    return 1
  }

  const action = existing ? 'updated' : 'created'
  const scopeLabel =
    scope === 'global'
      ? 'every future Claude Code session on this machine'
      : 'this directory'

  process.stdout.write(
    [
      `✅ ${action} ${claudeMdPath}`,
      '',
      `Claude will now read this on ${scopeLabel} and reach for planflow`,
      `tools by default. Re-run \`planflow-mcp init${scope === 'global' ? ' --global' : ''}\` to`,
      `pick up future template updates (idempotent).`,
      '',
      'Next steps (per project):',
      '  1. Open Claude in your project directory',
      '  2. Run: planflow_use(projectId: "your-uuid")',
      '     (one-time link — future sessions auto-resolve from cwd)',
      '  3. Run: planflow_index',
      '     (initial index of the codebase, ~5-10 min for a typical repo)',
      '',
      scope === 'global'
        ? `Tip: the MCP server also returns these instructions in its\ninitialize handshake (v0.2.8+), so MCP-aware clients pick up the\nworkflow even without CLAUDE.md. The global file is a safety net.`
        : 'Tip: planflow-mcp init --global writes to ~/.claude/CLAUDE.md\nso every Claude session uses the workflow, not just this project.',
      '',
    ].join('\n')
  )
  return 0
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
      '  planflow-mcp                  Start the MCP server (default, used by Claude / IDEs)',
      '  planflow-mcp init             Drop a CLAUDE.md template into the current directory',
      '                                (project-local — Claude uses planflow tools in this repo)',
      '  planflow-mcp init --global    Write the template to ~/.claude/CLAUDE.md',
      '                                (every future Claude Code session uses planflow tools)',
      '  planflow-mcp index            Incremental index of the current directory',
      '  planflow-mcp status           Print index status for the linked project',
      '  planflow-mcp help             Show this message',
      '',
      'Recommended first-time setup (one machine):',
      '  planflow-mcp init --global    (one-time global activation)',
      '',
      'Then per project:',
      '  cd your-repo',
      '  open Claude → planflow_use(projectId: "...")    (links cwd to a project)',
      '  open Claude → planflow_index                    (initial index)',
      '',
      'After that, just `planflow-mcp index` after edits — incremental and fast.',
      '',
      'Note: as of v0.2.8 the MCP server itself returns workflow guidance in its',
      'initialize handshake, so MCP-aware clients pick up the workflow without any',
      'CLAUDE.md. The init command is a safety net for completeness.',
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
    case 'init':
      exitCode = runInitCommand(args.slice(1))
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
