import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IncrementalIndexer, type IndexStats, type ProgressEvent } from "../indexer/incremental-indexer.js";
import { FileScanner } from "../scanner/index.js";
import { CodeChunker } from "../chunker/index.js";
import { Embedder } from "../embedder/index.js";
import { VectorStore } from "../store/index.js";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Integration-style tests for IncrementalIndexer.
 *
 * These create real git repos in temp directories but mock the
 * Embedder (to avoid calling the Voyage API) and use a real
 * VectorStore backed by a temp LanceDB directory.
 */

let tempDir: string;
let dbDir: string;

function createMockEmbedder(): Embedder {
  const embedder = {
    embed: vi.fn(async (texts: string[]) => {
      // Return deterministic fake vectors (4 dimensions for test speed)
      return texts.map((_, i) => new Float32Array([i * 0.1, 0.2, 0.3, 0.4]));
    }),
    embedOne: vi.fn(async (_text: string) => new Float32Array([0.1, 0.2, 0.3, 0.4])),
  } as unknown as Embedder;
  return embedder;
}

function git(cwd: string, ...args: string[]) {
  execSync(`git ${args.join(" ")}`, { cwd, stdio: "pipe" });
}

async function initGitRepo(dir: string) {
  git(dir, "init");
  git(dir, "config", "user.email", "test@test.com");
  git(dir, "config", "user.name", "Test");
}

async function commitFile(dir: string, filename: string, content: string, message: string) {
  await writeFile(join(dir, filename), content, "utf-8");
  git(dir, "add", filename);
  git(dir, "commit", "-m", `"${message}"`);
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "rag-incremental-"));
  dbDir = await mkdtemp(join(tmpdir(), "rag-lancedb-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(dbDir, { recursive: true, force: true });
});

