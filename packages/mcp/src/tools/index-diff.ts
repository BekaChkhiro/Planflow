/**
 * PlanFlow MCP Server — planflow_index_diff
 *
 * Preview what `planflow_index` would do without actually doing it. Returns
 * the change set the indexer would push: files to (re)embed, files to drop,
 * estimated Voyage tokens, and estimated cost.
 *
 * The flow mirrors `planflow_index`:
 *   1. Scan the directory (respects .gitignore / .planflowignore / safety net)
 *   2. Run incremental planning — git diff if available, hash compare otherwise
 *   3. Format the plan as a human-readable preview
 *
 * No backend writes, no Voyage tokens spent, no state file updates. Safe to
 * call as often as you want.
 */

import { z } from 'zod'
import { isAuthenticated } from '../config.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import { getCurrentProjectId } from './use.js'
import { coerceBoolean } from './_coerce.js'
import { scanProject } from './_scanner.js'
import { planIncrementalChanges } from './_incremental.js'

// Voyage-code-3 pricing — kept in sync with index-project.ts. If we ever
// switch tiers / models this is the one place to update.
const VOYAGE_USD_PER_M_TOKENS = 0.18

const InputSchema = z
  .object({
    projectId: z
      .string()
      .uuid('Project ID must be a valid UUID')
      .optional()
      .describe('Project ID. Uses current project from planflow_use() if omitted.'),
    directory: z
      .string()
      .min(1)
      .optional()
      .describe('Directory to diff. Defaults to the MCP server cwd.'),
    include: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined
        if (typeof val === 'string') return [val]
        return val
      })
      .describe(
        'Optional positive filter — limit the scan to files matching at least one glob pattern (e.g. ["src/**/*.ts"]). Same semantics as planflow_index.'
      ),
    exclude: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((val) => {
        if (val === undefined) return []
        if (typeof val === 'string') return [val]
        return val
      })
      .describe('Extra .gitignore-style patterns to skip. Same semantics as planflow_index.'),
    incremental: coerceBoolean()
      .default(true)
      .describe(
        'When true (default), compute changes since the last index pass (git diff or hash compare). Set false to preview "everything would be re-embedded".'
      ),
    removeMissing: coerceBoolean()
      .default(false)
      .describe(
        'When true, also report files the backend has indexed but that no longer exist on disk. Mirrors planflow_index removeMissing.'
      ),
    showPaths: coerceBoolean()
      .default(false)
      .describe(
        'When true, list every changed/removed file path in the response. Off by default to keep the output compact for large diffs.'
      ),
  })

type Input = z.infer<typeof InputSchema>

