/**
 * PlanFlow MCP — Markdown → PlanTree parser
 *
 * Parses a PROJECT_PLAN.md file into a structured PlanTree the
 * validator, refiner, and scaffolder can operate on.
 *
 * Format expectations (matches packages/plugin/templates/*):
 *
 *   ### Phase N: <Name> (Est: <estimate>)
 *
 *   #### T<phase>.<n>: <Task name>
 *   - [ ] **Status**: TODO|IN_PROGRESS|DONE|BLOCKED
 *   - **Complexity**: Low|Medium|High
 *   - **Estimated**: N hours
 *   - **Dependencies**: T1.1, T1.2 | None
 *   - **Description**:
 *     - bullet
 *     - bullet
 *   - **Acceptance Criteria**:    (optional, MCP extension)
 *     - bullet
 *     - bullet
 *   - **Test Task**: T1.7         (optional, MCP extension)
 *
 * The parser is tolerant: unknown lines inside a task are appended
 * to its description so round-tripping doesn't lose content.
 */

import type {
  PhaseNode,
  PlanMeta,
  PlanTree,
  TaskComplexity,
  TaskNode,
  TaskStatus,
} from './types.js'

const PHASE_HEADER = /^###\s+Phase\s+(\d+)\s*:\s*(.+?)\s*(?:\(Est[:.]?\s*([^)]+)\))?\s*$/i
const TASK_HEADER = /^####\s+(T\d+(?:\.\d+)?)\s*:\s*(.+?)\s*$/
const FIELD_LINE = /^\s*-\s+\*\*([^*]+)\*\*\s*:\s*(.*)$/
const STATUS_LINE = /^\s*-\s+\[[ x]\]\s+\*\*Status\*\*\s*:\s*([A-Z_]+)\s*$/
const BULLET = /^\s{2,}-\s+(.+)$/
const META_LINE = /^\*\*([^*]+)\*\*\s*:\s*(.+)$/

const VALID_STATUS: ReadonlySet<TaskStatus> = new Set([
  'TODO',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
])
const VALID_COMPLEXITY: ReadonlySet<TaskComplexity> = new Set([
  'Low',
  'Medium',
  'High',
])

/**
 * Parse a PROJECT_PLAN.md string into a PlanTree.
 *
 * Best-effort: malformed sections are kept verbatim in preamble/
 * postamble so the document is preserved. Real validation errors
 * are surfaced by the validator, not by throwing here.
 */
