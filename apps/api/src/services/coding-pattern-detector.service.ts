/**
 * Coding Pattern Detector Service (T20.7)
 * Auto-detects architectural patterns and coding conventions from folder structure.
 * Creates knowledge entries with source: 'auto_detected', type: 'pattern' | 'convention'.
 */

import {
  knowledgeRepository,
  type KnowledgeEntry,
} from '../repositories/knowledge.repository.js'
import { ValidationError } from './errors.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PatternDetectionInput {
  /** List of relative file paths from project root */
  paths: string[]
}

export interface DetectedPattern {
  title: string
  content: string
  type: 'pattern' | 'convention'
  tags: string[]
  metadata: {
    source: 'folder_structure'
    confidence: number
    detectedAt: string
    evidence: string[]
    [key: string]: unknown
  }
}

export interface PatternDetectionResult {
  entries: KnowledgeEntry[]
  summary: {
    pathsAnalyzed: number
    totalDetections: number
    created: number
    updated: number
    categories: Record<string, number>
  }
}

// ─── Pattern Definitions ─────────────────────────────────────────────────────

interface ArchitecturePattern {
  name: string
  description: string
  requiredFolders: string[]
  optionalFolders?: string[]
  filePatterns?: string[]
  tags: string[]
}

const ARCHITECTURE_PATTERNS: ArchitecturePattern[] = [
  {
    name: 'Layered Architecture (API)',
    description:
      'Code is organized into horizontal layers: routes/controllers handle HTTP, services contain business logic, and repositories/data access handle persistence. Each layer only depends on the one below it.',
    requiredFolders: ['routes', 'services', 'repositories'],
    optionalFolders: ['middleware', 'utils', 'db', 'lib'],
    tags: ['layered', 'api', 'backend'],
  },
  {
    name: 'MVC (Model-View-Controller)',
    description:
      'Classic MVC pattern: controllers handle requests, models define data structures and logic, views render UI.',
    requiredFolders: ['controllers', 'models', 'views'],
    optionalFolders: ['routes', 'middleware'],
    tags: ['mvc', 'backend', 'frontend'],
  },
  {
    name: 'Clean / Hexagonal Architecture',
    description:
      'Domain-driven design with clear separation: domain/ contains core business logic, application/ contains use cases, infrastructure/ contains external concerns (DB, HTTP, etc.).',
    requiredFolders: ['domain', 'application', 'infrastructure'],
    optionalFolders: ['interfaces', 'shared'],
    tags: ['clean-architecture', 'hexagonal', 'ddd'],
  },
  {
    name: 'Feature-Based Organization',
    description:
      'Code is organized by feature/domain rather than by technical layer. Each feature folder contains its own components, services, and state.',
    requiredFolders: ['features'],
    optionalFolders: ['modules'],
    tags: ['feature-based', 'modular', 'scalable'],
  },
  {
    name: 'Repository Pattern',
    description:
      'Data access is abstracted behind repository interfaces. Typically seen with files named *.repository.ts or a dedicated repositories/ folder.',
    requiredFolders: ['repositories'],
    filePatterns: ['*.repository.ts', '*.repository.js', '*.repository.go'],
    tags: ['repository', 'data-access', 'abstraction'],
  },
  {
    name: 'Monorepo (Turborepo / Nx)',
    description:
      'Multiple applications and shared packages live in a single repository, typically with apps/ and packages/ folders.',
    requiredFolders: ['apps', 'packages'],
    optionalFolders: ['tools', 'configs'],
    tags: ['monorepo', 'turborepo', 'nx'],
  },
  {
    name: 'Microservices',
    description:
      'Independent services each with their own package.json and deployment. Usually organized under a services/ folder where each subfolder contains its own package.json.',
    requiredFolders: ['services'],
    filePatterns: ['services/*/package.json'],
    tags: ['microservices', 'distributed', 'scalable'],
  },
  {
    name: 'App Router (Next.js 13+)',
    description:
      'Next.js App Router pattern with route groups, parallel routes, and server components. Folders under app/ define routes.',
    requiredFolders: ['app'],
    filePatterns: ['app/layout.tsx', 'app/page.tsx', 'app/*/page.tsx'],
    tags: ['nextjs', 'app-router', 'frontend'],
  },
]

// ─── Detection Helpers ───────────────────────────────────────────────────────

export function getFolderNames(paths: string[]): Set<string> {
  const folders = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    // Add all intermediate folders (except file name)
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i]) folders.add(parts[i])
    }
  }
  return folders
}

export function getFileNames(paths: string[]): string[] {
  return paths.map((p) => p.split('/').pop() ?? p)
}

export function countMatchingFiles(paths: string[], pattern: string): number {
  // Simple glob-like matching: * matches any chars
  const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '<<STARSTAR>>').replace(/\*/g, '[^/]*').replace(/<<STARSTAR>>/g, '.*') + '$')
  return paths.filter((p) => regex.test(p)).length
}

