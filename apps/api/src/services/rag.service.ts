/**
 * RAG Service (T21.2)
 *
 * Bridges the @planflow/rag engine to the API layer.
 *
 * - Receives file contents from clients (MCP or web)
 * - Chunks → embeds → stores in per-project LanceDB
 * - Hybrid search (vector + BM25 keyword) via Voyage-code-3
 *
 * LanceDB databases are stored at `data/rag/vector/:projectId/`.
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import {
  Embedder,
  VectorStore,
  HybridSearch,
  CodeChunker,
  FileScanner,
} from '@planflow/rag'
import type { EmbeddingRecord, SearchResult as RagSearchResult, CodeChunk } from '@planflow/rag'
import { loggers } from '../lib/logger.js'

const log = loggers.server

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RAG_DATA_DIR = process.env['RAG_DATA_DIR'] || join(process.cwd(), 'data', 'rag', 'vector')
const VOYAGE_API_KEY = process.env['VOYAGE_API_KEY']

function getEmbedderConfig() {
  return {
    apiUrl: 'https://api.voyageai.com/v1/embeddings',
    apiToken: VOYAGE_API_KEY!,
    model: 'voyage-code-3',
    batchSize: 128,
    dimensions: 1024,
  }
}

function getProjectDbPath(projectId: string): string {
  return join(RAG_DATA_DIR, projectId)
}

/** Simple paragraph-based chunking for docs/text files (not code) */
function chunkTextFile(content: string, filePath: string, language: string): Array<{ id: string; filePath: string; language: string; kind: string; name: string; content: string; startLine: number; endLine: number; parentName: null }> {
  const MAX_CHUNK_SIZE = 2000
  const paragraphs = content.split(/\n\n+/)
  const chunks: Array<{ id: string; filePath: string; language: string; kind: string; name: string; content: string; startLine: number; endLine: number; parentName: null }> = []
  let currentChunk = ''
  let startLine = 1
  let lineCounter = 1

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]!
    const paraLines = para.split('\n').length

    if (currentChunk.length + para.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        id: `${filePath}:${startLine}`,
        filePath,
        language,
        kind: 'module',
        name: filePath.split('/').pop() || filePath,
        content: currentChunk.trim(),
        startLine,
        endLine: lineCounter - 1,
        parentName: null,
      })
      currentChunk = para
      startLine = lineCounter
    } else {
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + para
    }
    lineCounter += paraLines
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${filePath}:${startLine}`,
      filePath,
      language,
      kind: 'module',
      name: filePath.split('/').pop() || filePath,
      content: currentChunk.trim(),
      startLine,
      endLine: lineCounter - 1,
      parentName: null,
    })
  }

  return chunks
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IndexFile {
  path: string
  content: string
  language?: string
}

/**
 * A file that was sent to the indexer but not stored — annotated with the
 * reason so an LLM caller can decide whether the skip is benign (no chunks
 * extractable, e.g. an empty / type-only file) or worth reporting back to
 * the user (chunker crash, oversize, unknown language).
 */
export interface SkippedFile {
  path: string
  reason: 'unsupported_language' | 'chunker_failed' | 'no_chunks' | 'embed_failed'
  detail?: string
}

export interface IndexResult {
  filesIndexed: number
  chunksIndexed: number
  durationMs: number
  skippedFiles: SkippedFile[]
  /**
   * Files whose content hash already matched the indexed copy and were
   * therefore not re-embedded. Counted separately from `skippedFiles`
   * (which tracks failures) because "unchanged" is the desired path,
   * not an error.
   */
  unchangedFiles: number
}

export interface RagSearchOptions {
  query: string
  limit?: number
  language?: string
  kind?: string
  source?: 'code' | 'docs' | 'all'
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RagService {
  /**
   * Index files into LanceDB for a project.
   *
   * The client sends file contents; we write to a temp directory, chunk,
   * embed via Voyage-code-3, and store in a per-project LanceDB database.
   */
  async index(projectId: string, files: IndexFile[]): Promise<IndexResult> {
    if (!VOYAGE_API_KEY) {
      throw new Error('VOYAGE_API_KEY is not configured. RAG indexing is unavailable.')
    }

    if (files.length === 0) {
      return { filesIndexed: 0, chunksIndexed: 0, durationMs: 0, skippedFiles: [], unchangedFiles: 0 }
    }

    const start = Date.now()
    const dbPath = getProjectDbPath(projectId)
    await mkdir(dbPath, { recursive: true })

    // Create a temp directory to hold the files for chunking
    const tempDir = join(tmpdir(), `planflow-rag-${projectId}-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    try {
      // Write files to temp directory (preserving relative paths)
      for (const file of files) {
        const filePath = join(tempDir, file.path)
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, file.content, 'utf-8')
      }

      // Init RAG components
      const embedder = new Embedder(getEmbedderConfig())
      const store = new VectorStore(dbPath)
      await store.init()

      const chunker = new CodeChunker()
      await chunker.init()

      // Pre-compute the existing file→hash map so we can skip files that
      // haven't changed since the last index run. One read instead of
      // querying per-file. Empty hash means "indexed before hashing was
      // tracked" → we re-index those rather than trusting them.
      const existingHashes = await store.getFileHashes()

      // Chunk and embed each file
      const records: EmbeddingRecord[] = []
      const skippedFiles: SkippedFile[] = []
      const filesToReplace: string[] = []
      let filesIndexed = 0
      let unchangedFiles = 0

      for (const file of files) {
        const detectedLang = FileScanner.detectLanguage(file.path)
        const language = file.language || detectedLang

        if (!language) {
          log.debug({ path: file.path }, 'Skipping file with unsupported language')
          skippedFiles.push({ path: file.path, reason: 'unsupported_language' })
          continue
        }

        // Hash the file content once. We use this both as the
        // "is this unchanged?" key and as durable chunk metadata.
        const contentHash = createHash('sha256').update(file.content).digest('hex')
        if (existingHashes[file.path] && existingHashes[file.path] === contentHash) {
          // Same content as the index already has → don't burn an
          // embedding round-trip on it.
          unchangedFiles++
          continue
        }

        try {
          const chunks: Array<{ id: string; filePath: string; language: string; kind: string; name: string; content: string; startLine: number; endLine: number; parentName: string | null }> = []

          if (detectedLang) {
            // Supported programming language — use AST-based chunking
            const codeChunks = await chunker.chunk(file.content, file.path, detectedLang)
            chunks.push(...codeChunks)
          } else {
            // Docs / text — use simple paragraph-based chunking
            const docChunks = chunkTextFile(file.content, file.path, language)
            chunks.push(...docChunks)
          }

          if (chunks.length === 0) {
            skippedFiles.push({ path: file.path, reason: 'no_chunks' })
            continue
          }

          let vectors: Float32Array[]
          try {
            const texts = chunks.map((c) => c.content)
            vectors = await embedder.embed(texts)
          } catch (embedErr) {
            const detail = embedErr instanceof Error ? embedErr.message : String(embedErr)
            log.warn({ error: embedErr, path: file.path }, 'Failed to embed file')
            skippedFiles.push({ path: file.path, reason: 'embed_failed', detail })
            continue
          }

          const now = new Date().toISOString()
          const isDocFile =
            file.path.endsWith('.md') ||
            file.path.endsWith('.mdx') ||
            file.path.endsWith('.txt') ||
            file.path.endsWith('.rst')
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]!
            const vector = vectors[i]!
            records.push({
              id: chunk.id,
              vector,
              content: chunk.content,
              metadata: {
                filePath: chunk.filePath,
                kind: chunk.kind,
                name: chunk.name,
                language: chunk.language,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                source: isDocFile ? 'docs' : 'code',
                indexedAt: now,
                contentHash,
              },
            })
          }
          // Mark this file's existing chunks for deletion before we
          // upsert the new ones — without this, line-shifted chunks
          // create stale duplicates because chunkId encodes startLine.
          if (existingHashes[file.path] !== undefined) {
            filesToReplace.push(file.path)
          }
          filesIndexed++
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          log.warn({ error: err, path: file.path }, 'Failed to chunk/embed file')
          skippedFiles.push({ path: file.path, reason: 'chunker_failed', detail })
        }
      }

      // Delete old chunks for files we're re-indexing (in batch — single
      // SQL execution per file). Must happen BEFORE upsert so the new
      // chunks aren't accidentally swept away.
      for (const path of filesToReplace) {
        await store.deleteByFile(path)
      }

      if (records.length > 0) {
        await store.upsert(records)
      }

      await store.close()

      const durationMs = Date.now() - start
      log.info(
        {
          projectId,
          filesIndexed,
          chunksIndexed: records.length,
          skippedCount: skippedFiles.length,
          unchangedFiles,
          replacedFiles: filesToReplace.length,
          durationMs,
        },
        'RAG index completed'
      )

      return {
        filesIndexed,
        chunksIndexed: records.length,
        durationMs,
        skippedFiles,
        unchangedFiles,
      }
    } finally {
      // Always clean up the temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {
        /* ignore cleanup errors */
      })
    }
  }

  /**
   * Search indexed files using hybrid search (vector similarity + BM25 keyword).
   */
  async search(projectId: string, options: RagSearchOptions): Promise<RagSearchResult[]> {
    if (!VOYAGE_API_KEY) {
      throw new Error('VOYAGE_API_KEY is not configured. RAG search is unavailable.')
    }

    const dbPath = getProjectDbPath(projectId)

    // Quick check: does the DB exist?
    try {
      await access(dbPath)
    } catch {
      return []
    }

    const embedder = new Embedder(getEmbedderConfig())
    const store = new VectorStore(dbPath)
    await store.init()

    try {
      const hybridSearch = new HybridSearch(store, embedder)
      return await hybridSearch.search({
        query: options.query,
        limit: options.limit || 10,
        language: options.language,
        kind: options.kind,
        source: options.source || 'all',
      })
    } finally {
      await store.close()
    }
  }

  /**
   * Map of `filePath → contentHash` for every file in the project's
   * vector index. Used by clients (the MCP `planflow_index` tool in
   * incremental mode) to skip files whose local content already matches
   * what's stored.
   *
   * Returns `{}` when the project hasn't been indexed yet.
   */
  async getFileHashes(projectId: string): Promise<Record<string, string>> {
    const dbPath = getProjectDbPath(projectId)

    try {
      await access(dbPath)
    } catch {
      return {}
    }

    const store = new VectorStore(dbPath)
    try {
      await store.init()
      const map = await store.getFileHashes()
      await store.close()
      return map
    } catch (err) {
      log.warn({ error: err, projectId }, 'Failed to read file hashes')
      return {}
    }
  }

  /**
   * Remove every chunk for the given file paths from the project's index.
   * Used by `planflow_index({ removeMissing: true })` to drop entries
   * that no longer exist on disk (e.g. after `git rm`).
   */
  async removeFiles(projectId: string, paths: string[]): Promise<{ removedFiles: number }> {
    if (paths.length === 0) return { removedFiles: 0 }

    const dbPath = getProjectDbPath(projectId)

    try {
      await access(dbPath)
    } catch {
      return { removedFiles: 0 }
    }

    const store = new VectorStore(dbPath)
    let removed = 0
    try {
      await store.init()
      for (const path of paths) {
        await store.deleteByFile(path)
        removed++
      }
      await store.close()
    } catch (err) {
      log.warn({ error: err, projectId }, 'Failed to remove files from index')
    }

    return { removedFiles: removed }
  }

  /**
   * Purge every chunk stored for a project. Used to clean up indexes that
   * were built before tighter excludes (e.g. Prisma generated paths) were
   * in place — running this then re-indexing gives the user a fresh,
   * minimal vector store without the old noise.
   *
   * Safe to call when the project hasn't been indexed yet (returns 0).
   */
  async purgeIndex(projectId: string): Promise<{ purgedChunks: number }> {
    const dbPath = getProjectDbPath(projectId)

    try {
      await access(dbPath)
    } catch {
      return { purgedChunks: 0 }
    }

    // Easiest reliable purge: blow away the whole per-project DB directory.
    // LanceDB's `delete()` requires a SQL filter and there's no
    // "drop everything" shortcut that survives schema-less tables, so a
    // filesystem-level wipe is both simpler and faster.
    const store = new VectorStore(dbPath)
    let count = 0
    try {
      await store.init()
      count = await store.count()
      await store.close()
    } catch {
      // If we can't open the store, treat as already-empty.
      count = 0
    }

    await rm(dbPath, { recursive: true, force: true }).catch((err) => {
      log.warn({ error: err, projectId, dbPath }, 'Failed to remove project index dir')
    })

    log.info({ projectId, purgedChunks: count }, 'RAG index purged')
    return { purgedChunks: count }
  }

  /**
   * Get the index status for a project, including aggregated stats useful
   * for an LLM-facing status report (file/chunk counts, language breakdown,
   * how recently the project was indexed).
   *
   * `lastIndexedAt` is the max `indexed_at` across all stored chunks; clients
   * can compare it against repo activity to decide whether re-indexing is
   * needed.
   */
  async getIndexStatus(projectId: string): Promise<{
    indexed: boolean
    chunks: number
    indexedFiles: number
    byLanguage: Record<string, number>
    bySource: Record<string, number>
    lastIndexedAt: string | null
  }> {
    const empty = {
      indexed: false,
      chunks: 0,
      indexedFiles: 0,
      byLanguage: {},
      bySource: {},
      lastIndexedAt: null,
    }

    const dbPath = getProjectDbPath(projectId)

    try {
      await access(dbPath)
    } catch {
      return empty
    }

    const store = new VectorStore(dbPath)
    try {
      await store.init()
      const stats = await store.getStats()
      await store.close()
      return {
        indexed: stats.totalChunks > 0,
        chunks: stats.totalChunks,
        indexedFiles: stats.indexedFiles,
        byLanguage: stats.byLanguage,
        bySource: stats.bySource,
        lastIndexedAt: stats.lastIndexedAt,
      }
    } catch {
      return empty
    }
  }

  /**
   * Fetch every chunk stored for a single file path, ordered by start line.
   *
   * Powers the file-anchored mode of `planflow_recall`: an LLM can ask
   * "what do you know about src/foo.ts?" and we return the file's full
   * indexed structure (every function / class / module chunk) without
   * running an embedding query.
   *
   * Returns an empty array if the project isn't indexed or the file
   * isn't present in the index.
   */
  async getFileChunks(
    projectId: string,
    filePath: string
  ): Promise<
    Array<{
      id: string
      filePath: string
      kind: string
      name: string
      language: string
      source: string
      startLine: number
      endLine: number
      indexedAt: string | null
      content: string
    }>
  > {
    const dbPath = getProjectDbPath(projectId)

    try {
      await access(dbPath)
    } catch {
      return []
    }

    const store = new VectorStore(dbPath)
    try {
      await store.init()
      // Escape single quotes for SQL LIKE-style match. LanceDB uses standard
      // SQL string escaping (double single-quote).
      const escaped = filePath.replace(/'/g, "''")
      const rows = await store.scan(`file_path = '${escaped}'`)

      const chunks = rows.map((row) => ({
        id: String(row['id'] ?? ''),
        filePath: String(row['file_path'] ?? filePath),
        kind: String(row['kind'] ?? 'unknown'),
        name: String(row['name'] ?? ''),
        language: String(row['language'] ?? 'unknown'),
        source: String(row['source'] ?? 'code'),
        startLine: Number(row['start_line'] ?? 0),
        endLine: Number(row['end_line'] ?? 0),
        indexedAt: (row['indexed_at'] as string | null) ?? null,
        content: String(row['content'] ?? ''),
      }))

      // Order by appearance in the file — matches a reader's mental model.
      chunks.sort((a, b) => a.startLine - b.startLine)
      return chunks
    } catch (err) {
      log.warn({ error: err, projectId, filePath }, 'Failed to get file chunks')
      return []
    } finally {
      await store.close()
    }
  }
}

// Singleton export
export const ragService = new RagService()
