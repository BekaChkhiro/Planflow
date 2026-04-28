/**
 * Schema coercion helpers.
 *
 * MCP transports occasionally hand parameters through as strings even when
 * the JSON-Schema declared `type: "number"` / `"boolean"` — different
 * clients serialize differently, and a permissive server-side coercion
 * keeps the surface friendlier than failing with VALIDATION_ERROR every
 * time `limit: "10"` shows up.
 *
 * Use these instead of `z.number()` / `z.boolean()` directly in any
 * tool input schema that an LLM might invoke.
 */

import { z } from 'zod'

/**
 * Like `z.number()` but tolerates a numeric string ("10" → 10).
 *
 * Returns a real `ZodNumber`, so the usual chainables (`.int()`, `.min()`,
 * `.max()`, `.default()`) all work. Internally relies on Zod's built-in
 * `z.coerce.number()` which calls `Number(value)` — that's fine for our
 * use case (LLMs hand us either numbers or numeric strings) but means
 * `null` / `false` would become 0 if they ever arrived. They shouldn't
 * in practice; the alternative (a custom `z.preprocess` wrapper) loses
 * the chainable shape.
 */
export function coerceNumber(): z.ZodNumber {
  return z.coerce.number()
}

/**
 * Like `z.boolean()` but accepts the common stringified forms LLMs
 * sometimes emit ("true"/"false", "1"/"0", "yes"/"no").
 *
 * Returns a `ZodEffects` rather than a `ZodBoolean` because Zod's own
 * `z.coerce.boolean()` is too lax — it would treat the string "false"
 * as truthy. The downside: you can't add `.refine()` after this; if
 * you need to, wrap differently.
 */
export function coerceBoolean() {
  return z.preprocess((val) => {
    if (typeof val === 'boolean') return val
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true
      if (['false', '0', 'no', 'off'].includes(normalized)) return false
    }
    if (typeof val === 'number') {
      if (val === 1) return true
      if (val === 0) return false
    }
    return val
  }, z.boolean())
}
