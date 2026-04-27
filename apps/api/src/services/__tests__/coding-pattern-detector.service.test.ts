/**
 * Tests for Coding Pattern Detector Service (T20.7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getFolderNames,
  countMatchingFiles,
  detectArchitecture,
  detectNamingConventions,
  detectTestPatterns,
  detectApiVersioning,
  CodingPatternDetectorService,
} from '../coding-pattern-detector.service.js'

// Mock the knowledge repository
vi.mock('../../repositories/knowledge.repository.js', () => ({
  knowledgeRepository: {
    findByProject: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: 'test-id',
        ...input,
        tags: input.tags ?? null,
        metadata: input.metadata ?? null,
        createdBy: input.createdBy ?? null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ),
    update: vi.fn().mockImplementation((id, updates) =>
      Promise.resolve({
        id,
        projectId: 'test-project',
        ...updates,
        tags: updates.tags ?? null,
        metadata: updates.metadata ?? null,
        createdBy: null,
        updatedBy: updates.updatedBy ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ),
  },
}))

describe('Coding Pattern Detector — Utilities', () => {
  it('getFolderNames extracts all intermediate folders', () => {
    const paths = ['src/routes/auth.ts', 'src/services/user.ts', 'src/db/schema.ts']
    const folders = getFolderNames(paths)
    expect(folders.has('src')).toBe(true)
    expect(folders.has('routes')).toBe(true)
    expect(folders.has('services')).toBe(true)
    expect(folders.has('db')).toBe(true)
    expect(folders.has('auth.ts')).toBe(false)
  })

  it('countMatchingFiles matches glob patterns', () => {
    const paths = [
      'src/routes/auth.routes.ts',
      'src/routes/user.routes.ts',
      'src/services/auth.service.ts',
      'src/repositories/user.repository.ts',
    ]
    expect(countMatchingFiles(paths, '*.repository.ts')).toBe(1)
    expect(countMatchingFiles(paths, 'src/routes/*.ts')).toBe(2)
    expect(countMatchingFiles(paths, 'src/**/*.ts')).toBe(4)
  })
})

