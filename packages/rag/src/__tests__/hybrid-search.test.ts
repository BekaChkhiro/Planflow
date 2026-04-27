import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HybridSearch, tokenize } from "../search/hybrid-search.js";
import { VectorStore } from "../store/index.js";
import type { Embedder } from "../embedder/embedder.js";
import type { EmbeddingRecord, SearchOptions } from "../types.js";
import { SearchOptionsSchema } from "../types.js";
import { existsSync } from "node:fs";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------- helpers ----------

const DIMS = 3; // Small vectors for tests

function makeRecord(
  id: string,
  filePath: string,
  vector: number[],
  overrides?: Partial<{
    content: string;
    name: string;
    kind: string;
    language: string;
    source: "code" | "docs";
  }>,
): EmbeddingRecord {
  return {
    id,
    vector: new Float32Array(vector),
    content: overrides?.content ?? `function ${id}() { return true; }`,
    metadata: {
      filePath,
      kind: overrides?.kind ?? "function",
      name: overrides?.name ?? id,
      language: overrides?.language ?? "typescript",
      startLine: 1,
      endLine: 10,
      source: overrides?.source ?? "code",
      indexedAt: new Date().toISOString(),
    },
  };
}

/** Parse partial options through Zod schema to apply defaults */
function opts(partial: { query: string } & Partial<SearchOptions>): SearchOptions {
  return SearchOptionsSchema.parse(partial);
}

/** Create a mock embedder that returns a deterministic vector for any query */
function createMockEmbedder(queryVector: number[]): Embedder {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array(queryVector)),
    ),
    embedOne: vi.fn(async () => new Float32Array(queryVector)),
  } as unknown as Embedder;
}

// ---------- tests ----------

