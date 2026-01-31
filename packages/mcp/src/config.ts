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
 * Clear stored credentials (logout)
 */
export function clearCredentials(): void {
  const config = loadConfig()
  saveConfig({
    ...config,
    apiToken: undefined,
    userId: undefined,
    userEmail: undefined,
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
