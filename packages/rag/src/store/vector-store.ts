import * as lancedb from "@lancedb/lancedb";
import type { EmbeddingRecord, SearchResult } from "../types.js";

const TABLE_NAME = "embeddings";

/**
 * LanceDB vector store for persisting and querying code embeddings.
 *
 * Uses an embedded LanceDB database stored at `dbPath`.
 * Call `init()` before any other method.
 */
export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  constructor(private dbPath: string) {}

  /** Initialize the database and open/create the embeddings table */
  async init(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);

    const tables = await this.db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
    // Table will be lazily created on first upsert (needs data to infer schema)
  }

  /** Upsert embedding records (insert or update by id) */
  async upsert(records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) return;
    this._ensureInit();

    // Use snake_case columns to avoid quoting issues in LanceDB SQL filters
    const rows = records.map((r) => ({
      id: r.id,
      vector: Array.from(r.vector),
      content: r.content,
      file_path: r.metadata.filePath,
      kind: r.metadata.kind,
      name: r.metadata.name,
      language: r.metadata.language,
      start_line: r.metadata.startLine,
      end_line: r.metadata.endLine,
      source: r.metadata.source,
      indexed_at: r.metadata.indexedAt,
      // Empty string when the indexer didn't supply a hash; treated by
      // callers as "needs re-index" so older shards don't get pinned.
      content_hash: r.metadata.contentHash ?? "",
    }));

    if (!this.table) {
      this.table = await this.db!.createTable(TABLE_NAME, rows, {
        mode: "overwrite",
      });
      return;
    }

    await this.table
      .mergeInsert("id")
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(rows);
  }

  /** Search by vector similarity, returns top `limit` results */
  async search(
    vector: Float32Array,
    limit: number,
    filter?: { language?: string; kind?: string; source?: string },
  ): Promise<SearchResult[]> {
    this._ensureInit();
    if (!this.table) return [];

    let query = this.table
      .vectorSearch(Array.from(vector))
      .distanceType("cosine")
      .limit(limit);

    const conditions: string[] = [];
    if (filter?.language) conditions.push(`language = '${filter.language}'`);
    if (filter?.kind) conditions.push(`kind = '${filter.kind}'`);
    if (filter?.source) conditions.push(`source = '${filter.source}'`);
    if (conditions.length > 0) {
      query = query.postfilter().where(conditions.join(" AND "));
    }

    const results = await query.toArray();

    return results.map((row) => ({
      chunk: {
        id: row.id as string,
        filePath: row.file_path as string,
        language: row.language as string,
        kind: row.kind as string,
        name: row.name as string,
        content: row.content as string,
        startLine: row.start_line as number,
        endLine: row.end_line as number,
        parentName: null,
        source: row.source as string,
        section: null,
        title: row.name as string,
      },
      score: 1 - ((row._distance as number) ?? 0),
      source: "vector" as const,
    }));
  }

  /** Delete all records for a given file path */
  async deleteByFile(filePath: string): Promise<void> {
    this._ensureInit();
    if (!this.table) return;

    await this.table.delete(`file_path = '${filePath.replace(/'/g, "''")}'`);
  }

  /** Count total records, optionally filtered */
  async count(filter?: string): Promise<number> {
    this._ensureInit();
    if (!this.table) return 0;
    return this.table.countRows(filter);
  }

  /** Query rows with an optional SQL WHERE clause (no vector search) */
  async scan(
    where?: string,
    limit?: number,
  ): Promise<Record<string, unknown>[]> {
    this._ensureInit();
    if (!this.table) return [];

    let query = this.table.query();
    if (where) query = query.where(where);
    if (limit) query = query.limit(limit);
    return query.toArray();
  }

  /**
   * Map of `filePath → contentHash` for every file currently in the index.
   *
   * Used by callers (the API service that powers `planflow_index` in
   * incremental mode) to skip files whose local content hasn't changed
   * since the last indexing run.
   *
   * Files indexed before content_hash was tracked will appear with an
   * empty-string hash — clients should treat that as "needs re-index"
   * so older shards don't get pinned to stale chunks.
   */
  async getFileHashes(): Promise<Record<string, string>> {
    this._ensureInit();
    if (!this.table) return {};

    const rows = await this.table
      .query()
      .select(["file_path", "content_hash"])
      .toArray();

    const map: Record<string, string> = {};
    for (const row of rows) {
      const path = row["file_path"] as string | undefined;
      const hash = row["content_hash"] as string | undefined;
      if (path && !(path in map)) {
        // Every chunk in a file has the same hash; record once.
        map[path] = hash ?? "";
      }
    }
    return map;
  }

  /**
   * Aggregate index metadata for status reporting.
   *
   * Avoids pulling the `vector` and `content` columns to keep the scan cheap
   * even on large indexes (a 1024-dim float vector per row dominates payload
   * size). Computes language/source breakdowns and the most recent index
   * timestamp in JS.
   */
  async getStats(): Promise<{
    totalChunks: number;
    indexedFiles: number;
    byLanguage: Record<string, number>;
    bySource: Record<string, number>;
    lastIndexedAt: string | null;
  }> {
    this._ensureInit();
    if (!this.table) {
      return {
        totalChunks: 0,
        indexedFiles: 0,
        byLanguage: {},
        bySource: {},
        lastIndexedAt: null,
      };
    }

    const rows = await this.table
      .query()
      .select(["language", "source", "indexed_at", "file_path"])
      .toArray();

    const byLanguage: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const files = new Set<string>();
    let lastIndexedAt: string | null = null;

    for (const row of rows) {
      const lang = String(row["language"] ?? "unknown");
      const src = String(row["source"] ?? "unknown");
      const indexedAt = row["indexed_at"] as string | null | undefined;
      const filePath = row["file_path"] as string | undefined;

      byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
      bySource[src] = (bySource[src] ?? 0) + 1;
      if (filePath) files.add(filePath);
      if (indexedAt && (!lastIndexedAt || indexedAt > lastIndexedAt)) {
        lastIndexedAt = indexedAt;
      }
    }

    return {
      totalChunks: rows.length,
      indexedFiles: files.size,
      byLanguage,
      bySource,
      lastIndexedAt,
    };
  }

  /** Close the database connection */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.table = null;
    }
  }

  private _ensureInit(): void {
    if (!this.db) {
      throw new Error("VectorStore not initialized. Call init() first.");
    }
  }
}
