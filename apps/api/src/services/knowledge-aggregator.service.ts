/**
 * Knowledge Aggregator Service (T20.8)
 *
 * Combines 4 data layers into a unified project context response:
 *   1. PostgreSQL  – project_knowledge entries (architecture, patterns, conventions…)
 *   2. LanceDB    – vector-search results for a semantic query
 *   3. Redis      – active_work state + recent_changes stream
 *   4. Git/Activity – recent change history from the activity log
 *
 * Each layer is fetched concurrently and returned in a single response so that
 * AI agents (Claude Code, Cursor, Windsurf, Cline) get full project context
 * from one MCP call without reading individual files.
 */

import { ragService } from './rag.service.js'
import type { KnowledgeEntry } from '../repositories/knowledge.repository.js'
import {
  getActiveWorkStore,
  getRecentChangesStore,
  type ActiveWorkData,
  type RecentChangeEntry,
} from '../lib/redis.js'
import { getDbClient, schema } from '../db/index.js'
import { count, desc, eq } from 'drizzle-orm'
import { loggers } from '../lib/logger.js'

const log = loggers.server

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AggregatorQuery {
  projectId: string
  /** Optional semantic search query for the vector layer */
  query?: string
  /** Which layers to include (default: all) */
  layers?: Array<'knowledge' | 'vector' | 'realtime' | 'activity'>
  /** Max knowledge entries (default 50) */
  knowledgeLimit?: number
  /** Max recent changes (default 30) */
  changesLimit?: number
  /** Max activity log entries (default 30) */
  activityLimit?: number
  /** Filter knowledge by type */
  knowledgeType?: string
}

export interface AggregatedContext {
  projectId: string
  timestamp: string
  layers: {
    knowledge: KnowledgeLayer | null
    vector: VectorLayer | null
    realtime: RealtimeLayer | null
    activity: ActivityLayer | null
  }
  summary: ContextSummary
}

export interface KnowledgeLayer {
  entries: KnowledgeEntry[]
  total: number
}

export interface RealtimeLayer {
  activeWork: ActiveWorkData[]
  recentChanges: RecentChangeEntry[]
  changesTotal: number
}

export interface ActivityLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string | null
  taskId: string | null
  description: string | null
  actorEmail: string | null
  actorName: string | null
  createdAt: Date
}

export interface ActivityLayer {
  entries: ActivityLogEntry[]
  total: number
}

export interface VectorLayer {
  results: import('@planflow/rag').SearchResult[]
  total: number
  query: string | null
}

