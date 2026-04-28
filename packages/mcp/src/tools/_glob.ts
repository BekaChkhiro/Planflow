/**
 * Lightweight glob matcher (minimatch-style subset).
 *
 * Supports the patterns we actually use in this codebase:
 *   - `**` at start, middle, or end (`**\/foo`, `prefix/**\/suffix`, `foo/**`)
 *   - `*` and `?` wildcards within a single path segment
 *
 * Not full minimatch — no brace expansion `{a,b}`, no negation `!`, no
 * extglob. The third-party `minimatch` package supports those if you need
 * them, but pulling in a dep for this is overkill given our patterns.
 */

export function minimatch(path: string, pattern: string): boolean {
  // **/rest — matches at any depth
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
      if (minimatch(subPath, suffix)) return true
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

/** True if `path` matches ANY pattern in the list. */
export function matchesAny(path: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (minimatch(path, p)) return true
  }
  return false
}