describe("IncrementalIndexer", () => {
  it("performs full index when no prior state exists", async () => {
    await initGitRepo(tempDir);
    await commitFile(
      tempDir,
      "hello.ts",
      'export function hello() { return "hi"; }\n',
      "initial",
    );

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);
    const stats = await indexer.index({ rootDir: tempDir });

    expect(stats.mode).toBe("full");
    expect(stats.filesScanned).toBeGreaterThanOrEqual(1);
    expect(stats.chunksCreated).toBeGreaterThanOrEqual(1);
    expect(stats.commitHash).toBeTruthy();

    // Verify records in store
    const count = await store.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await store.close();
  });

  it("returns early when HEAD matches last indexed commit", async () => {
    await initGitRepo(tempDir);
    await commitFile(tempDir, "a.ts", "const a = 1;\n", "init");

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);

    // First run: full index
    await indexer.index({ rootDir: tempDir });

    // Second run: same commit → no-op
    const stats = await indexer.index({ rootDir: tempDir });
    expect(stats.mode).toBe("incremental");
    expect(stats.filesScanned).toBe(0);
    expect(stats.filesIndexed).toBe(0);
    expect(stats.chunksCreated).toBe(0);

    await store.close();
  });

  it("incrementally indexes only changed files", async () => {
    await initGitRepo(tempDir);
    await commitFile(
      tempDir,
      "a.ts",
      'export function a() { return 1; }\n',
      "add a",
    );
    await commitFile(
      tempDir,
      "b.ts",
      'export function b() { return 2; }\n',
      "add b",
    );

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);

    // Full index
    const fullStats = await indexer.index({ rootDir: tempDir });
    expect(fullStats.mode).toBe("full");
    const initialCount = await store.count();

    // Modify one file and add a new one
    await commitFile(
      tempDir,
      "a.ts",
      'export function a() { return 999; }\n',
      "modify a",
    );
    await commitFile(
      tempDir,
      "c.ts",
      'export function c() { return 3; }\n',
      "add c",
    );

    // Incremental index — should only process a.ts and c.ts
    const incStats = await indexer.index({ rootDir: tempDir });
    expect(incStats.mode).toBe("incremental");
    expect(incStats.filesIndexed).toBe(2); // a.ts modified + c.ts added

    await store.close();
  });

  it("handles deleted files by removing them from store", async () => {
    await initGitRepo(tempDir);
    await commitFile(
      tempDir,
      "del.ts",
      'export function del() { return "bye"; }\n',
      "add del",
    );

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);

    // Full index
    await indexer.index({ rootDir: tempDir });

    // Delete the file
    git(tempDir, "rm", "del.ts");
    git(tempDir, "commit", "-m", '"delete del"');

    const incStats = await indexer.index({ rootDir: tempDir });
    expect(incStats.mode).toBe("incremental");
    expect(incStats.filesDeleted).toBeGreaterThanOrEqual(1);

    await store.close();
  });

  it("does full index when incremental is false", async () => {
    await initGitRepo(tempDir);
    await commitFile(tempDir, "x.ts", "const x = 1;\n", "init");

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);

    // First run
    await indexer.index({ rootDir: tempDir });

    // Add new commit
    await commitFile(tempDir, "y.ts", "const y = 2;\n", "add y");

    // Force full index
    const stats = await indexer.index({ rootDir: tempDir, incremental: false });
    expect(stats.mode).toBe("full");

    await store.close();
  });

  it("reports progress events", async () => {
    await initGitRepo(tempDir);
    await commitFile(
      tempDir,
      "prog.ts",
      'export function prog() { return "progress"; }\n',
      "init",
    );

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);
    const events: ProgressEvent[] = [];

    await indexer.index({ rootDir: tempDir }, (e) => events.push(e));

    const stages = events.map((e) => e.stage);
    expect(stages).toContain("scanning");
    expect(stages).toContain("chunking");
    expect(stages).toContain("embedding");
    expect(stages).toContain("done");

    const doneEvent = events.find((e) => e.stage === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.stage === "done") {
      expect(doneEvent.stats.commitHash).toBeTruthy();
    }

    await store.close();
  });

  it("skips non-code files in diff", async () => {
    await initGitRepo(tempDir);
    await commitFile(tempDir, "code.ts", "const a = 1;\n", "init");

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);
    await indexer.index({ rootDir: tempDir });

    // Add a non-code file
    await commitFile(tempDir, "readme.md", "# Hello\n", "add readme");

    const stats = await indexer.index({ rootDir: tempDir });
    expect(stats.mode).toBe("incremental");
    // readme.md should be filtered out — no code files to index
    expect(stats.filesIndexed).toBe(0);

    await store.close();
  });

  it("handles renamed files in incremental mode", async () => {
    await initGitRepo(tempDir);
    await commitFile(
      tempDir,
      "old-name.ts",
      'export function renamed() { return "hi"; }\n',
      "add file",
    );

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);

    // Full index
    await indexer.index({ rootDir: tempDir });

    // Rename the file
    git(tempDir, "mv", "old-name.ts", "new-name.ts");
    git(tempDir, "commit", "-m", '"rename file"');

    const stats = await indexer.index({ rootDir: tempDir });
    expect(stats.mode).toBe("incremental");
    // Should delete old path and index new path
    expect(stats.filesDeleted).toBeGreaterThanOrEqual(1);
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(1);

    await store.close();
  });

  it("emits storing progress events when records exist", async () => {
    await initGitRepo(tempDir);
    await commitFile(
      tempDir,
      "store-test.ts",
      'export function storeTest() { return "progress"; }\n',
      "init",
    );

    const scanner = new FileScanner(tempDir);
    const chunker = new CodeChunker({ grammarsDir: join(process.cwd(), "grammars") });
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);
    const events: ProgressEvent[] = [];

    await indexer.index({ rootDir: tempDir }, (e) => events.push(e));

    const stages = events.map((e) => e.stage);
    expect(stages).toContain("storing");

    await store.close();
  });

  it("throws if not a git repository", async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), "rag-nogit-"));

    const scanner = new FileScanner(nonGitDir);
    const chunker = new CodeChunker();
    const embedder = createMockEmbedder();
    const store = new VectorStore(dbDir);
    await store.init();

    const indexer = new IncrementalIndexer(scanner, chunker, embedder, store);

    await expect(indexer.index({ rootDir: nonGitDir })).rejects.toThrow(
      /not a git repository/i,
    );

    await rm(nonGitDir, { recursive: true, force: true });
    await store.close();
  });
});
