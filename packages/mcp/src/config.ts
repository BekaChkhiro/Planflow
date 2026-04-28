/**
 * PlanFlow MCP Server - Configuration Management
 *
 * Handles loading and saving configuration including API tokens.
 * Configuration is stored in the user's home directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
 * Look up a project ID for a specific path. Tries exact match first; if no
 * exact match exists, walks parents (so e.g. running from a subdirectory of
 * a linked repo still resolves correctly).
 */
export function lookupProjectByPath(path: string): string | null {
  const map = getProjectMap()
  if (map[path]) return map[path]

  // Walk up parents — useful when the user is in src/, packages/foo/, etc.
  let current = path
  while (current !== '/' && current !== '.') {
    if (map[current]) return map[current]
    const parent = current.substring(0, current.lastIndexOf('/'))
    if (parent === current) break
    current = parent || '/'
  }
  return null
}

/** Bind a path to a project ID. Overwrites any existing binding for that path. */
export function setProjectLink(path: string, projectId: string): void {
  ensureConfigDir()
  const map = getProjectMap()
  map[path] = projectId
  try {
    writeFileSync(getProjectMapPath(), JSON.stringify(map, null, 2), 'utf-8')
    logger.debug('Project link saved', { path, projectId })
  } catch (error) {
    throw new ConfigError('Failed to save project map', { error: String(error) })
  }
}

/** Remove the binding for a path. No-op if absent. */
export function removeProjectLink(path: string): boolean {
  const map = getProjectMap()
  if (!(path in map)) return false
  delete map[path]
  try {
    writeFileSync(getProjectMapPath(), JSON.stringify(map, null, 2), 'utf-8')
    logger.debug('Project link removed', { path })
    return true
  } catch (error) {
    throw new ConfigError('Failed to update project map', { error: String(error) })
  }
}
