import type {
  SearchOptions,
  SearchResult,
  CodeChunk,
  DocChunk,
} from "../types.js";
import type { Embedder } from "../embedder/embedder.js";
import type { VectorStore } from "../store/vector-store.js";

/** Reciprocal Rank Fusion constant (standard value from literature) */
const RRF_K = 60;

/** Default weight ratio: vector search is slightly favored for code */
const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

/** BM25 tuning parameters */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * Hybrid search combining vector similarity (Voyage-code-3) with BM25 keyword
 * search. Results are merged via Reciprocal Rank Fusion (RRF), which produces
 * a single ranked list without requiring comparable score scales.
 */
export class HybridSearch {
  constructor(
    private store: VectorStore,
    private embedder: Embedder,
  ) {}

  /**
   * Run a hybrid search query.
   *
   * 1. Vector path: embed the query → cosine similarity search in LanceDB
   * 2. Keyword path: tokenize query → SQL LIKE filter → BM25 scoring
   * 3. Fuse both ranked lists with Reciprocal Rank Fusion
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, limit = 10, language, kind, source } = options;

    if (!query || query.trim().length === 0) return [];

    // Fetch more candidates than needed so fusion has material to work with
    const fetchLimit = Math.max(limit * 3, 20);
    const filter = buildFilter({ language, kind, source });

    // Run both search paths in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this._vectorSearch(query, fetchLimit, filter),
      this._keywordSearch(query, fetchLimit, filter),
    ]);

    return this._fuseRRF(vectorResults, keywordResults, limit);
  }

  /** Semantic search via Voyage-code-3 embeddings + cosine similarity */
  private async _vectorSearch(
    query: string,
    limit: number,
    filter?: { language?: string; kind?: string; source?: string },
  ): Promise<SearchResult[]> {
    const queryVector = await this.embedder.embedOne(query);
    return this.store.search(queryVector, limit, filter);
  }

  /** BM25 keyword search over stored content */
  private async _keywordSearch(
    query: string,
    limit: number,
    filter?: { language?: string; kind?: string; source?: string },
  ): Promise<SearchResult[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    // Build SQL WHERE: filter conditions + keyword match on content/name
    const conditions: string[] = [];

    if (filter?.language)
      conditions.push(`language = '${escapeSql(filter.language)}'`);
    if (filter?.kind) conditions.push(`kind = '${escapeSql(filter.kind)}'`);
    if (filter?.source)
      conditions.push(`source = '${escapeSql(filter.source)}'`);

    // At least one query term must appear in content or name (case-insensitive)
    const termClauses = terms.map((t) => {
      const esc = escapeSql(t);
      return `(lower(content) LIKE '%${esc}%' OR lower(name) LIKE '%${esc}%')`;
    });
    conditions.push(`(${termClauses.join(" OR ")})`);

    const where = conditions.join(" AND ");

    // Fetch candidate rows from LanceDB
    const rows = await this.store.scan(where, limit * 2);
    if (rows.length === 0) return [];

    // Score candidates with BM25
    const scored = bm25Score(rows, terms);
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((item) => ({
      chunk: rowToChunk(item.row),
      score: item.score,
      source: "keyword" as const,
    }));
  }

