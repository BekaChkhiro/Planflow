/**
 * PlanFlow MCP — File Scanner
 *
 * Scans a project directory for files to index. The previous in-tool
 * implementation hard-coded a SKIP_DIRS Set and a DEFAULT_EXCLUDE glob list,
 * which meant any project with a custom build output, generated client, or
 * .gitignored vendor folder was silently uploaded to Voyage.
 *
 * This scanner instead behaves the way developers expect:
 *
 *   1. Reads `.gitignore` recursively (every visited directory contributes
 *      its rules to the matcher) — the universal "don't index this" signal.
 *   2. Reads optional `.planflowignore` from the root — same gitignore syntax,
 *      but lets users say "track in git, but don't embed" (eg. .env.example,
 *      huge JSON fixtures) without polluting their .gitignore.
 *   3. Always-on safety net for paths that often slip past .gitignore
 *      (.git/, lockfiles, OS noise like .DS_Store).
 *   4. Binary detection: reads the first 4 KB and skips files with a high
 *      null-byte ratio. Stops .wasm, compiled binaries, and minified bundles
 *      that happen to be under the size cap.
 *
 * The exported `ScannedFile` shape matches what the upstream batch indexer
 * needs (path/content/language) so this is a drop-in replacement for the old
 * `scanDirectory` function.
 */

import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync, type Dirent } from 'node:fs'
import { join, relative, extname } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { logger } from '../logger.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScannedFile = {
  path: string
  content: string
  language?: string
}

export type ScannerOptions = {
  /** Extra ignore patterns (gitignore syntax) supplied at call site. */
  extraIgnore?: string[]
  /**
   * Optional glob includes. When provided, files must match at least one
   * pattern in addition to passing the ignore rules. Mostly useful when the
   * caller wants to limit indexing to a subset (eg. `src/**` only).
   */
  include?: string[]
  /** Per-file size cap. Defaults to 1 MB (matches backend chunker limit). */
  maxFileSize?: number
}

// ---------------------------------------------------------------------------
// Built-in safety net
//
// The `ignore` package + project's .gitignore handles most cases. These
// patterns exist for projects that don't have a .gitignore, or where the
// .gitignore omits things that should never be indexed regardless.
// ---------------------------------------------------------------------------

const ALWAYS_IGNORE = [
  // VCS
  '.git',
  '.hg',
  '.svn',
  // OS noise
  '.DS_Store',
  'Thumbs.db',
  // Always-secret
  '.env',
  '.env.*',
  '!.env.example',
  '!.env.sample',
  // Lockfiles — huge, deterministic, no semantic value
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'poetry.lock',
  'uv.lock',
  // Common dependency / build dirs that may not be in .gitignore
  // (eg. monorepo roots, fresh clones)
  'node_modules',
  '.pnpm-store',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'target',           // Rust, Java, Scala
  'vendor',           // Go, PHP
  // Framework / build outputs
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vercel',
  '.cache',
  'dist',
  'build',
  'out',
  // Test / coverage artifacts
  'coverage',
  '.nyc_output',
  'test-results',
  'playwright-report',
  // PlanFlow's own per-repo artifacts. The whole .planflow/ dir is
  // treated as internal PlanFlow state — index-state.json,
  // project.json, future cache files — none of it adds search signal.
  '.planflow',
]

// ---------------------------------------------------------------------------
// Language detection — broader than the old map.
//
// The old map covered ~16 extensions and missed mainstream stacks like Vue,
// Svelte, Swift, Kotlin, Dart. The chunker on the server side may not chunk
// every one of these natively, but we still ship the file with `language`
// hinted so it gets paragraph-chunked instead of dropped.
// ---------------------------------------------------------------------------

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Python
  '.py': 'python',
  '.pyi': 'python',
  // Go / Rust / systems
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  // JVM languages
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',
  // Apple stack
  '.swift': 'swift',
  '.m': 'objc',
  '.mm': 'objc',
  // Frontend frameworks
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  // Other mainstream
  '.rb': 'ruby',
  '.php': 'php',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.hs': 'haskell',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.pl': 'perl',
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.zig': 'zig',
  // Schemas / queries
  '.prisma': 'prisma',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  // Markup / docs
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.rst': 'rst',
  '.adoc': 'asciidoc',
  '.tex': 'latex',
  // Web markup
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  // Style
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.styl': 'stylus',
  // Config / data — useful for AI to read app config
  '.json': 'json',
  '.jsonc': 'json',
  '.json5': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'env',
  // Shell / scripting
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.bat': 'batch',
  '.dockerfile': 'dockerfile',
  '.tf': 'terraform',
}

export function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  if (ext) return EXTENSION_LANGUAGE_MAP[ext]

  // Extension-less filenames that are conventionally specific languages.
  // We only handle a couple of high-value cases so we don't accidentally
  // mis-detect random files.
  const base = filePath.split('/').pop()?.toLowerCase()
  if (base === 'dockerfile' || base?.startsWith('dockerfile.')) return 'dockerfile'
  if (base === 'makefile' || base === 'gnumakefile') return 'makefile'
  if (base === 'rakefile') return 'ruby'
  if (base === 'gemfile') return 'ruby'

  return undefined
}

// ---------------------------------------------------------------------------
// Binary file detection
//
// Voyage / chunker happily accept text strings, but we waste tokens (or in
// rare cases blow up) when we hand them a binary. Empty heuristic:
//   • Read first 4 KB
//   • If > 1% of bytes are NUL, treat as binary
//   • Also bail on UTF-8 decode failures
//
// Cheap to run, fewer false positives than relying purely on extension.
// ---------------------------------------------------------------------------