export const indexDiffTool: ToolDefinition<Input> = {
  name: 'planflow_index_diff',

  description: `Preview what \`planflow_index\` would do — without spending any tokens.

Reports the change set the indexer would push if you ran it right now:
  • Files to (re)embed (new + modified)
  • Files to drop (deleted + renamed-from)
  • Estimated Voyage-code-3 tokens
  • Estimated USD cost
  • Detection mode used (git diff vs file-hash compare vs full)

Use this when:
  ✅ You want to know "is it worth running planflow_index right now?"
  ✅ Before a costly first-time index of a large repo
  ✅ Debugging why incremental keeps re-embedding the same files

This is safe to call as often as you want — no Voyage tokens, no API
writes, no state changes. Read-only.

Tip — narrow the diff:
  planflow_index_diff(directory: "apps/web") — diff just one app
  planflow_index_diff(showPaths: true) — list every changed file by name
  planflow_index_diff(incremental: false) — see the full re-embed cost

Prerequisites:
  • Logged in via planflow_login()
  • Project selected via planflow_use() OR pass projectId explicitly
  • For accurate diffs, run planflow_index at least once first so a
    state file (and backend index) exists to compare against.`,

  inputSchema: InputSchema,

  async execute(input: Input) {
    const projectId = input.projectId || getCurrentProjectId()
    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_index_diff(projectId: "uuid", ...)\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }
    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\nplanflow_login(token: "your-api-token")'
      )
    }

    const rawDir = input.directory ?? process.cwd()
    const dirPath = rawDir.startsWith('~')
      ? rawDir.replace(/^~/, process.env['HOME'] || '')
      : rawDir

    logger.info('Diffing index', { dirPath, projectId, incremental: input.incremental })

    const files = scanProject(dirPath, {
      include: input.include,
      extraIgnore: input.exclude,
    })

    if (files.length === 0) {
      return createErrorResult(
        `❌ No files matched in ${dirPath}.\n\n` +
          `The scanner respects .gitignore + .planflowignore — make sure your\n` +
          `target files aren't excluded.`
      )
    }

    const plan = await planIncrementalChanges({
      rootDir: dirPath,
      projectId,
      scannedFiles: files,
      incremental: input.incremental,
      removeMissing: input.removeMissing,
    })

    return createSuccessResult(formatDiff({ dirPath, files, plan, showPaths: input.showPaths }))
  },
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatDiff(args: {
  dirPath: string
  files: import('./_scanner.js').ScannedFile[]
  plan: import('./_incremental.js').IncrementalPlan
  showPaths: boolean
}): string {
  const { dirPath, files, plan, showPaths } = args

  // Bytes / token / cost estimate. Same ratio used in dry-run preview.
  let bytesToIndex = 0
  for (const f of plan.workingFiles) bytesToIndex += Buffer.byteLength(f.content, 'utf-8')
  const estimatedTokens = Math.ceil(bytesToIndex / 4)
  const estimatedCostUsd = (estimatedTokens / 1_000_000) * VOYAGE_USD_PER_M_TOKENS

  // Categorise working files vs the previous state, when we have one. This
  // gives "added vs modified" granularity in git mode for free; in hash mode
  // we don't know which is which, so we lump them as "to re-embed".
  const lines: string[] = []
  lines.push(`📊 Index diff for ${dirPath}`)
  lines.push('')
  lines.push(modeLine(plan))
  lines.push('')
  lines.push(`📄 Files scanned (post-filter): ${files.length}`)
  lines.push(`✏️  Files to (re)embed: ${plan.workingFiles.length}`)
  lines.push(`⏭️  Unchanged: ${plan.unchangedLocally}`)
  lines.push(`🗑️  Files to remove: ${plan.removedFiles.length}`)
  lines.push('')
  lines.push(`🪙 Estimated tokens: ~${formatTokens(estimatedTokens)} (Voyage-code-3)`)
  lines.push(`💵 Estimated cost: ${formatCost(estimatedCostUsd)} (PlanFlow Cloud absorbs this)`)
  lines.push('')

  if (plan.workingFiles.length === 0 && plan.removedFiles.length === 0) {
    lines.push('✅ Nothing to do — index is already up to date.')
    if (plan.previousState) {
      lines.push(`   Last indexed: ${plan.previousState.lastIndexedAt}`)
      if (plan.previousState.lastCommitHash) {
        lines.push(`   At commit:    ${plan.previousState.lastCommitHash.slice(0, 7)}`)
      }
    }
    return lines.join('\n')
  }

  if (showPaths) {
    if (plan.workingFiles.length > 0) {
      lines.push('To (re)embed:')
      for (const f of plan.workingFiles.slice(0, 50)) lines.push(`  + ${f.path}`)
      if (plan.workingFiles.length > 50) {
        lines.push(`  ... and ${plan.workingFiles.length - 50} more`)
      }
      lines.push('')
    }
    if (plan.removedFiles.length > 0) {
      lines.push('To remove:')
      for (const path of plan.removedFiles.slice(0, 50)) lines.push(`  - ${path}`)
      if (plan.removedFiles.length > 50) {
        lines.push(`  ... and ${plan.removedFiles.length - 50} more`)
      }
      lines.push('')
    }
  }

  lines.push('💡 Run for real:')
  lines.push('  planflow_index() — apply this diff')
  if (!showPaths && (plan.workingFiles.length > 0 || plan.removedFiles.length > 0)) {
    lines.push('  planflow_index_diff(showPaths: true) — list paths')
  }
  return lines.join('\n')
}

function modeLine(plan: import('./_incremental.js').IncrementalPlan): string {
  if (plan.mode === 'git') {
    const head = plan.headCommit?.slice(0, 7) ?? '??'
    const prev = plan.previousState?.lastCommitHash?.slice(0, 7) ?? '??'
    return `🔁 Mode: git-diff (${prev}..${head})`
  }
  if (plan.mode === 'hash') {
    return `🔁 Mode: file-hash compare (no git state available)`
  }
  return `🔁 Mode: full (no previous index — first pass would re-embed everything)`
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}