  /**
   * Reciprocal Rank Fusion — combines two ranked lists into one.
   *
   * For each document d found in list i at rank r_i:
   *   RRF(d) = Σ weight_i / (k + r_i)
   *
   * Documents appearing in both lists get boosted naturally.
   */
  private _fuseRRF(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[],
    limit: number,
  ): SearchResult[] {
    const fused = new Map<
      string,
      { score: number; result: SearchResult }
    >();

    // Accumulate RRF scores from vector results
    for (let i = 0; i < vectorResults.length; i++) {
      const r = vectorResults[i]!;
      const id = r.chunk.id;
      const rrfScore = VECTOR_WEIGHT / (RRF_K + i + 1);

      fused.set(id, {
        score: rrfScore,
        result: { ...r, source: "vector" },
      });
    }

    // Accumulate RRF scores from keyword results
    for (let i = 0; i < keywordResults.length; i++) {
      const r = keywordResults[i]!;
      const id = r.chunk.id;
      const rrfScore = KEYWORD_WEIGHT / (RRF_K + i + 1);

      const existing = fused.get(id);
      if (existing) {
        existing.score += rrfScore;
        existing.result.source = "hybrid";
      } else {
        fused.set(id, {
          score: rrfScore,
          result: { ...r, source: "keyword" },
        });
      }
    }

    // Sort by fused score, take top `limit`
    const sorted = Array.from(fused.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Normalize scores to 0–1 range
    const maxScore = sorted[0]?.score ?? 1;
    return sorted.map((s) => ({
      ...s.result,
      score: maxScore > 0 ? s.score / maxScore : 0,
    }));
  }
}

// ---------- helpers ----------

/** Build a filter object from search options, skipping "all" source */
function buildFilter(opts: {
  language?: string;
  kind?: string;
  source?: string;
}): { language?: string; kind?: string; source?: string } | undefined {
  const f: { language?: string; kind?: string; source?: string } = {};
  if (opts.language) f.language = opts.language;
  if (opts.kind) f.kind = opts.kind;
  if (opts.source && opts.source !== "all") f.source = opts.source;
  return f.language || f.kind || f.source ? f : undefined;
}

/** Tokenize text into lowercase terms (≥2 chars), deduplicated */
export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .split(/[\s\-_./\\:;,(){}\[\]<>'"!?@#$%^&*+=|~`]+/)
    .filter((t) => t.length >= 2);

  return [...new Set(raw)];
}

/** Tokenize text preserving duplicates (for TF counting in BM25) */
function tokenizeWithDups(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_./\\:;,(){}\[\]<>'"!?@#$%^&*+=|~`]+/)
    .filter((t) => t.length >= 2);
}

/** Escape a string for use inside SQL LIKE patterns */
function escapeSql(s: string): string {
  return s.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Convert a raw LanceDB row back to a CodeChunk or DocChunk */
function rowToChunk(row: Record<string, unknown>): CodeChunk | DocChunk {
  if (row["source"] === "docs") {
    return {
      id: row["id"] as string,
      source: row["file_path"] as string,
      title: row["name"] as string,
      content: row["content"] as string,
      section: null,
    };
  }
  return {
    id: row["id"] as string,
    filePath: row["file_path"] as string,
    language: row["language"] as string,
    kind: row["kind"] as string,
    name: row["name"] as string,
    content: row["content"] as string,
    startLine: row["start_line"] as number,
    endLine: row["end_line"] as number,
    parentName: null,
  } as CodeChunk;
}

/**
 * Score candidate rows against query terms using BM25.
 *
 * BM25(q, d) = Σ IDF(t) · TF(t,d) · (k1 + 1) / (TF(t,d) + k1 · (1 - b + b · |d| / avgdl))
 */
function bm25Score(
  rows: Record<string, unknown>[],
  terms: string[],
): Array<{ row: Record<string, unknown>; score: number }> {
  const N = rows.length;

  // Tokenize every document once (preserve duplicates for TF counting)
  const docs = rows.map((row) => {
    const content = (row["content"] as string) || "";
    const name = (row["name"] as string) || "";
    const tokens = tokenizeWithDups(content + " " + name);
    return { row, tokens, length: tokens.length };
  });

  const avgdl =
    docs.reduce((sum, d) => sum + d.length, 0) / Math.max(N, 1);

  // Document-frequency for each query term
  const df = new Map<string, number>();
  for (const term of terms) {
    let count = 0;
    for (const doc of docs) {
      if (doc.tokens.includes(term)) count++;
    }
    df.set(term, count);
  }

  return docs.map(({ row, tokens, length: dl }) => {
    let score = 0;

    for (const term of terms) {
      const termDf = df.get(term) ?? 0;
      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
      const tf = tokens.filter((t) => t === term).length;

      score +=
        (idf * (tf * (BM25_K1 + 1))) /
        (tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl)));
    }

    // Boost for name match (catches identifier searches)
    // Exact match gets a stronger boost than substring match
    const nameLower = ((row["name"] as string) || "").toLowerCase();
    let nameBoost = 1.0;
    for (const term of terms) {
      if (nameLower === term) {
        nameBoost = Math.max(nameBoost, 2.0);
      } else if (nameLower.includes(term)) {
        nameBoost = Math.max(nameBoost, 1.3);
      }
    }
    score *= nameBoost;

    return { row, score };
  });
}