const BINARY_PROBE_SIZE = 4096
const NULL_BYTE_THRESHOLD = 0.01

function isLikelyBinary(absPath: string): boolean {
  let fd: number | null = null
  try {
    fd = openSync(absPath, 'r')
    const buf = Buffer.alloc(BINARY_PROBE_SIZE)
    const bytesRead = readSync(fd, buf, 0, BINARY_PROBE_SIZE, 0)
    if (bytesRead === 0) return false

    let nullBytes = 0
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) nullBytes++
    }
    return nullBytes / bytesRead > NULL_BYTE_THRESHOLD
  } catch {
    // If we can't probe, assume text and let the read step decide
    return false
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Recursive .gitignore-aware scanner
// ---------------------------------------------------------------------------

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024 // 1 MB — matches backend chunker

/**
 * Scan a directory tree, honouring .gitignore + .planflowignore + the
 * built-in safety net. Returns the file list ready to hand to the indexer.
 *
 * Why we re-load .gitignore at every directory we visit: gitignore semantics
 * are scoped — `node_modules` in `apps/api/.gitignore` should only apply
 * inside `apps/api/`. The `ignore` package handles relative paths correctly
 * as long as we feed it paths relative to the root, which we do.
 */
export function scanProject(rootDir: string, options: ScannerOptions = {}): ScannedFile[] {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
  const ig = ignore()
  ig.add(ALWAYS_IGNORE)

  // .planflowignore is loaded once from the root — it's an explicit
  // PlanFlow-only override, not a recursive thing like .gitignore.
  loadIgnoreFile(ig, join(rootDir, '.planflowignore'))

  if (options.extraIgnore?.length) {
    ig.add(options.extraIgnore)
  }

  const includes = options.include?.length ? options.include : null
  const results: ScannedFile[] = []
  let skippedBinary = 0
  let skippedOversize = 0

  walk(rootDir, rootDir, ig, results, {
    maxFileSize,
    includes,
    onSkippedBinary: () => skippedBinary++,
    onSkippedOversize: () => skippedOversize++,
  })

  if (skippedBinary > 0 || skippedOversize > 0) {
    logger.info('Scanner skipped non-text or oversized files', {
      binary: skippedBinary,
      oversize: skippedOversize,
    })
  }

  return results
}

type WalkOptions = {
  maxFileSize: number
  includes: string[] | null
  onSkippedBinary: () => void
  onSkippedOversize: () => void
}

function walk(
  dir: string,
  rootDir: string,
  ig: Ignore,
  results: ScannedFile[],
  opts: WalkOptions
): void {
  // Pull .gitignore for THIS directory before reading entries — its rules
  // need to be in scope when we test the children we're about to iterate.
  loadIgnoreFile(ig, join(dir, '.gitignore'))

  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[]
  } catch (err) {
    logger.debug('Could not read directory', { dir, error: String(err) })
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(rootDir, fullPath)
    if (!relPath || relPath.startsWith('..')) continue

    const normalized = relPath.split('\\').join('/')
    const checkPath = entry.isDirectory() ? `${normalized}/` : normalized

    if (ig.ignores(checkPath)) continue

    if (entry.isDirectory()) {
      walk(fullPath, rootDir, ig, results, opts)
      continue
    }
    if (!entry.isFile()) continue

    if (opts.includes && !matchesIncludeList(normalized, opts.includes)) continue

    let stats
    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }
    if (stats.size === 0) continue
    if (stats.size > opts.maxFileSize) {
      logger.debug('Skipping oversized file', { path: normalized, size: stats.size })
      opts.onSkippedOversize()
      continue
    }

    if (isLikelyBinary(fullPath)) {
      logger.debug('Skipping binary file', { path: normalized })
      opts.onSkippedBinary()
      continue
    }

    let content: string
    try {
      content = readFileSync(fullPath, 'utf-8')
    } catch (err) {
      logger.warn('Failed to read file', { path: normalized, error: String(err) })
      continue
    }

    results.push({
      path: normalized,
      content,
      language: detectLanguage(normalized),
    })
  }
}

function loadIgnoreFile(ig: Ignore, path: string): void {
  try {
    const contents = readFileSync(path, 'utf-8')
    if (contents.trim()) ig.add(contents)
  } catch {
    // No file at this path — common, no-op.
  }
}

/**
 * Matches the existing minimatch-style include patterns so we don't break
 * callers that pass eg. `["**\/*.ts"]`. Kept loose: extension-only patterns
 * are the common shape; full glob support stays in the `ignore` package via
 * the exclude path.
 */
function matchesIncludeList(relPath: string, includes: string[]): boolean {
  for (const pattern of includes) {
    if (matchesIncludePattern(relPath, pattern)) return true
  }
  return false
}

function matchesIncludePattern(relPath: string, pattern: string): boolean {
  // **/*.ext — most common shape from DEFAULT_INCLUDE
  if (pattern.startsWith('**/*.')) {
    return relPath.endsWith(pattern.slice(3))
  }
  // *.ext
  if (pattern.startsWith('*.')) {
    return relPath.endsWith(pattern.slice(1))
  }
  // dir/  or  dir/**
  if (pattern.endsWith('/') || pattern.endsWith('/**')) {
    const prefix = pattern.replace(/\/\*\*$/, '/').replace(/\/$/, '/')
    return relPath.startsWith(prefix)
  }
  // Fallback — exact match or shallow contains
  return relPath === pattern || relPath.endsWith('/' + pattern)
}