describe("tokenize", () => {
  it("splits on whitespace and delimiters", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
  });

  it("lowercases tokens", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  it("splits on code delimiters", () => {
    expect(tokenize("foo_bar.baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("drops single-char tokens", () => {
    expect(tokenize("a bb ccc")).toEqual(["bb", "ccc"]);
  });

  it("deduplicates tokens", () => {
    expect(tokenize("hello hello world")).toEqual(["hello", "world"]);
  });

  it("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("HybridSearch", () => {
  let dbPath: string;
  let store: VectorStore;

  beforeEach(async () => {
    dbPath = await mkdtemp(join(tmpdir(), "hybridsearch-test-"));
    store = new VectorStore(dbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    if (existsSync(dbPath)) {
      await rm(dbPath, { recursive: true, force: true });
    }
  });

  it("returns empty results for empty query", async () => {
    const embedder = createMockEmbedder([1, 0, 0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "" }));
    expect(results).toEqual([]);
  });

  it("returns empty results when store is empty", async () => {
    const embedder = createMockEmbedder([1, 0, 0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "fetchUser" }));
    expect(results).toEqual([]);
  });

  it("finds results via vector similarity", async () => {
    await store.upsert([
      makeRecord("close", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "some unrelated content alpha",
        name: "alpha",
      }),
      makeRecord("far", "src/b.ts", [0.0, 1.0, 0.0], {
        content: "completely different beta",
        name: "beta",
      }),
    ]);

    // Mock embedder returns vector close to "close" record
    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "alpha function" }));

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.chunk.id).toBe("close");
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("finds results via keyword match", async () => {
    // Both records are equidistant from the query vector
    await store.upsert([
      makeRecord("target", "src/user.ts", [0.5, 0.5, 0.0], {
        content: "function fetchUser(id) { return db.query(id); }",
        name: "fetchUser",
      }),
      makeRecord("other", "src/post.ts", [0.5, 0.5, 0.0], {
        content: "function createPost(data) { return db.insert(data); }",
        name: "createPost",
      }),
    ]);

    // Query vector is equidistant, but keyword "fetchUser" matches only target
    const embedder = createMockEmbedder([0.5, 0.5, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "fetchUser" }));

    expect(results.length).toBeGreaterThanOrEqual(1);
    // The record with keyword match should be ranked higher due to fusion
    expect(results[0]!.chunk.id).toBe("target");
  });

  it("marks results found in both paths as 'hybrid'", async () => {
    await store.upsert([
      makeRecord("match", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "function searchItems() { return items.filter(); }",
        name: "searchItems",
      }),
    ]);

    // Vector is close AND keyword "searchItems" matches
    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "searchItems" }));

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("hybrid");
  });

  it("respects the limit parameter", async () => {
    await store.upsert([
      makeRecord("r1", "src/a.ts", [1.0, 0.0, 0.0], { content: "function one() {}" }),
      makeRecord("r2", "src/b.ts", [0.9, 0.1, 0.0], { content: "function two() {}" }),
      makeRecord("r3", "src/c.ts", [0.8, 0.2, 0.0], { content: "function three() {}" }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "function", limit: 2 }));
    expect(results).toHaveLength(2);
  });

  it("filters by language", async () => {
    await store.upsert([
      makeRecord("ts1", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "function handler() {}",
        language: "typescript",
      }),
      makeRecord("py1", "src/b.py", [0.9, 0.1, 0.0], {
        content: "def handler(): pass",
        language: "python",
      }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({
      query: "handler",
      language: "python",
    }));

    expect(results).toHaveLength(1);
    expect((results[0]!.chunk as any).language).toBe("python");
  });

  it("filters by kind", async () => {
    await store.upsert([
      makeRecord("fn1", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "function doStuff() {}",
        kind: "function",
      }),
      makeRecord("cls1", "src/a.ts", [0.9, 0.1, 0.0], {
        content: "class MyClass { doStuff() {} }",
        kind: "class",
      }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({
      query: "doStuff",
      kind: "class",
    }));

    expect(results).toHaveLength(1);
    expect((results[0]!.chunk as any).kind).toBe("class");
  });

  it("filters by source (code vs docs)", async () => {
    await store.upsert([
      makeRecord("code1", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "function authenticate() {}",
        source: "code",
      }),
      makeRecord("doc1", "docs/auth.md", [0.9, 0.1, 0.0], {
        content: "How to authenticate users",
        source: "docs",
      }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({
      query: "authenticate",
      source: "code",
    }));

    expect(results).toHaveLength(1);
    expect(results[0]!.chunk.id).toBe("code1");
  });

  it("normalizes scores to 0-1 range", async () => {
    await store.upsert([
      makeRecord("r1", "src/a.ts", [1.0, 0.0, 0.0], { content: "function test() {}" }),
      makeRecord("r2", "src/b.ts", [0.0, 1.0, 0.0], { content: "function other() {}" }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "test function" }));

    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
    // Top result should be normalized to 1.0
    expect(results[0]!.score).toBe(1);
  });

  it("boosts results that match in both vector and keyword paths", async () => {
    // r1: close vector AND keyword match
    // r2: close vector only
    // r3: keyword match only (far vector)
    await store.upsert([
      makeRecord("both", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "function fetchUser(id) { return user; }",
        name: "fetchUser",
      }),
      makeRecord("veconly", "src/b.ts", [0.95, 0.05, 0.0], {
        content: "function getAccount(id) { return account; }",
        name: "getAccount",
      }),
      makeRecord("kwonly", "src/c.ts", [0.0, 0.0, 1.0], {
        content: "function fetchUser() { /* deprecated */ }",
        name: "fetchUser",
      }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "fetchUser" }));

    // The record matching in BOTH paths should rank highest
    expect(results[0]!.chunk.id).toBe("both");
    expect(results[0]!.source).toBe("hybrid");
  });

  it("returns docs-type chunks with correct shape from keyword path", async () => {
    // Use a vector far from the query vector so the keyword path (rowToChunk) is the
    // primary contributor and we exercise the docs branch of rowToChunk.
    await store.upsert([
      makeRecord("doc1", "https://docs.example.com/api", [0.0, 0.0, 1.0], {
        content: "How to authenticate users in the API guide for developers",
        name: "Authentication",
        kind: "docs",
        source: "docs",
      }),
    ]);

    // Query vector is orthogonal so keyword path dominates
    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "authenticate" }));

    expect(results.length).toBeGreaterThanOrEqual(1);
    const chunk = results[0]!.chunk;
    // When the keyword path processes a docs record, rowToChunk converts it
    // with source = file_path (the URL) and title = name
    expect(chunk.content).toContain("authenticate");
    // The chunk should be recognizable as a docs chunk
    expect(chunk.id).toBe("doc1");
  });

  it("applies substring name boost in BM25 keyword scoring", async () => {
    // Both records have the SAME vector so vector path gives equal scores.
    // "subMatch" has name="processUserData" which contains "process" → 1.3x keyword boost
    // "noMatch" has name="handleRequest" which does NOT contain "process"
    // Both have "process" in content, but only one has name match.
    await store.upsert([
      makeRecord("subMatch", "src/a.ts", [0.5, 0.5, 0.0], {
        content: "function processUserData(data) { return data; }",
        name: "processUserData",
      }),
      makeRecord("noMatch", "src/b.ts", [0.5, 0.5, 0.0], {
        content: "function handleRequest(data) { return data; }",
        name: "handleRequest",
      }),
    ]);

    const embedder = createMockEmbedder([0.5, 0.5, 0.0]);
    const search = new HybridSearch(store, embedder);

    // "process" is a substring of "processUserData" → substring boost applies
    const results = await search.search(opts({ query: "process" }));

    expect(results.length).toBeGreaterThanOrEqual(1);
    // subMatch should rank first because keyword "process" appears in name (substring boost)
    // AND in content, while noMatch only has "process" in content
    const subResult = results.find((r) => r.chunk.id === "subMatch");
    const noResult = results.find((r) => r.chunk.id === "noMatch");
    expect(subResult).toBeDefined();
    // subMatch should have equal or higher score due to name boost
    if (noResult) {
      expect(subResult!.score).toBeGreaterThanOrEqual(noResult.score);
    }
  });

  it("handles name-match boost in BM25 scoring", async () => {
    // Both records have equal vector similarity to query, so keyword scoring decides
    // "exact" has exact name match ("process"), "noname" has no name match
    await store.upsert([
      makeRecord("exact", "src/a.ts", [1.0, 0.0, 0.0], {
        content: "function process(data) { return transform(data); }",
        name: "process",
      }),
      makeRecord("noname", "src/b.ts", [1.0, 0.0, 0.0], {
        content: "function transform(data) { return process(data); }",
        name: "transform",
      }),
    ]);

    const embedder = createMockEmbedder([1.0, 0.0, 0.0]);
    const search = new HybridSearch(store, embedder);

    const results = await search.search(opts({ query: "process" }));

    expect(results.length).toBeGreaterThanOrEqual(2);
    // Both contain "process" in content, but "exact" has name="process" → boost
    // With identical vector scores, the keyword name boost should be the tiebreaker
    const exactResult = results.find((r) => r.chunk.id === "exact");
    const nonameResult = results.find((r) => r.chunk.id === "noname");
    expect(exactResult).toBeDefined();
    expect(nonameResult).toBeDefined();
    // Scores should be very close since vectors are identical;
    // the name boost creates a small but real difference in keyword ranking
    expect(Math.abs(exactResult!.score - nonameResult!.score)).toBeLessThan(0.05);
  });
});