describe('Coding Pattern Detector — Architecture Detection', () => {
  it('detects Layered Architecture (routes + services + repositories)', () => {
    const paths = [
      'src/routes/auth.routes.ts',
      'src/routes/user.routes.ts',
      'src/services/auth.service.ts',
      'src/services/user.service.ts',
      'src/repositories/user.repository.ts',
      'src/middleware/auth.ts',
      'src/db/schema.ts',
    ]
    const detections = detectArchitecture(paths)
    const layered = detections.find((d) => d.title.includes('Layered'))
    expect(layered).toBeDefined()
    expect(layered!.metadata.confidence).toBeGreaterThanOrEqual(0.9)
    expect(layered!.tags).toContain('layered')
  })

  it('detects Monorepo (apps + packages)', () => {
    const paths = [
      'apps/api/src/index.ts',
      'apps/web/src/app/page.tsx',
      'packages/shared/src/types.ts',
      'packages/mcp/src/index.ts',
    ]
    const detections = detectArchitecture(paths)
    const monorepo = detections.find((d) => d.title.includes('Monorepo'))
    expect(monorepo).toBeDefined()
    expect(monorepo!.metadata.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('detects Repository Pattern', () => {
    const paths = [
      'src/repositories/user.repository.ts',
      'src/repositories/project.repository.ts',
    ]
    const detections = detectArchitecture(paths)
    const repo = detections.find((d) => d.title.includes('Repository Pattern'))
    expect(repo).toBeDefined()
    expect(repo!.metadata.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('does NOT detect Microservices without sub-package.json', () => {
    const paths = [
      'src/services/auth.service.ts',
      'src/services/user.service.ts',
    ]
    const detections = detectArchitecture(paths)
    const micro = detections.find((d) => d.title.includes('Microservices'))
    expect(micro).toBeUndefined()
  })

  it('does NOT detect false positives with random folders', () => {
    const paths = ['src/utils/helpers.ts', 'src/lib/logger.ts']
    const detections = detectArchitecture(paths)
    expect(detections.length).toBe(0)
  })
})

describe('Coding Pattern Detector — Naming Conventions', () => {
  it('detects kebab-case as primary', () => {
    const paths = [
      'src/routes/auth.routes.ts',
      'src/routes/user.routes.ts',
      'src/services/auth.service.ts',
      'src/utils/helpers.ts',
      'src/lib/logger.ts',
    ]
    const detections = detectNamingConventions(paths)
    expect(detections.length).toBe(1)
    expect(detections[0].title).toContain('kebab-case')
    expect(detections[0].metadata.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('detects camelCase as primary', () => {
    const paths = [
      'src/authService.ts',
      'src/userService.ts',
      'src/helperUtils.ts',
      'src/mainApp.ts',
    ]
    const detections = detectNamingConventions(paths)
    expect(detections[0].title).toContain('camelCase')
  })

  it('detects snake_case as primary', () => {
    const paths = [
      'src/auth_service.py',
      'src/user_service.py',
      'src/helper_utils.py',
    ]
    const detections = detectNamingConventions(paths)
    expect(detections[0].title).toContain('snake_case')
  })
})

describe('Coding Pattern Detector — Test Patterns', () => {
  it('detects *.test.ts pattern', () => {
    const paths = [
      'src/services/auth.service.ts',
      'src/services/auth.test.ts',
      'src/services/user.test.ts',
    ]
    const detections = detectTestPatterns(paths)
    expect(detections.length).toBe(1)
    expect(detections[0].title).toContain('Test Organization')
    expect(detections[0].metadata.testFileCount).toBe(2)
  })

  it('detects __tests__ folder pattern', () => {
    const paths = [
      'src/services/auth.service.ts',
      'src/services/__tests__/auth.test.ts',
    ]
    const detections = detectTestPatterns(paths)
    expect(detections.length).toBe(1)
    expect(detections[0].metadata.patterns).toContain('__tests__/ folder')
  })
})

describe('Coding Pattern Detector — API Versioning', () => {
  it('detects v1/ route versioning', () => {
    const paths = [
      'src/routes/v1/auth.ts',
      'src/routes/v1/users.ts',
      'src/routes/v2/auth.ts',
    ]
    const detections = detectApiVersioning(paths)
    expect(detections.length).toBe(1)
    expect(detections[0].title).toContain('API Versioning')
  })

  it('does not detect without versioned paths', () => {
    const paths = ['src/routes/auth.ts', 'src/routes/users.ts']
    const detections = detectApiVersioning(paths)
    expect(detections.length).toBe(0)
  })
})

describe('Coding Pattern Detector Service — Integration', () => {
  let service: CodingPatternDetectorService

  beforeEach(() => {
    service = new CodingPatternDetectorService()
  })

  it('runs full detection on a realistic project structure', async () => {
    const paths = [
      'apps/api/src/routes/auth.routes.ts',
      'apps/api/src/routes/user.routes.ts',
      'apps/api/src/services/auth.service.ts',
      'apps/api/src/services/user.service.ts',
      'apps/api/src/repositories/user.repository.ts',
      'apps/api/src/middleware/auth.ts',
      'apps/api/src/db/schema.ts',
      'apps/web/src/app/page.tsx',
      'apps/web/src/components/ui/button.tsx',
      'packages/shared/src/types.ts',
      'packages/mcp/src/index.ts',
    ]

    const result = await service.detect('test-project', null, { paths })

    expect(result.summary.pathsAnalyzed).toBe(11)
    expect(result.summary.totalDetections).toBeGreaterThanOrEqual(3)
    expect(result.summary.created).toBeGreaterThanOrEqual(3)

    // Should detect Layered + Monorepo + Naming
    const titles = result.entries.map((e) => e.title)
    expect(titles.some((t) => t.includes('Layered'))).toBe(true)
    expect(titles.some((t) => t.includes('Monorepo'))).toBe(true)
    expect(titles.some((t) => t.includes('Naming Convention'))).toBe(true)
  })

  it('throws on empty paths', async () => {
    await expect(service.detect('test-project', null, { paths: [] })).rejects.toThrow(
      'At least one file path must be provided'
    )
  })
})
