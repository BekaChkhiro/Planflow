import { pgEnum, pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { users } from './users'

// Knowledge entry types
export const knowledgeTypeEnum = pgEnum('knowledge_type', [
  'architecture',     // System architecture decisions (e.g., "We use Hono for API routing")
  'pattern',          // Coding patterns (e.g., "route → service → repository")
  'convention',       // Team conventions (e.g., "Use kebab-case for file names")
  'decision',         // ADR-style decisions (e.g., "Chose LanceDB over Pinecone because...")
  'dependency',       // Key dependency notes (e.g., "Drizzle ORM for type-safe queries")
  'environment',      // Environment/infra notes (e.g., "Neon serverless PostgreSQL")
  'other',            // Catch-all
])

// How the knowledge was created
export const knowledgeSourceEnum = pgEnum('knowledge_source', [
  'manual',           // User/agent explicitly added via planflow_remember
  'auto_detected',    // Auto-detected from package.json, tsconfig, folder structure
  'imported',         // Imported from CLAUDE.md, .cursorrules, etc.
])

export const projectKnowledge = pgTable('project_knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Which project this knowledge belongs to
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),

  // Classification
  type: knowledgeTypeEnum('type').notNull().default('other'),
  source: knowledgeSourceEnum('source').notNull().default('manual'),

  // Content
  title: text('title').notNull(),
  content: text('content').notNull(),

  // Optional tags for filtering/grouping (e.g., ["frontend", "auth", "api"])
  tags: text('tags').array(),

  // Structured metadata (source file path, confidence score, auto-detection details, etc.)
  metadata: jsonb('metadata'),

  // Who created/last updated this entry
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by')
    .references(() => users.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Fast lookup by project
  projectIdx: index('project_knowledge_project_id_idx').on(table.projectId),
  // Filter by project + type
  projectTypeIdx: index('project_knowledge_project_type_idx').on(table.projectId, table.type),
  // Filter by project + source
  projectSourceIdx: index('project_knowledge_project_source_idx').on(table.projectId, table.source),
}))

export type ProjectKnowledge = typeof projectKnowledge.$inferSelect
export type NewProjectKnowledge = typeof projectKnowledge.$inferInsert

// Type for the metadata field
export type KnowledgeMetadata = {
  // For auto-detected entries
  sourceFile?: string            // e.g., "package.json", "tsconfig.json"
  confidence?: number            // 0-1 confidence score for auto-detection
  detectedAt?: string            // ISO timestamp of detection

  // For imported entries
  importedFrom?: string          // e.g., "CLAUDE.md", ".cursorrules"

  // For architecture/pattern entries
  relatedFiles?: string[]        // Files this knowledge applies to
  relatedTasks?: string[]        // Task IDs this knowledge relates to

  // Generic
  [key: string]: unknown
}
