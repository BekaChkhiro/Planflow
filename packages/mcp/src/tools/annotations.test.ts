/**
 * Guard tests for the central tool-annotation registry.
 *
 * These keep the registry honest: every shipped tool must be classified
 * (so none silently loses its permission hint), no entry may point at a
 * tool that no longer exists, and read-only/destructive flags must stay
 * mutually consistent.
 */

import { describe, it, expect } from 'vitest'
import { tools } from './index.js'
import { TOOL_ANNOTATIONS } from './annotations.js'

describe('TOOL_ANNOTATIONS registry', () => {
  it('classifies every registered tool', () => {
    const missing = tools
      .filter((t) => !t.annotations && !TOOL_ANNOTATIONS[t.name])
      .map((t) => t.name)
    expect(missing, `tools missing an annotation entry: ${missing.join(', ')}`).toEqual([])
  })

  it('has no entries for tools that do not exist', () => {
    const names = new Set(tools.map((t) => t.name))
    const orphans = Object.keys(TOOL_ANNOTATIONS).filter((name) => !names.has(name))
    expect(orphans, `orphaned annotation entries: ${orphans.join(', ')}`).toEqual([])
  })

  it('never marks a tool both read-only and destructive', () => {
    const conflicts = Object.entries(TOOL_ANNOTATIONS)
      .filter(([, a]) => a.readOnlyHint && a.destructiveHint)
      .map(([name]) => name)
    expect(conflicts, `read-only AND destructive: ${conflicts.join(', ')}`).toEqual([])
  })

  it('gives every entry a human-readable title', () => {
    const untitled = Object.entries(TOOL_ANNOTATIONS)
      .filter(([, a]) => !a.title)
      .map(([name]) => name)
    expect(untitled, `entries without a title: ${untitled.join(', ')}`).toEqual([])
  })
})
