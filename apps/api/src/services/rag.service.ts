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

export interface IndexResult {
  filesIndexed: number
  chunksIndexed: number
  durationMs: number
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
      return { filesIndexed: 0, chunksIndexed: 0, durationMs: 0 }
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

      // Chunk and embed each file
      const records: EmbeddingRecord[] = []
      let filesIndexed = 0

      for (const file of files) {
        const detectedLang = FileScanner.detectLanguage(file.path)
        const language = file.language || detectedLang

        if (!language) {
          log.debug({ path: file.path }, 'Skipping file with unsupported language')
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

          if (chunks.length === 0) continue

          const texts = chunks.map((c) => c.content)
          const vectors = await embedder.embed(texts)

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
              },
            })
          }
          filesIndexed++
        } catch (err) {
          log.warn({ error: err, path: file.path }, 'Failed to chunk/embed file')
        }
      }

      if (records.length > 0) {
        await store.upsert(records)
      }

      await store.close()

      const durationMs = Date.now() - start
      log.info(
        { projectId, filesIndexed, chunksIndexed: records.length, durationMs },
        'RAG index completed'
      )

      return {
        filesIndexed,
        chunksIndexed: records.length,
        durationMs,
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
