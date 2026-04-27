/**
 * Tech Stack Detector Service (T20.6)
 * Auto-detects tech stack from package.json, tsconfig.json, and other config files.
 * Creates knowledge entries with source: 'auto_detected'.
 */

import {
  knowledgeRepository,
  type KnowledgeEntry,
} from '../repositories/knowledge.repository.js'
import { ValidationError } from './errors.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectionInput {
  /** Map of filename → file content string */
  files: Record<string, string>
}

export interface DetectedItem {
  /** Knowledge entry title */
  title: string
  /** Knowledge entry content (human-readable description) */
  content: string
  /** Knowledge type: dependency, architecture, environment */
  type: 'dependency' | 'architecture' | 'environment'
  /** Tags for filtering */
  tags: string[]
  /** Structured metadata */
  metadata: {
    sourceFile: string
    confidence: number
    detectedAt: string
    [key: string]: unknown
  }
}

export interface DetectionResult {
  /** Created or updated knowledge entries */
  entries: KnowledgeEntry[]
  /** Summary of what was detected */
  summary: {
    filesAnalyzed: string[]
    totalDetections: number
    created: number
    updated: number
    categories: Record<string, number>
  }
}

// ─── Detection Helpers ───────────────────────────────────────────────────────

/** Well-known framework/library categories */
const FRAMEWORK_MAP: Record<string, { category: string; label: string }> = {
  // Frontend frameworks
  'react': { category: 'frontend', label: 'React' },
  'react-dom': { category: 'frontend', label: 'React DOM' },
  'next': { category: 'frontend', label: 'Next.js' },
  'vue': { category: 'frontend', label: 'Vue.js' },
  'nuxt': { category: 'frontend', label: 'Nuxt' },
  'svelte': { category: 'frontend', label: 'Svelte' },
  '@sveltejs/kit': { category: 'frontend', label: 'SvelteKit' },
  'angular': { category: 'frontend', label: 'Angular' },
  '@angular/core': { category: 'frontend', label: 'Angular' },
  'solid-js': { category: 'frontend', label: 'Solid.js' },
  'astro': { category: 'frontend', label: 'Astro' },
  'remix': { category: 'frontend', label: 'Remix' },
  '@remix-run/react': { category: 'frontend', label: 'Remix' },

  // Backend frameworks
  'express': { category: 'backend', label: 'Express' },
  'hono': { category: 'backend', label: 'Hono' },
  'fastify': { category: 'backend', label: 'Fastify' },
  'koa': { category: 'backend', label: 'Koa' },
  'nestjs': { category: 'backend', label: 'NestJS' },
  '@nestjs/core': { category: 'backend', label: 'NestJS' },
  'elysia': { category: 'backend', label: 'Elysia' },

  // ORMs & Database
  'drizzle-orm': { category: 'database', label: 'Drizzle ORM' },
  'prisma': { category: 'database', label: 'Prisma' },
  '@prisma/client': { category: 'database', label: 'Prisma' },
  'typeorm': { category: 'database', label: 'TypeORM' },
  'sequelize': { category: 'database', label: 'Sequelize' },
  'mongoose': { category: 'database', label: 'Mongoose' },
  'pg': { category: 'database', label: 'PostgreSQL (node-postgres)' },
  'mysql2': { category: 'database', label: 'MySQL' },
  'better-sqlite3': { category: 'database', label: 'SQLite' },
  '@neondatabase/serverless': { category: 'database', label: 'Neon (serverless PostgreSQL)' },
  'ioredis': { category: 'database', label: 'Redis (ioredis)' },
  'redis': { category: 'database', label: 'Redis' },

  // State management
  'zustand': { category: 'state', label: 'Zustand' },
  'redux': { category: 'state', label: 'Redux' },
  '@reduxjs/toolkit': { category: 'state', label: 'Redux Toolkit' },
  'jotai': { category: 'state', label: 'Jotai' },
  'recoil': { category: 'state', label: 'Recoil' },
  'mobx': { category: 'state', label: 'MobX' },
  '@tanstack/react-query': { category: 'data-fetching', label: 'TanStack Query' },
  'swr': { category: 'data-fetching', label: 'SWR' },

  // Styling
  'tailwindcss': { category: 'styling', label: 'Tailwind CSS' },
  'styled-components': { category: 'styling', label: 'Styled Components' },
  '@emotion/react': { category: 'styling', label: 'Emotion' },
  'sass': { category: 'styling', label: 'Sass' },

  // Testing
  'vitest': { category: 'testing', label: 'Vitest' },
  'jest': { category: 'testing', label: 'Jest' },
  'playwright': { category: 'testing', label: 'Playwright' },
  '@playwright/test': { category: 'testing', label: 'Playwright' },
  'cypress': { category: 'testing', label: 'Cypress' },

  // Build tools
  'vite': { category: 'build', label: 'Vite' },
  'webpack': { category: 'build', label: 'Webpack' },
  'esbuild': { category: 'build', label: 'esbuild' },
  'tsup': { category: 'build', label: 'tsup' },
  'turbo': { category: 'build', label: 'Turborepo' },
  'rollup': { category: 'build', label: 'Rollup' },

  // Validation
  'zod': { category: 'validation', label: 'Zod' },
  'yup': { category: 'validation', label: 'Yup' },
  'joi': { category: 'validation', label: 'Joi' },
  'ajv': { category: 'validation', label: 'AJV' },

  // Auth
  'better-auth': { category: 'auth', label: 'Better Auth' },
  'lucia': { category: 'auth', label: 'Lucia Auth' },
  'next-auth': { category: 'auth', label: 'NextAuth.js' },
  'passport': { category: 'auth', label: 'Passport.js' },
  'jsonwebtoken': { category: 'auth', label: 'JWT (jsonwebtoken)' },

  // Monitoring/Logging
  '@sentry/node': { category: 'monitoring', label: 'Sentry' },
  'pino': { category: 'logging', label: 'Pino' },
  'winston': { category: 'logging', label: 'Winston' },

  // API/Protocol
  '@modelcontextprotocol/sdk': { category: 'protocol', label: 'MCP SDK' },
  'socket.io': { category: 'realtime', label: 'Socket.IO' },
  'ws': { category: 'realtime', label: 'WebSocket (ws)' },
  'graphql': { category: 'api', label: 'GraphQL' },
  'trpc': { category: 'api', label: 'tRPC' },
  '@trpc/server': { category: 'api', label: 'tRPC' },

  // Payments
  '@lemonsqueezy/lemonsqueezy.js': { category: 'payments', label: 'LemonSqueezy' },
  'stripe': { category: 'payments', label: 'Stripe' },

  // Email
  'resend': { category: 'email', label: 'Resend' },
  'nodemailer': { category: 'email', label: 'Nodemailer' },

  // AI/ML
  '@anthropic-ai/sdk': { category: 'ai', label: 'Anthropic SDK' },
  'openai': { category: 'ai', label: 'OpenAI SDK' },
  'langchain': { category: 'ai', label: 'LangChain' },
  '@langchain/core': { category: 'ai', label: 'LangChain' },

  // Deployment
  '@vercel/node': { category: 'deployment', label: 'Vercel' },
  'wrangler': { category: 'deployment', label: 'Cloudflare Workers' },
}