export function detectArchitecture(paths: string[]): DetectedPattern[] {
  const folders = getFolderNames(paths)
  const detections: DetectedPattern[] = []
  const now = new Date().toISOString()

  for (const pattern of ARCHITECTURE_PATTERNS) {
    const matchedRequired = pattern.requiredFolders.filter((f) => folders.has(f))
    const matchedOptional = (pattern.optionalFolders ?? []).filter((f) => folders.has(f))

    // Require at least all required folders, or all but one if many optional match
    const requiredCount = pattern.requiredFolders.length
    const matchedCount = matchedRequired.length

    let confidence = 0
    if (matchedCount === requiredCount) {
      confidence = 0.9 + matchedOptional.length * 0.02
    } else if (requiredCount > 2 && matchedCount >= requiredCount - 1) {
      confidence = 0.6 + matchedCount * 0.1
    }

    // Boost confidence if file patterns match
    let fileEvidence: string[] = []
    if (pattern.filePatterns && confidence > 0) {
      for (const fp of pattern.filePatterns) {
        const count = countMatchingFiles(paths, fp)
        if (count > 0) {
          confidence = Math.min(confidence + 0.05, 0.98)
          fileEvidence.push(`${count} file(s) matching ${fp}`)
        }
      }
    }

    if (confidence < 0.5) continue

    const evidence = [
      `Required folders found: ${matchedRequired.join(', ')}`,
      ...(matchedOptional.length > 0 ? [`Optional folders found: ${matchedOptional.join(', ')}`] : []),
      ...fileEvidence,
    ]

    detections.push({
      title: `Architecture: ${pattern.name}`,
      content: `${pattern.description}\n\nEvidence:\n${evidence.map((e) => `- ${e}`).join('\n')}`,
      type: 'pattern',
      tags: pattern.tags,
      metadata: {
        source: 'folder_structure',
        confidence: Math.min(confidence, 0.98),
        detectedAt: now,
        evidence,
        requiredFolders: pattern.requiredFolders,
        matchedRequired,
        matchedOptional,
      },
    })
  }

  return detections
}

interface NamingConvention {
  name: string
  regex: RegExp
  example: string
  tags: string[]
}

const NAMING_CONVENTIONS: NamingConvention[] = [
  { name: 'kebab-case', regex: /^[a-z0-9]+(-[a-z0-9]+)*\.\w+$/, example: 'my-component.tsx', tags: ['naming', 'kebab-case'] },
  { name: 'camelCase', regex: /^[a-z][a-zA-Z0-9]*\.\w+$/, example: 'myComponent.ts', tags: ['naming', 'camelCase'] },
  { name: 'PascalCase', regex: /^[A-Z][a-zA-Z0-9]*\.\w+$/, example: 'MyComponent.tsx', tags: ['naming', 'PascalCase'] },
  { name: 'snake_case', regex: /^[a-z0-9]+(_[a-z0-9]+)*\.\w+$/, example: 'my_component.py', tags: ['naming', 'snake_case'] },
]

export function detectNamingConventions(paths: string[]): DetectedPattern[] {
  const fileNames = getFileNames(paths)
  const codeFiles = fileNames.filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|kt)$/.test(f))
  if (codeFiles.length === 0) return []

  const now = new Date().toISOString()
  const detections: DetectedPattern[] = []

  // Count each convention
  const counts: Record<string, number> = {}
  for (const file of codeFiles) {
    // Remove extension for testing
    const base = file.replace(/\.\w+$/, '')
    if (!base) continue

    for (const convention of NAMING_CONVENTIONS) {
      // Test against full filename (with extension) or basename
      if (convention.regex.test(file) || convention.regex.test(base + '.ts')) {
        counts[convention.name] = (counts[convention.name] ?? 0) + 1
      }
    }
  }

  const total = codeFiles.length
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])

  if (sorted.length === 0) return []

  // Primary convention (>30% of files)
  const [primaryName, primaryCount] = sorted[0]
  const primaryPct = primaryCount / total
  if (primaryPct >= 0.3) {
    const convention = NAMING_CONVENTIONS.find((c) => c.name === primaryName)!
    const otherConventions = sorted
      .slice(1)
      .filter(([, c]) => c / total >= 0.1)
      .map(([name, count]) => `${name}: ${count} files (${Math.round((count / total) * 100)}%)`)

    detections.push({
      title: `Naming Convention: ${primaryName}`,
      content: `Primary naming convention appears to be **${primaryName}** (${primaryCount} of ${total} code files, ${Math.round(primaryPct * 100)}%).\n\nExample: \`${convention.example}\`\n\n${otherConventions.length > 0 ? `Other conventions also detected:\n${otherConventions.map((o) => `- ${o}`).join('\n')}` : ''}`,
      type: 'convention',
      tags: convention.tags,
      metadata: {
        source: 'folder_structure',
        confidence: Math.min(primaryPct + 0.2, 0.95),
        detectedAt: now,
        evidence: [`${primaryCount}/${total} files match ${primaryName}`],
        primaryConvention: primaryName,
        primaryCount,
        totalFiles: total,
        allConventions: Object.fromEntries(sorted.map(([n, c]) => [n, c])),
      },
    })
  }

  return detections
}

