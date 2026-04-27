import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VectorStore } from "../store/index.js";
import type { EmbeddingRecord, ChunkMetadata } from "../types.js";
import { existsSync } from "node:fs";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeRecord(
  id: string,
  filePath: string,
  vector: number[],
): EmbeddingRecord {
  return {
    id,
    vector: new Float32Array(vector),
    content: `content of ${id}`,
    metadata: {
      filePath,
      kind: "function",
      name: id,
      language: "typescript",
      startLine: 1,
      endLine: 10,
      source: "code",
      indexedAt: new Date().toISOString(),
    },
  };
}

describe("VectorStore", () => {
  let dbPath: string;
  let store: VectorStore;

  beforeEach(async () => {
    dbPath = await mkdtemp(join(tmpdir(), "vectorstore-test-"));
    store = new VectorStore(dbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    if (existsSync(dbPath)) {
      await rm(dbPath, { recursive: true, force: true });
    }
  });

  it("initializes without error", async () => {
    // Already initialized in beforeEach
    expect(store).toBeDefined();
  });

  it("throws if methods called before init", async () => {
    const uninit = new VectorStore(dbPath + "-noinit");
    await expect(
      uninit.upsert([makeRecord("r1", "a.ts", [0.1, 0.2, 0.3])]),
    ).rejects.toThrow("not initialized");
  });

  describe("upsert", () => {
    it("inserts records into a new table", async () => {
      const records = [
        makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3]),
        makeRecord("r2", "src/b.ts", [0.4, 0.5, 0.6]),
      ];

      await store.upsert(records);
      const count = await store.count();
      expect(count).toBe(2);
    });

    it("does nothing with empty array", async () => {
      await store.upsert([]);
      const count = await store.count();
      expect(count).toBe(0);
    });

    it("updates existing records by id", async () => {
      await store.upsert([makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3])]);

      // Upsert same id with different vector
      const updated: EmbeddingRecord = {
        ...makeRecord("r1", "src/a.ts", [0.9, 0.8, 0.7]),
        content: "updated content",
      };
      await store.upsert([updated]);

      const count = await store.count();
      expect(count).toBe(1);

      // Search should find the updated record
      const results = await store.search(new Float32Array([0.9, 0.8, 0.7]), 1);
      expect(results).toHaveLength(1);
      expect(results[0]!.chunk.content).toBe("updated content");
    });

    it("inserts new records alongside existing ones", async () => {
      await store.upsert([makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3])]);
      await store.upsert([makeRecord("r2", "src/b.ts", [0.4, 0.5, 0.6])]);

      const count = await store.count();
      expect(count).toBe(2);
    });
  });

  describe("search", () => {
    it("returns results sorted by similarity", async () => {
      await store.upsert([
        makeRecord("close", "src/a.ts", [1.0, 0.0, 0.0]),
        makeRecord("far", "src/b.ts", [0.0, 1.0, 0.0]),
      ]);

      const results = await store.search(
        new Float32Array([1.0, 0.0, 0.0]),
        10,
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.chunk.id).toBe("close");
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    });

    it("respects limit parameter", async () => {
      await store.upsert([
        makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3]),
        makeRecord("r2", "src/b.ts", [0.4, 0.5, 0.6]),
        makeRecord("r3", "src/c.ts", [0.7, 0.8, 0.9]),
      ]);

      const results = await store.search(
        new Float32Array([0.1, 0.2, 0.3]),
        2,
      );
      expect(results).toHaveLength(2);
    });

    it("returns empty array when no table exists", async () => {
      const results = await store.search(
        new Float32Array([0.1, 0.2, 0.3]),
        10,
      );
      expect(results).toEqual([]);
    });

    it("includes score and source in results", async () => {
      await store.upsert([
        makeRecord("r1", "src/a.ts", [1.0, 0.0, 0.0]),
      ]);

      const results = await store.search(
        new Float32Array([1.0, 0.0, 0.0]),
        1,
      );

      expect(results[0]!.score).toBeGreaterThan(0);
      expect(results[0]!.source).toBe("vector");
    });

    it("filters by language", async () => {
      const tsRecord = makeRecord("ts1", "src/a.ts", [1.0, 0.0, 0.0]);
      const pyRecord = makeRecord("py1", "src/b.py", [0.9, 0.1, 0.0]);
      pyRecord.metadata.language = "python";

      await store.upsert([tsRecord, pyRecord]);

      const results = await store.search(
        new Float32Array([1.0, 0.0, 0.0]),
        10,
        { language: "python" },
      );

      expect(results).toHaveLength(1);
      expect((results[0]!.chunk as any).language).toBe("python");
    });
  });

  describe("deleteByFile", () => {
    it("deletes records matching the file path", async () => {
      await store.upsert([
        makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3]),
        makeRecord("r2", "src/a.ts", [0.4, 0.5, 0.6]),
        makeRecord("r3", "src/b.ts", [0.7, 0.8, 0.9]),
      ]);

      await store.deleteByFile("src/a.ts");

      // After delete, searching should only find the b.ts record
      const results = await store.search(
        new Float32Array([0.5, 0.5, 0.5]),
        10,
      );
      const filePaths = results.map((r) => (r.chunk as any).filePath);
      expect(filePaths).not.toContain("src/a.ts");
      expect(filePaths).toContain("src/b.ts");
    });

    it("does nothing if file not found", async () => {
      await store.upsert([
        makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3]),
      ]);

      await store.deleteByFile("src/nonexistent.ts");

      const results = await store.search(
        new Float32Array([0.1, 0.2, 0.3]),
        10,
      );
      expect(results).toHaveLength(1);
    });

    it("handles no table gracefully", async () => {
      await store.deleteByFile("src/a.ts"); // No error
    });
  });

  describe("count", () => {
    it("returns 0 for empty/no table", async () => {
      const count = await store.count();
      expect(count).toBe(0);
    });

    it("returns correct count after inserts", async () => {
      await store.upsert([
        makeRecord("r1", "src/a.ts", [0.1, 0.2, 0.3]),
        makeRecord("r2", "src/b.ts", [0.4, 0.5, 0.6]),
      ]);

      const count = await store.count();
      expect(count).toBe(2);
    });
  });

  describe("close", () => {
    it("closes without error", async () => {
      await store.close();
      // Should not throw on double close
      await store.close();
    });
  });
});
