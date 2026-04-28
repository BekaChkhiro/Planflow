/**
 * PlanFlow MCP Server - Configuration Management
 *
 * Handles loading and saving configuration including API tokens.
 * Configuration is stored in the user's home directory.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { ConfigError } from './errors.js'
import { logger } from './logger.js'

/**
 * Configuration schema
 */
const ConfigSchema = z.object({
  apiToken: z.string().optional(),
  apiUrl: z.string().url().default('https://api.planflow.tools'),
  userId: z.string().uuid().optional(),
  userEmail: z.string().email().optional(),
  // Persisted across MCP server restarts so `planflow_use` survives
  // session boundaries the way `planflow_login` does.
  currentProjectId: z.string().uuid().optional(),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Config = {
  apiUrl: 'https://api.planflow.tools',
}

/**
 * Get the configuration directory path
 */
function getConfigDir(): string {
  const home = homedir()
  return join(home, '.config', 'planflow')
}

/**
 * Get the configuration file path
 */
function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

/**
 * Ensure the configuration directory exists
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
    logger.debug('Created config directory', { path: configDir })
  }
}

/**
 * Load configuration from disk
 */
export function loadConfig(): Config {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    logger.debug('No config file found, using defaults')
    return DEFAULT_CONFIG
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content) as unknown
    const config = ConfigSchema.parse(parsed)
    logger.debug('Loaded config from disk')
    return config
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid config file, using defaults', { errors: error.errors })
      return DEFAULT_CONFIG
    }
    throw new ConfigError('Failed to load configuration', { error: String(error) })
  }
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: Partial<Config>): Config {
  ensureConfigDir()
  const configPath = getConfigPath()

  // Merge with existing config
  const existingConfig = loadConfig()
  const newConfig = ConfigSchema.parse({ ...existingConfig, ...config })

  try {
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8')
    logger.debug('Saved config to disk')
    return newConfig
  } catch (error) {
    throw new ConfigError('Failed to save configuration', { error: String(error) })
  }
}

/**
 * Clear stored credentials (logout).
 * Also clears the current-project selection — once you've logged out,
 * the project context is no longer meaningful and will only confuse
 * the next session if left behind.
 */
export function clearCredentials(): void {
  const config = loadConfig()
  saveConfig({
    ...config,
    apiToken: undefined,
    userId: undefined,
    userEmail: undefined,
    currentProjectId: undefined,
  })
  logger.info('Cleared stored credentials')
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const config = loadConfig()
  return !!config.apiToken
}

/**
 * Get API token or throw if not authenticated
 */
export function getApiToken(): string {
  const config = loadConfig()
  if (!config.apiToken) {
    throw new ConfigError('Not authenticated. Please run planflow_login first.')
  }
  return config.apiToken
}

/**
 * Get API URL
 */
export function getApiUrl(): string {
  const config = loadConfig()
  return config.apiUrl
}

/**
 * Get the persisted "current project" ID, if any.
 *
 * Returns null when no project has been selected — callers should treat
 * this as "no current project" and ask the user (or accept an explicit
 * projectId on the tool call).
 */
export function getStoredCurrentProjectId(): string | null {
  const config = loadConfig()
  return config.currentProjectId ?? null
}

/**
 * Persist the "current project" ID to disk so it survives MCP server
 * restarts. Pass `null` to clear.
 */
export function setStoredCurrentProjectId(projectId: string | null): void {
  const config = loadConfig()
  saveConfig({
    ...config,
    currentProjectId: projectId ?? undefined,
  })
}

// ---------------------------------------------------------------------------
// Local project map (cwd → projectId)
//
// A side-channel JSON file that records which absolute path on this machine
// corresponds to which PlanFlow project UUID. This is the magic that lets
// `planflow_use`-less workflows work: the MCP server reads its cwd at
// startup, looks it up in this map, and auto-sets the current project.
//
// Stored separately from config.json because:
//   - It's intrinsically per-machine (paths don't roam)
//   - It can grow beyond a single project (one entry per linked repo)
// ---------------------------------------------------------------------------

const ProjectMapSchema = z.record(z.string(), z.string().uuid())
type ProjectMap = z.infer<typeof ProjectMapSchema>

function getProjectMapPath(): string {
  return join(getConfigDir(), 'project-map.json')
}

/** Load the cwd → projectId map. Returns {} if file missing or unreadable. */
export function getProjectMap(): ProjectMap {
  const path = getProjectMapPath()
  if (!existsSync(path)) return {}
  try {
    const content = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(content) as unknown
    return ProjectMapSchema.parse(parsed)
  } catch (error) {
    logger.warn('Invalid project-map.json, treating as empty', { error: String(error) })
    return {}
  }
}

/**
 * Look up a project for a specific path with the full hybrid resolution
 * order:
 *
 *   1. .planflow/project.json in `path` or any parent (the new primary
 *      source of truth — also includes the project name)
 *   2. Legacy global ~/.config/planflow/project-map.json (back-compat for
 *      users still on v0.2.8 and below)
 *
 * Returns the project ID + (when available) the project name. Name is
 * undefined when only the legacy map matched, since the legacy schema
 * never stored names.
 */
export function lookupProjectByPath(
  path: string
): { projectId: string; projectName?: string } | null {
  // Layer 1: walk up looking for .planflow/project.json. Walking on every
  // call is cheap (existsSync + JSON parse on a tiny file) and saves us
  // from having to track an in-memory cache that goes stale across edits.
  const local = readLocalProjectLink(path)
  if (local) {
    return { projectId: local.projectId, projectName: local.projectName }
  }

  // Layer 2: legacy global map.
  const map = getProjectMap()
  if (map[path]) return { projectId: map[path] }

  let current = path
  while (current !== '/' && current !== '.') {
    if (map[current]) return { projectId: map[current] }
    const parent = current.substring(0, current.lastIndexOf('/'))
    if (parent === current) break
    current = parent || '/'
  }
  return null
}