/** Detect runtime environment from package.json */
function detectRuntime(pkg: any): { runtime: string; version?: string } {
  if (pkg.engines?.bun) return { runtime: 'Bun', version: pkg.engines.bun }
  if (pkg.engines?.deno) return { runtime: 'Deno', version: pkg.engines.deno }
  return { runtime: 'Node.js', version: pkg.engines?.node }
}

/** Detect package manager from metadata */
function detectPackageManager(pkg: any): string | null {
  if (pkg.packageManager) {
    const pm = pkg.packageManager.split('@')[0]
    if (pm === 'pnpm') return 'pnpm'
    if (pm === 'yarn') return 'Yarn'
    if (pm === 'bun') return 'Bun'
    return pm
  }
  return null
}

/** Detect if monorepo */
function detectMonorepo(pkg: any): { isMonorepo: boolean; tool?: string } {
  if (pkg.workspaces) return { isMonorepo: true, tool: 'workspaces' }
  // Turborepo detected via turbo dep
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  if (allDeps['turbo']) return { isMonorepo: true, tool: 'Turborepo' }
  if (allDeps['lerna']) return { isMonorepo: true, tool: 'Lerna' }
  if (allDeps['nx']) return { isMonorepo: true, tool: 'Nx' }
  return { isMonorepo: false }
}

// ─── Main Service ────────────────────────────────────────────────────────────

