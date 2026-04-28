/**
 * Lightweight glob matcher (minimatch-style subset).
 *
 * Supports the patterns we actually use in this codebase:
 *   - `**` at start, middle, or end (`**\/foo`, `prefix/**\/suffix`, `foo/**`)
 *   - `*` and `?` wildcards within a single path segment
 *   - Brace expansion `{a,b,c}` (also nestable, e.g. `{a,{b,c}}`)
 *
 * Still not full minimatch — no negation `!`, no extglob — but covers the
 * patterns LLM-supplied includes/excludes typically reach for.
 */

/**
 * Expand brace patterns into the full set of literal patterns.
 *
 * `"src/{a,b}/*.ts"` → `["src/a/*.ts", "src/b/*.ts"]`
 * `"{x,{y,z}}"`       → `["x", "y", "z"]`
 *
 * Splits on the FIRST top-level `{...}` group and recurses on the rest;
 * this handles arbitrary nesting cleanly without a real parser.
 */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf('{')
  if (open === -1) return [pattern]

  // Find the matching closing brace, accounting for nested groups so
  // `{a,{b,c}}` doesn't terminate at the inner `}`.
  let depth = 0
  let close = -1
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === '{') depth++
    else if (pattern[i] === '}') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close === -1) return [pattern] // unmatched brace — treat literally

  const prefix = pattern.slice(0, open)
  const suffix = pattern.slice(close + 1)
  const inner = pattern.slice(open + 1, close)

  // Split the inner content on top-level commas only.
  const options: string[] = []
  let optDepth = 0
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '{') optDepth++
    else if (inner[i] === '}') optDepth--
    else if (inner[i] === ',' && optDepth === 0) {
      options.push(inner.slice(start, i))
      start = i + 1
    }
  }
  options.push(inner.slice(start))

  // Recurse: each option might itself contain further braces, and the
  // suffix could too.
  const results: string[] = []
  for (const opt of options) {
    for (const expandedRest of expandBraces(suffix)) {
      results.push(...expandBraces(prefix + opt + expandedRest))
    }
  }
  return results
}

function minimatchSimple(path: string, pattern: string): boolean {
  // **/rest — matches at any depth
  if (pattern.startsWith('**/')) {
    const rest = pattern.slice(3)
    if (rest === '') return true
    const parts = path.split('/')
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/')
      if (minimatchSimple(suffix, rest)) return true
    }
    return false
  }

  // prefix/**/suffix
  const globstarIdx = pattern.indexOf('/**/')
  if (globstarIdx !== -1) {
    const prefix = pattern.slice(0, globstarIdx)
    const suffix = pattern.slice(globstarIdx + 4)
    if (!path.startsWith(prefix)) return false
    const restPath = path.slice(prefix.length)
    const parts = restPath.split('/')
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/')
      if (minimatchSimple(subPath, suffix)) return true
    }
    return false
  }

  // prefix/**
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return path === prefix || path.startsWith(prefix + '/')
  }

  // Simple glob: convert * and ? to regex within a single segment.
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${regexPattern}$`).test(path)
}

/**
 * Public matcher — expands braces first, then matches each expansion
 * against the path. Caller-facing replacement for the original
 * `minimatch()` export (kept the same name so existing call sites work).
 */
export function minimatch(path: string, pattern: string): boolean {
  const expanded = expandBraces(pattern)
  for (const p of expanded) {
    if (minimatchSimple(path, p)) return true
  }
  return false
}

/** True if `path` matches ANY pattern in the list. */
export function matchesAny(path: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (minimatch(path, p)) return true
  }
  return false
}