export interface ContextSummary {
  knowledgeCount: number
  vectorResultsCount: number
  activeWorkers: number
  recentChangesCount: number
  activityCount: number
  layersLoaded: string[]
  layerErrors: string[]
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KnowledgeAggregatorService {
  /**
   * Aggregate project context from all requested layers.
   * Each layer is fetched concurrently; individual failures are
   * reported in `summary.layerErrors` instead of failing the whole request.
   */
  async aggregate(query: AggregatorQuery): Promise<AggregatedContext> {
    const {
      projectId,
      query: searchQuery,
      layers = ['knowledge', 'realtime', 'activity'],
      knowledgeLimit = 50,
      changesLimit = 30,
      activityLimit = 30,
      knowledgeType,
    } = query

    const layersLoaded: string[] = []
    const layerErrors: string[] = []

    // Launch all layers concurrently
    const [knowledgeResult, vectorResult, realtimeResult, activityResult] = await Promise.allSettled([
      layers.includes('knowledge')
        ? this.fetchKnowledge(projectId, knowledgeLimit, knowledgeType)
        : Promise.resolve(null),
      layers.includes('vector') && searchQuery
        ? this.fetchVector(projectId, searchQuery)
        : Promise.resolve(null),
      layers.includes('realtime')
        ? this.fetchRealtime(projectId, changesLimit)
        : Promise.resolve(null),
      layers.includes('activity')
        ? this.fetchActivity(projectId, activityLimit)
        : Promise.resolve(null),
    ])

    // Unpack knowledge
    let knowledge: KnowledgeLayer | null = null
    if (knowledgeResult.status === 'fulfilled' && knowledgeResult.value) {
      knowledge = knowledgeResult.value
      layersLoaded.push('knowledge')
    } else if (knowledgeResult.status === 'rejected') {
      log.error({ error: knowledgeResult.reason, projectId }, 'Knowledge layer failed')
      layerErrors.push('knowledge')
    }

    // Unpack vector
    let vector: VectorLayer | null = null
    if (vectorResult.status === 'fulfilled' && vectorResult.value) {
      vector = vectorResult.value
      layersLoaded.push('vector')
    } else if (vectorResult.status === 'rejected') {
      log.error({ error: vectorResult.reason, projectId }, 'Vector layer failed')
      layerErrors.push('vector')
    }

    // Unpack realtime
    let realtime: RealtimeLayer | null = null
    if (realtimeResult.status === 'fulfilled' && realtimeResult.value) {
      realtime = realtimeResult.value
      layersLoaded.push('realtime')
    } else if (realtimeResult.status === 'rejected') {
      log.error({ error: realtimeResult.reason, projectId }, 'Realtime layer failed')
      layerErrors.push('realtime')
    }

    // Unpack activity
    let activity: ActivityLayer | null = null
    if (activityResult.status === 'fulfilled' && activityResult.value) {
      activity = activityResult.value
      layersLoaded.push('activity')
    } else if (activityResult.status === 'rejected') {
      log.error({ error: activityResult.reason, projectId }, 'Activity layer failed')
      layerErrors.push('activity')
    }

    return {
      projectId,
      timestamp: new Date().toISOString(),
      layers: {
        knowledge,
        vector,
        realtime,
        activity,
      },
      summary: {
        knowledgeCount: knowledge?.total ?? 0,
        vectorResultsCount: vector?.total ?? 0,
        activeWorkers: realtime?.activeWork.length ?? 0,
        recentChangesCount: realtime?.changesTotal ?? 0,
        activityCount: activity?.total ?? 0,
        layersLoaded,
        layerErrors,
      },
    }
  }

  // -------------------------------------------------------------------------
  // Layer fetchers
  // -------------------------------------------------------------------------

  private async fetchKnowledge(
    projectId: string,
    limit: number,
    type?: string,
  ): Promise<KnowledgeLayer> {
    const { knowledgeRepository } = await import('../repositories/knowledge.repository.js')
    const result = await knowledgeRepository.findByProject({
      projectId,
      type,
      limit,
      offset: 0,
    })

    return {
      entries: result.data,
      total: result.total,
    }
  }

  private async fetchVector(projectId: string, searchQuery: string): Promise<VectorLayer> {
    const results = await ragService.search(projectId, {
      query: searchQuery,
      limit: 10,
    })

    return {
      results,
      total: results.length,
      query: searchQuery,
    }
  }

  private async fetchRealtime(
    projectId: string,
    changesLimit: number,
  ): Promise<RealtimeLayer> {
    const activeWorkStore = getActiveWorkStore()
    const changesStore = getRecentChangesStore()

    const [activeWork, recentChanges, changesTotal] = await Promise.all([
      activeWorkStore.getProjectActiveWork(projectId),
      changesStore.getRecentChanges(projectId, { limit: changesLimit }),
      changesStore.getChangeCount(projectId),
    ])

    return {
      activeWork,
      recentChanges,
      changesTotal,
    }
  }

  private async fetchActivity(
    projectId: string,
    limit: number,
  ): Promise<ActivityLayer> {
    const db = getDbClient()

    const entries = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        description: schema.activityLog.description,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
        createdAt: schema.activityLog.createdAt,
      })
      .from(schema.activityLog)
      .leftJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(eq(schema.activityLog.projectId, projectId))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)

    // Get total count for summary
    const [countResult] = await db
      .select({ value: count() })
      .from(schema.activityLog)
      .where(eq(schema.activityLog.projectId, projectId))

    return {
      entries: entries as ActivityLogEntry[],
      total: countResult?.value ?? 0,
    }
  }
}

// Export singleton
export const knowledgeAggregatorService = new KnowledgeAggregatorService()