export class TechStackDetectorService {
  /**
   * Run full tech stack detection from provided file contents.
   * Creates/updates knowledge entries in the project.
   */
  async detect(
    projectId: string,
    userId: string | null,
    input: DetectionInput
  ): Promise<DetectionResult> {
    if (!input.files || Object.keys(input.files).length === 0) {
      throw new ValidationError('At least one file must be provided for detection')
    }

    const detections: DetectedItem[] = []
    const filesAnalyzed: string[] = []

    // Analyze each provided file
    for (const [filename, content] of Object.entries(input.files)) {
      if (!content || typeof content !== 'string') continue

      const normalizedName = filename.split('/').pop() ?? filename

      try {
        if (normalizedName === 'package.json') {
          detections.push(...this.detectFromPackageJson(content, filename))
          filesAnalyzed.push(filename)
        } else if (normalizedName === 'tsconfig.json' || normalizedName.startsWith('tsconfig.')) {
          detections.push(...this.detectFromTsConfig(content, filename))
          filesAnalyzed.push(filename)
        } else if (normalizedName === 'pyproject.toml' || normalizedName === 'requirements.txt') {
          // Future: Python detection
          filesAnalyzed.push(filename)
        } else if (normalizedName === 'go.mod') {
          // Future: Go detection
          filesAnalyzed.push(filename)
        } else if (normalizedName === 'Cargo.toml') {
          // Future: Rust detection
          filesAnalyzed.push(filename)
        }
      } catch {
        // Skip files that fail to parse — don't block detection for others
      }
    }

    if (detections.length === 0) {
      return {
        entries: [],
        summary: {
          filesAnalyzed,
          totalDetections: 0,
          created: 0,
          updated: 0,
          categories: {},
        },
      }
    }

    // Save detections to knowledge base (with deduplication)
    const { entries, created, updated } = await this.saveDetections(
      projectId,
      userId,
      detections
    )

    // Count by category
    const categories: Record<string, number> = {}
    for (const d of detections) {
      for (const tag of d.tags) {
        categories[tag] = (categories[tag] ?? 0) + 1
      }
    }

    return {
      entries,
      summary: {
        filesAnalyzed,
        totalDetections: detections.length,
        created,
        updated,
        categories,
      },
    }
  }

  /**
   * Detect tech stack from package.json content
   */
  detectFromPackageJson(content: string, filename: string): DetectedItem[] {
    const pkg = JSON.parse(content)
    const detections: DetectedItem[] = []
    const now = new Date().toISOString()

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const prodDeps = pkg.dependencies ?? {}
    const devDeps = pkg.devDependencies ?? {}

    // 1. Runtime environment
    const runtime = detectRuntime(pkg)
    detections.push({
      title: `Runtime: ${runtime.runtime}`,
      content: `Project uses ${runtime.runtime}${runtime.version ? ` (${runtime.version})` : ''} as the runtime environment.`,
      type: 'environment',
      tags: ['runtime', runtime.runtime.toLowerCase()],
      metadata: {
        sourceFile: filename,
        confidence: 0.95,
        detectedAt: now,
        runtime: runtime.runtime,
        runtimeVersion: runtime.version ?? null,
      },
    })

    // 2. Package manager
    const pm = detectPackageManager(pkg)
    if (pm) {
      detections.push({
        title: `Package Manager: ${pm}`,
        content: `Project uses ${pm} for dependency management.${pkg.packageManager ? ` (specified: ${pkg.packageManager})` : ''}`,
        type: 'environment',
        tags: ['package-manager', pm.toLowerCase()],
        metadata: {
          sourceFile: filename,
          confidence: 0.99,
          detectedAt: now,
          packageManager: pm,
          packageManagerSpec: pkg.packageManager ?? null,
        },
      })
    }

    // 3. Monorepo
    const mono = detectMonorepo(pkg)
    if (mono.isMonorepo) {
      const workspaceList = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces?.packages ?? []

      detections.push({
        title: `Monorepo: ${mono.tool}`,
        content: `Project is a monorepo using ${mono.tool}.${workspaceList.length > 0 ? ` Workspaces: ${workspaceList.join(', ')}` : ''}`,
        type: 'architecture',
        tags: ['monorepo', mono.tool!.toLowerCase()],
        metadata: {
          sourceFile: filename,
          confidence: 0.95,
          detectedAt: now,
          monorepoTool: mono.tool,
          workspaces: workspaceList,
        },
      })
    }

    // 4. Detect known frameworks and libraries
    const detectedByCategory = new Map<string, Array<{ name: string; label: string; version: string; isDev: boolean }>>()

    for (const [depName, depInfo] of Object.entries(FRAMEWORK_MAP)) {
      const version = allDeps[depName]
      if (!version) continue

      const isDev = !!devDeps[depName] && !prodDeps[depName]
      const items = detectedByCategory.get(depInfo.category) ?? []
      items.push({ name: depName, label: depInfo.label, version: version as string, isDev })
      detectedByCategory.set(depInfo.category, items)
    }

    // Group detections by category for cleaner knowledge entries
    for (const [category, items] of detectedByCategory.entries()) {
      // Deduplicate labels (e.g., @prisma/client and prisma → "Prisma")
      const uniqueLabels = [...new Set(items.map(i => i.label))]
      const labelList = uniqueLabels.join(', ')
      const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)

      const lines = items.map(
        (i) => `- ${i.label} (${i.name}@${i.version})${i.isDev ? ' [dev]' : ''}`
      )

      detections.push({
        title: `${categoryTitle}: ${labelList}`,
        content: `Detected ${category} stack:\n${lines.join('\n')}`,
        type: category === 'build' || category === 'deployment' ? 'environment' : 'dependency',
        tags: [category, ...uniqueLabels.map((l) => l.toLowerCase().replace(/[.\s]/g, '-'))],
        metadata: {
          sourceFile: filename,
          confidence: 0.95,
          detectedAt: now,
          category,
          packages: items.map((i) => ({
            name: i.name,
            label: i.label,
            version: i.version,
            isDev: i.isDev,
          })),
        },
      })
    }