export function detectTestPatterns(paths: string[]): DetectedPattern[] {
  const now = new Date().toISOString()
  const detections: DetectedPattern[] = []

  const testFiles = paths.filter((p) => /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs)$/.test(p))
  const testFolders = paths.some((p) => p.includes('/__tests__/'))

  if (testFiles.length === 0 && !testFolders) return []

  const patterns: string[] = []
  if (testFiles.some((p) => p.endsWith('.test.ts'))) patterns.push('*.test.ts')
  if (testFiles.some((p) => p.endsWith('.spec.ts'))) patterns.push('*.spec.ts')
  if (testFolders) patterns.push('__tests__/ folder')

  detections.push({
    title: 'Test Organization Pattern',
    content: `Testing pattern detected: ${patterns.join(', ')}.\n\nTotal test files found: ${testFiles.length}. ${testFolders ? 'Tests are organized in dedicated `__tests__/` folders alongside source code.' : 'Tests are co-located with source files using naming suffixes.'}`,
    type: 'convention',
    tags: ['testing', 'convention', 'quality'],
    metadata: {
      source: 'folder_structure',
      confidence: testFiles.length > 5 ? 0.95 : 0.75,
      detectedAt: now,
      evidence: [`${testFiles.length} test files`, ...(testFolders ? ['__tests__/ folders present'] : [])],
      testFileCount: testFiles.length,
      patterns,
    },
  })

  return detections
}

export function detectApiVersioning(paths: string[]): DetectedPattern[] {
  const now = new Date().toISOString()
  const versionedRoutes = paths.filter((p) => /\/(v\d+|version\d+)\//.test(p) || /\/(v\d+|version\d+)\./.test(p))

  if (versionedRoutes.length === 0) return []

  return [{
    title: 'API Versioning Pattern',
    content: `API routes are versioned. Found ${versionedRoutes.length} versioned path(s):\n${versionedRoutes.slice(0, 5).map((p) => `- \`${p}\``).join('\n')}${versionedRoutes.length > 5 ? '\n...' : ''}`,
    type: 'pattern',
    tags: ['api', 'versioning', 'backend'],
    metadata: {
      source: 'folder_structure',
      confidence: 0.9,
      detectedAt: now,
      evidence: versionedRoutes.slice(0, 10),
      versionedPathCount: versionedRoutes.length,
    },
  }]
}

// ─── Main Service ────────────────────────────────────────────────────────────

export class CodingPatternDetectorService {
  /**
   * Run full coding pattern detection from a list of file paths.
   * Creates/updates knowledge entries in the project.
   */
  async detect(
    projectId: string,
    userId: string | null,
    input: PatternDetectionInput
  ): Promise<PatternDetectionResult> {
    if (!input.paths || input.paths.length === 0) {
      throw new ValidationError('At least one file path must be provided for detection')
    }

    // Normalize paths (remove leading ./)
    const paths = input.paths.map((p) => p.replace(/^\.\//, ''))

    // Run all detectors
    const detections: DetectedPattern[] = [
      ...detectArchitecture(paths),
      ...detectNamingConventions(paths),
      ...detectTestPatterns(paths),
      ...detectApiVersioning(paths),
    ]

    if (detections.length === 0) {
      return {
        entries: [],
        summary: {
          pathsAnalyzed: paths.length,
          totalDetections: 0,
          created: 0,
          updated: 0,
          categories: {},
        },
      }
    }

    // Save detections to knowledge base
    const { entries, created, updated } = await this.saveDetections(
      projectId,
      userId,
      detections
    )

    const categories: Record<string, number> = {}
    for (const d of detections) {
      for (const tag of d.tags) {
        categories[tag] = (categories[tag] ?? 0) + 1
      }
    }

    return {
      entries,
      summary: {
        pathsAnalyzed: paths.length,
        totalDetections: detections.length,
        created,
        updated,
        categories,
      },
    }
  }

  /**
   * Save detected patterns to knowledge base.
   * Deduplicates by matching title + source='auto_detected' for the project.
   */
  private async saveDetections(
    projectId: string,
    userId: string | null,
    detections: DetectedPattern[]
  ): Promise<{ entries: KnowledgeEntry[]; created: number; updated: number }> {
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
export const codingPatternDetectorService = new CodingPatternDetectorService()