export function parsePlan(source: string): PlanTree {
  const lines = source.split('\n')
  const meta = parseMeta(lines)

  const phases: PhaseNode[] = []
  let currentPhase: PhaseNode | null = null
  let currentTask: TaskNode | null = null
  let currentDescription: string[] = []
  let currentAcceptance: string[] = []
  let inDescription = false
  let inAcceptance = false

  let firstPhaseLine = -1
  let lastPhaseEndLine = -1

  function flushTask() {
    if (!currentTask) return
    if (currentDescription.length > 0) {
      currentTask.description = currentDescription.join('\n').trim()
    }
    if (currentAcceptance.length > 0) {
      currentTask.acceptanceCriteria = currentAcceptance
        .map((s) => s.trim())
        .filter(Boolean)
    }
    currentPhase?.tasks.push(currentTask)
    currentTask = null
    currentDescription = []
    currentAcceptance = []
    inDescription = false
    inAcceptance = false
  }

  function flushPhase() {
    flushTask()
    if (currentPhase) {
      phases.push(currentPhase)
      currentPhase = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const line = raw

    // Phase header
    const phaseMatch = line.match(PHASE_HEADER)
    if (phaseMatch) {
      flushPhase()
      if (firstPhaseLine < 0) firstPhaseLine = i
      const [, num, name, estimate] = phaseMatch
      currentPhase = {
        number: Number.parseInt(num ?? '0', 10),
        name: (name ?? '').trim(),
        estimate: estimate?.trim(),
        tasks: [],
      }
      lastPhaseEndLine = i
      continue
    }

    // Task header
    const taskMatch = line.match(TASK_HEADER)
    if (taskMatch && currentPhase) {
      flushTask()
      const [, taskId, taskName] = taskMatch
      const phaseFromId = parsePhaseFromTaskId(taskId ?? '')
      currentTask = {
        taskId: taskId ?? '',
        phase: phaseFromId ?? currentPhase.number,
        name: (taskName ?? '').trim(),
        description: '',
        status: 'TODO',
        complexity: 'Medium',
        dependencies: [],
        sourceLine: i,
      }
      lastPhaseEndLine = i
      continue
    }

    if (!currentTask || !currentPhase) {
      continue
    }

    // Status line (special — uses checkbox prefix)
    const statusMatch = line.match(STATUS_LINE)
    if (statusMatch) {
      const value = (statusMatch[1] ?? '').trim().toUpperCase()
      if (VALID_STATUS.has(value as TaskStatus)) {
        currentTask.status = value as TaskStatus
      }
      lastPhaseEndLine = i
      continue
    }

    // Other field lines
    const fieldMatch = line.match(FIELD_LINE)
    if (fieldMatch) {
      const key = (fieldMatch[1] ?? '').trim().toLowerCase()
      const value = (fieldMatch[2] ?? '').trim()

      // Entering a multi-line block resets the bullet collectors
      inDescription = false
      inAcceptance = false

      switch (key) {
        case 'complexity': {
          if (VALID_COMPLEXITY.has(value as TaskComplexity)) {
            currentTask.complexity = value as TaskComplexity
          }
          break
        }
        case 'estimated':
        case 'estimated hours': {
          const hours = parseHours(value)
          if (hours !== undefined) currentTask.estimatedHours = hours
          break
        }
        case 'dependencies':
        case 'dependency': {
          currentTask.dependencies = parseDependencies(value)
          break
        }
        case 'description': {
          inDescription = true
          if (value) currentDescription.push(value)
          break
        }
        case 'acceptance criteria':
        case 'acceptance': {
          inAcceptance = true
          if (value) currentAcceptance.push(value)
          break
        }
        case 'test task':
        case 'tests': {
          const cleaned = value.replace(/[*_`]/g, '').trim()
          if (cleaned && cleaned.toLowerCase() !== 'none') {
            currentTask.testTaskId = cleaned
          }
          break
        }
        default: {
          // Unknown field — append verbatim so we don't lose it
          currentDescription.push(`- **${fieldMatch[1]}**: ${value}`)
        }
      }
      lastPhaseEndLine = i
      continue
    }

    // Indented bullet under description / acceptance criteria
    const bulletMatch = line.match(BULLET)
    if (bulletMatch) {
      const bullet = (bulletMatch[1] ?? '').trim()
      if (inAcceptance) {
        currentAcceptance.push(bullet)
      } else if (inDescription) {
        currentDescription.push(`  - ${bullet}`)
      } else {
        // Stray bullet — default to description bucket
        currentDescription.push(`  - ${bullet}`)
      }
      lastPhaseEndLine = i
      continue
    }

    // Blank or horizontal-rule line terminates description capture
    if (line.trim() === '' || line.trim().startsWith('---')) {
      inDescription = false
      inAcceptance = false
      continue
    }

    // Anything else inside a task boundary is unrecognized prose — keep
    // it verbatim under the current capture bucket so round-trip is
    // lossless. Without this fallback, freeform notes silently vanish.
    if (inAcceptance) {
      currentAcceptance.push(line.trim())
    } else {
      currentDescription.push(line)
    }
    lastPhaseEndLine = i
  }

  flushPhase()

  const preamble =
    firstPhaseLine > 0 ? lines.slice(0, firstPhaseLine).join('\n') : ''
  const postamble =
    lastPhaseEndLine >= 0 && lastPhaseEndLine + 1 < lines.length
      ? lines.slice(lastPhaseEndLine + 1).join('\n')
      : ''

  return {
    meta,
    phases,
    preamble,
    postamble,
    source,
  }
}

function parseMeta(lines: string[]): PlanMeta {
  const meta: PlanMeta = {}
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const line = lines[i]?.trim() ?? ''

    // H1 → project name
    if (!meta.projectName && line.startsWith('# ')) {
      const heading = line.replace(/^#\s+/, '').trim()
      const idx = heading.indexOf(' - ')
      meta.projectName = idx > 0 ? heading.slice(0, idx).trim() : heading
      continue
    }

    const m = line.match(META_LINE)
    if (!m) continue
    const key = (m[1] ?? '').trim().toLowerCase()
    const value = (m[2] ?? '').trim()
    switch (key) {
      case 'project name':
        meta.projectName ??= value
        break
      case 'description':
        meta.description = value
        break
      case 'target users':
        meta.targetUsers = value
        break
      case 'project type':
        meta.projectType = value
        break
      case 'status':
        meta.status = value
        break
    }
  }
  return meta
}

function parsePhaseFromTaskId(taskId: string): number | undefined {
  const m = taskId.match(/^T(\d+)/)
  if (!m) return undefined
  return Number.parseInt(m[1] ?? '0', 10) || undefined
}

function parseHours(value: string): number | undefined {
  const m = value.match(/([\d.]+)/)
  if (!m) return undefined
  const n = Number.parseFloat(m[1] ?? '')
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseDependencies(value: string): string[] {
  const cleaned = value.replace(/[*_`]/g, '').trim()
  if (!cleaned || /^none$/i.test(cleaned)) return []
  return cleaned
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^T\d+(?:\.\d+)?$/i.test(s))
    .map((s) => s.toUpperCase())
}