/** Bind a path to a project ID. Overwrites any existing binding for that path. */
export function setProjectLink(path: string, projectId: string, projectName?: string): void {
  // Always update the legacy global map — keeps older clients in flight
  // working and gives us a fallback if the local file is later wiped by
  // a build step or git clean.
  ensureConfigDir()
  const map = getProjectMap()
  map[path] = projectId
  try {
    writeFileSync(getProjectMapPath(), JSON.stringify(map, null, 2), 'utf-8')
    logger.debug('Project link saved (global map)', { path, projectId })
  } catch (error) {
    throw new ConfigError('Failed to save project map', { error: String(error) })
  }

  // Write the per-repo file too — this is the new primary source of truth
  // and gives us the project name for free (so future "show current"
  // calls don't render "Name: unknown") plus survives directory renames.
  try {
    writeLocalProjectLink(path, projectId, projectName)
  } catch (error) {
    // Non-fatal: global map write already succeeded above. Log and move on.
    logger.warn('Failed to write .planflow/project.json (legacy map still saved)', {
      path,
      error: String(error),
    })
  }
}

/** Remove the binding for a path. No-op if absent. */
export function removeProjectLink(path: string): boolean {
  // Local file first — that's where teammates would pick up changes.
  const localRemoved = removeLocalProjectLink(path)

  const map = getProjectMap()
  const inMap = path in map
  if (!inMap && !localRemoved) return false
  if (!inMap) return true

  delete map[path]
  try {
    writeFileSync(getProjectMapPath(), JSON.stringify(map, null, 2), 'utf-8')
    logger.debug('Project link removed (global map)', { path })
    return true
  } catch (error) {
    throw new ConfigError('Failed to update project map', { error: String(error) })
  }
}

// ---------------------------------------------------------------------------
// Per-repo project link  (`.planflow/project.json`)
//
// The new primary source of truth for "this directory belongs to this
// PlanFlow project". Lives inside the repo so it can be committed and
// shared with teammates — clone the repo, the link is already there.
//
// Why a folder + JSON instead of a single `.planflow.json` at the root?
//   - Mirrors the convention of `.git/`, `.vscode/`, `.cursor/`
//   - Leaves room to grow (e.g. future `.planflow/cache/` or
//     `.planflow/project.local.json` for per-user overrides) without
//     littering the repo root.
// ---------------------------------------------------------------------------

const LOCAL_LINK_FILENAME = join('.planflow', 'project.json')

const LocalProjectLinkSchema = z.object({
  /** Schema version so we can migrate later without breaking older readers. */
  version: z.number().int().default(1),
  projectId: z.string().uuid(),
  /** Cached so `planflow_use` show-current doesn't have to hit the API. */
  projectName: z.string().optional(),
  /** ISO timestamp of when the link was created. Informational only. */
  linkedAt: z.string().optional(),
  /**
   * The API URL the link was created against. Mostly informational —
   * runtime still uses the user's global config — but lets you spot
   * staging-vs-prod mismatches by eye.
   */
  apiUrl: z.string().url().optional(),
})

export type LocalProjectLink = z.infer<typeof LocalProjectLinkSchema>

/**
 * Walk up from `startPath` looking for `.planflow/project.json`.
 * Returns the parsed link or `null` if no ancestor has one (which is
 * the common case — most cwds won't be inside a linked project).
 */
export function readLocalProjectLink(startPath: string): LocalProjectLink | null {
  let current = startPath
  // Hard cap on iterations so a malformed path can't spin us forever.
  for (let i = 0; i < 64; i++) {
    const candidate = join(current, LOCAL_LINK_FILENAME)
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, 'utf-8')
        const parsed = JSON.parse(content) as unknown
        return LocalProjectLinkSchema.parse(parsed)
      } catch (error) {
        logger.warn('Invalid .planflow/project.json — falling back to legacy map', {
          path: candidate,
          error: String(error),
        })
        return null
      }
    }
    const parent = dirname(current)
    if (parent === current) return null // hit filesystem root
    current = parent
  }
  return null
}

/**
 * Write `.planflow/project.json` inside `repoPath`. Creates the
 * `.planflow` directory if needed. The project name is optional —
 * passing it avoids the lazy "Name: unknown" lookup later.
 */
export function writeLocalProjectLink(
  repoPath: string,
  projectId: string,
  projectName?: string
): void {
  const dir = join(repoPath, '.planflow')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const link: LocalProjectLink = {
    version: 1,
    projectId,
    projectName,
    linkedAt: new Date().toISOString(),
    apiUrl: getApiUrl(),
  }

  writeFileSync(
    join(repoPath, LOCAL_LINK_FILENAME),
    JSON.stringify(link, null, 2) + '\n',
    'utf-8'
  )
  logger.debug('Local project link saved', { repoPath, projectId })
}

/**
 * Remove `.planflow/project.json` from `repoPath`. Returns `true` when
 * a file was actually deleted, `false` when none existed.
 *
 * Leaves the `.planflow/` directory in place because it may hold other
 * per-repo files in the future (cache, settings, etc.).
 */
export function removeLocalProjectLink(repoPath: string): boolean {
  const linkPath = join(repoPath, LOCAL_LINK_FILENAME)
  if (!existsSync(linkPath)) return false
  try {
    unlinkSync(linkPath)
    logger.debug('Local project link removed', { repoPath })
    return true
  } catch (error) {
    logger.warn('Failed to remove .planflow/project.json', {
      path: linkPath,
      error: String(error),
    })
    return false
  }
}
