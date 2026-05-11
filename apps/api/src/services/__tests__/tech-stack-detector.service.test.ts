/**
 * Tech Stack Detector Service Unit Tests (T20.6)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { repoMocks } = vi.hoisted(() => ({
  repoMocks: {
    findByProject: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('../../repositories/knowledge.repository.js', () => ({
  knowledgeRepository: repoMocks,
}))

import { TechStackDetectorService } from '../tech-stack-detector.service.js'
import { ValidationError } from '../errors.js'

const PROJECT_ID = 'proj-1'

describe('TechStackDetector — detectFromPackageJson', () => {
  const svc = new TechStackDetectorService()

  it('detects runtime: Node.js by default', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({ name: 'x', engines: { node: '>=20' } }),
      'package.json'
    )
    const runtime = detections.find((d) => d.title.startsWith('Runtime'))
    expect(runtime).toBeDefined()
    expect(runtime!.title).toContain('Node.js')
    expect(runtime!.metadata.runtime).toBe('Node.js')
    expect(runtime!.metadata.runtimeVersion).toBe('>=20')
  })

  it('detects Bun runtime from engines.bun', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({ name: 'x', engines: { bun: '>=1.0' } }),
      'package.json'
    )
    expect(detections.find((d) => d.title.includes('Bun'))).toBeDefined()
  })

  it('detects package manager from packageManager field', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({ name: 'x', packageManager: 'pnpm@9.15.0' }),
      'package.json'
    )
    const pm = detections.find((d) => d.title.startsWith('Package Manager'))
    expect(pm).toBeDefined()
    expect(pm!.metadata.packageManager).toBe('pnpm')
  })

  it('detects monorepo via workspaces array', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({ name: 'x', workspaces: ['apps/*', 'packages/*'] }),
      'package.json'
    )
    const mono = detections.find((d) => d.title.startsWith('Monorepo'))
    expect(mono).toBeDefined()
    expect(mono!.metadata.workspaces).toEqual(['apps/*', 'packages/*'])
  })

  it('detects monorepo via Turborepo dependency', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({
        name: 'x',
        devDependencies: { turbo: '^2.0.0' },
      }),
      'package.json'
    )
    const mono = detections.find((d) => d.title.includes('Turborepo'))
    expect(mono).toBeDefined()
  })

  it('groups framework detections by category', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({
        name: 'x',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        devDependencies: { vitest: '^2.0.0' },
      }),
      'package.json'
    )

    const frontend = detections.find((d) => d.title.startsWith('Frontend'))
    expect(frontend).toBeDefined()
    expect(frontend!.metadata.category).toBe('frontend')

    const testing = detections.find((d) => d.title.startsWith('Testing'))
    expect(testing).toBeDefined()
    expect(testing!.tags).toContain('testing')
  })

  it('marks devDependencies-only packages as [dev]', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({
        name: 'x',
        devDependencies: { vitest: '^2.0.0' },
      }),
      'package.json'
    )
    const testing = detections.find((d) => d.title.startsWith('Testing'))
    expect(testing!.content).toContain('[dev]')
  })

  it('emits Project Scripts when scripts present', () => {
    const detections = svc.detectFromPackageJson(
      JSON.stringify({
        name: 'x',
        scripts: { dev: 'vite', build: 'vite build', test: 'vitest' },
      }),
      'package.json'
    )
    const scripts = detections.find((d) => d.title === 'Project Scripts')
    expect(scripts).toBeDefined()
    expect(scripts!.content).toContain('dev')
    expect(scripts!.content).toContain('test')
  })

  it('returns empty (no scripts entry) when no scripts present', () => {
    const detections = svc.detectFromPackageJson(JSON.stringify({ name: 'x' }), 'package.json')
    expect(detections.find((d) => d.title === 'Project Scripts')).toBeUndefined()
  })
})

describe('TechStackDetector — detectFromTsConfig', () => {
  const svc = new TechStackDetectorService()

  it('extracts compilerOptions highlights', () => {
    const detections = svc.detectFromTsConfig(
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          strict: true,
          jsx: 'react-jsx',
          paths: { '@/*': ['./src/*'] },
        },
      }),
      'tsconfig.json'
    )
    expect(detections).toHaveLength(1)
    const ts = detections[0]
    expect(ts.title).toBe('TypeScript Configuration')
    expect(ts.metadata.target).toBe('ES2022')
    expect(ts.metadata.strict).toBe(true)
    expect(ts.metadata.paths).toEqual({ '@/*': ['./src/*'] })
  })

  it('returns nothing when compilerOptions is empty', () => {
    const detections = svc.detectFromTsConfig(JSON.stringify({}), 'tsconfig.json')
    expect(detections).toHaveLength(0)
  })
})

describe('TechStackDetector — detect (integration)', () => {
  let svc: TechStackDetectorService

  beforeEach(() => {
    svc = new TechStackDetectorService()
    repoMocks.findByProject.mockResolvedValue({ data: [], total: 0 })
    repoMocks.create.mockImplementation((input) =>
      Promise.resolve({
        id: `k-${Math.random()}`,
        ...input,
        tags: input.tags ?? null,
        metadata: input.metadata ?? null,
        createdBy: input.createdBy ?? null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    )
    repoMocks.update.mockImplementation((id, updates) =>
      Promise.resolve({
        id,
        projectId: PROJECT_ID,
        title: 'X',
        content: 'Y',
        type: 'dependency',
        source: 'auto_detected',
        ...updates,
        tags: updates.tags ?? null,
        metadata: updates.metadata ?? null,
        createdBy: null,
        updatedBy: updates.updatedBy ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    )
  })

  it('rejects empty files input', async () => {
    await expect(svc.detect(PROJECT_ID, null, { files: {} })).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it('creates new entries on first run', async () => {
    const result = await svc.detect(PROJECT_ID, 'user-1', {
      files: {
        'package.json': JSON.stringify({
          name: 'x',
          dependencies: { react: '^18.0.0' },
          devDependencies: { vitest: '^2.0.0' },
        }),
      },
    })
    expect(result.summary.created).toBeGreaterThan(0)
    expect(result.summary.updated).toBe(0)
    expect(result.summary.filesAnalyzed).toContain('package.json')
    expect(repoMocks.create).toHaveBeenCalled()
    expect(repoMocks.update).not.toHaveBeenCalled()
  })

  it('updates existing entries on repeated runs (dedup by title)', async () => {
    repoMocks.findByProject.mockResolvedValue({
      data: [
        {
          id: 'existing-1',
          projectId: PROJECT_ID,
          title: 'Runtime: Node.js',
          content: 'old',
          type: 'environment',
          source: 'auto_detected',
          tags: ['runtime', 'node.js'],
          metadata: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
    })

    const result = await svc.detect(PROJECT_ID, null, {
      files: {
        'package.json': JSON.stringify({ name: 'x', engines: { node: '>=20' } }),
      },
    })

    expect(result.summary.updated).toBe(1)
    expect(repoMocks.update).toHaveBeenCalledWith(
      'existing-1',
      expect.objectContaining({ updatedBy: null })
    )
  })

  it('skips files with unparseable JSON without aborting', async () => {
    const result = await svc.detect(PROJECT_ID, null, {
      files: {
        'package.json': '{ not valid json',
        'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022' } }),
      },
    })
    // tsconfig still produces something
    expect(result.summary.totalDetections).toBeGreaterThan(0)
    expect(result.summary.filesAnalyzed).toContain('tsconfig.json')
  })

  it('ignores non-recognised filenames', async () => {
    const result = await svc.detect(PROJECT_ID, null, {
      files: { 'README.md': '# hi' },
    })
    expect(result.summary.totalDetections).toBe(0)
    expect(result.summary.created).toBe(0)
    expect(result.entries).toEqual([])
  })

  it('counts categories from detection tags', async () => {
    const result = await svc.detect(PROJECT_ID, null, {
      files: {
        'package.json': JSON.stringify({
          name: 'x',
          dependencies: { react: '^18.0.0', hono: '^4.0.0' },
        }),
      },
    })
    expect(result.summary.categories['frontend']).toBeGreaterThanOrEqual(1)
    expect(result.summary.categories['backend']).toBeGreaterThanOrEqual(1)
  })
})
