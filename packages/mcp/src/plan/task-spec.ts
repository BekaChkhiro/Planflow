/**
 * PlanFlow MCP — Task spec composition
 *
 * The canonical "precise task" template. A task is agent-executable when
 * it spells out — not just describes — five things beyond its goal:
 *
 *   • Touchpoints — which files to create / edit
 *   • Contract    — signatures, routes, request/response shape, types
 *   • Steps       — the ordered implementation outline
 *   • Constraints — what NOT to touch, invariants, out-of-scope
 *   • Verify      — the runnable command(s) that prove it's done
 *
 * These live as labeled markdown sections INSIDE a task's `description`
 * body (the parser keeps unknown `**Field**` bullets verbatim, so this
 * round-trips with zero schema/DB changes). `composeDescription` is the
 * single place that lays them out, so task_create, phase_create, and the
 * scaffolder all emit an identical, validator-friendly shape.
 *
 * Acceptance Criteria are intentionally NOT composed here — they have a
 * dedicated structured field on TaskNode and their own serializer block.
 */

export interface SpecSections {
  /** Files to create/edit, e.g. ["create src/auth/login.ts", "edit src/routes/index.ts"]. */
  touchpoints?: string[]
  /** Interface contract — signature, route + request/response shape, types, status codes. */
  contract?: string
  /** Ordered implementation steps. */
  steps?: string[]
  /** What NOT to touch, invariants to preserve, explicit out-of-scope items. */
  constraints?: string[]
  /** Runnable verification command(s), e.g. "pnpm test src/auth && pnpm typecheck". */
  verify?: string
}

/**
 * One-line guidance reused in tool descriptions so the authoring agent
 * knows which fields make a task precise.
 */
export const SPEC_FIELDS_HINT =
  'For an agent to execute flawlessly, also pass: touchpoints (files to create/edit), ' +
  'contract (signatures / API route + request/response shape / types), steps (ordered), ' +
  'constraints (what NOT to touch), and verify (a runnable command). These compose into ' +
  'the description as labeled sections and drive the Instruction-Precision score.'

/** Normalize a free-form body into 2-space indented markdown bullets. */
function bodyToBullets(body: string): string[] {
  const out: string[] = []
  for (const raw of body.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    out.push(`  - ${trimmed.replace(/^-\s+/, '')}`)
  }
  return out
}

/**
 * Compose a precise task description: the freeform body plus whichever
 * structured spec sections were supplied, in a stable order. Returns the
 * 2-space indented markdown bullet block stored in `TaskNode.description`.
 *
 * Sections are omitted when empty — composing is additive, so a caller
 * that supplies nothing gets exactly the normalized body it passed in.
 */
export function composeDescription(body: string, spec: SpecSections = {}): string {
  const lines: string[] = []

  if (spec.touchpoints && spec.touchpoints.length > 0) {
    lines.push(`  - **Touchpoints**: ${spec.touchpoints.join('; ')}`)
  }
  if (spec.contract && spec.contract.trim()) {
    lines.push(`  - **Contract**: ${spec.contract.trim()}`)
  }

  // Body goes after the "where/what" but before steps so the prose reads
  // as the goal, then the ordered plan to achieve it.
  lines.push(...bodyToBullets(body))

  if (spec.steps && spec.steps.length > 0) {
    lines.push('  - **Steps**:')
    spec.steps.forEach((s, i) => {
      lines.push(`    - ${i + 1}. ${s.trim()}`)
    })
  }
  if (spec.constraints && spec.constraints.length > 0) {
    lines.push(`  - **Constraints**: ${spec.constraints.join('; ')}`)
  }
  if (spec.verify && spec.verify.trim()) {
    lines.push(`  - **Verify**: \`${spec.verify.trim().replace(/^`|`$/g, '')}\``)
  }

  return lines.join('\n')
}

/**
 * Append section *prompts* to a scaffolded task. The deterministic
 * scaffolder can't know real file paths or signatures for a project that
 * doesn't exist yet, so it emits labeled placeholders that make the
 * structure explicit and cue the LLM/user to fill in specifics during
 * refinement. This keeps generated feature tasks above the precision
 * floor while being honest about what still needs filling.
 */
export function scaffoldSpecPrompts(body: string): string {
  const lines = bodyToBullets(body)
  lines.push('  - **Touchpoints**: _(fill in: files to create/edit, e.g. src/feature/x.ts)_')
  lines.push('  - **Contract**: _(fill in: signatures / API route + request/response shape / types)_')
  lines.push('  - **Constraints**: _(fill in: what NOT to touch, invariants, out-of-scope)_')
  lines.push('  - **Verify**: _(fill in: a runnable command, e.g. `pnpm test <path>`)_')
  return lines.join('\n')
}