    // 5. Scripts analysis (detect tooling patterns)
    if (pkg.scripts) {
      const scripts = pkg.scripts as Record<string, string>
      const scriptHints: string[] = []
      const keyScripts = ['dev', 'build', 'test', 'lint', 'start'] as const

      for (const key of keyScripts) {
        const val = scripts[key]
        if (val) scriptHints.push(`${key}: \`${val}\``)
      }

      if (scriptHints.length > 0) {
        detections.push({
          title: 'Project Scripts',
          content: `Key npm scripts:\n${scriptHints.map((s) => `- ${s}`).join('\n')}`,
          type: 'environment',
          tags: ['scripts', 'tooling'],
          metadata: {
            sourceFile: filename,
            confidence: 0.9,
            detectedAt: now,
            scripts: Object.fromEntries(
              Object.entries(scripts).filter(([k]) =>
                ['dev', 'build', 'test', 'lint', 'start', 'typecheck', 'format'].includes(k)
              )
            ),
          },
        })
      }
    }

    return detections
  }

  /**
   * Detect TypeScript configuration from tsconfig.json content
   */
  detectFromTsConfig(content: string, filename: string): DetectedItem[] {
    const tsconfig = JSON.parse(content)
    const now = new Date().toISOString()
    const detections: DetectedItem[] = []

    const co = tsconfig.compilerOptions ?? {}

    const highlights: string[] = []

    if (co.target) highlights.push(`Target: ${co.target}`)
    if (co.module) highlights.push(`Module: ${co.module}`)
    if (co.moduleResolution) highlights.push(`Resolution: ${co.moduleResolution}`)
    if (co.jsx) highlights.push(`JSX: ${co.jsx}`)
    if (co.strict !== undefined) highlights.push(`Strict: ${co.strict}`)
    if (co.paths) highlights.push(`Path aliases: ${Object.keys(co.paths).join(', ')}`)

    if (highlights.length > 0) {
      detections.push({
        title: 'TypeScript Configuration',
        content: `TypeScript compiler options:\n${highlights.map((h) => `- ${h}`).join('\n')}`,
        type: 'environment',
        tags: ['typescript', 'compiler'],
        metadata: {
          sourceFile: filename,
          confidence: 0.99,
          detectedAt: now,
          target: co.target ?? null,
          module: co.module ?? null,
          moduleResolution: co.moduleResolution ?? null,
          jsx: co.jsx ?? null,
          strict: co.strict ?? null,
          paths: co.paths ?? null,
          baseUrl: co.baseUrl ?? null,
        },
      })
    }

    return detections
  }

  /**
   * Save detected items to knowledge base.
   * Deduplicates by matching title + source='auto_detected' for the project.
   */
  private async saveDetections(
    projectId: string,
    userId: string | null,
    detections: DetectedItem[]
  ): Promise<{ entries: KnowledgeEntry[]; created: number; updated: number }> {
    // Fetch existing auto-detected entries for this project
    const existing = await knowledgeRepository.findByProject({
      projectId,
      source: 'auto_detected',
      limit: 200,
      offset: 0,
    })

    const existingByTitle = new Map<string, KnowledgeEntry>()
    for (const entry of existing.data) {
      existingByTitle.set(entry.title, entry)
    }

    const entries: KnowledgeEntry[] = []
    let created = 0
    let updated = 0

    for (const detection of detections) {
      const match = existingByTitle.get(detection.title)

      if (match) {
        // Update existing entry
        const updatedEntry = await knowledgeRepository.update(match.id, {
          content: detection.content,
          type: detection.type,
          tags: detection.tags,
          metadata: detection.metadata,
          updatedBy: userId,
        })
        if (updatedEntry) {
          entries.push(updatedEntry)
          updated++
        }
      } else {
        // Create new entry
        const newEntry = await knowledgeRepository.create({
          projectId,
          title: detection.title,
          content: detection.content,
          type: detection.type,
          source: 'auto_detected',
          tags: detection.tags,
          metadata: detection.metadata,
          createdBy: userId,
        })
        entries.push(newEntry)
        created++
      }
    }

    return { entries, created, updated }
  }
}

// Export singleton
export const techStackDetectorService = new TechStackDetectorService()
