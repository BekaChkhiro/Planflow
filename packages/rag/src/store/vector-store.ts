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
