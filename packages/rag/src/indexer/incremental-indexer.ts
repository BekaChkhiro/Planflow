import { execFile } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { FileScanner } from "../scanner/index.js";
import { CodeChunker } from "../chunker/index.js";
import { Embedder } from "../embedder/index.js";
import { VectorStore } from "../store/index.js";
import {
  IndexOptionsSchema,
  type CodeChunk,
  type EmbeddingRecord,
  type IndexOptions,
} from "../types.js";

const execFileAsync = promisify(execFile);

/** Git file change type */
type ChangeStatus = "A" | "M" | "D" | "R" | "C";

interface FileChange {
  status: ChangeStatus;
  path: string;
  /** Populated for renames — the old path */
  oldPath?: string;
}

/** Stats returned after an indexing run */
export interface IndexStats {
  mode: "full" | "incremental";
  filesScanned: number;
  filesIndexed: number;
  filesDeleted: number;
  chunksCreated: number;
  chunksDeleted: number;
  commitHash: string;
  durationMs: number;
}

/** Callback for reporting progress during indexing */
export type ProgressCallback = (event: ProgressEvent) => void;

export type ProgressEvent =
  | { stage: "scanning"; message: string }
  | { stage: "diffing"; message: string }
  | { stage: "chunking"; file: string; current: number; total: number }
  | { stage: "embedding"; current: number; total: number }
  | { stage: "storing"; current: number; total: number }
  | { stage: "deleting"; file: string }
  | { stage: "done"; stats: IndexStats };

const STATE_FILE = ".planflow-index-state.json";

interface IndexState {
  lastCommitHash: string;
  lastIndexedAt: string;
  rootDir: string;
  totalChunks: number;
}

/**
 * Orchestrates incremental codebase indexing.
 *
 * Uses `git diff` to detect changed files since the last indexed commit,
 * then only re-chunks and re-embeds the affected files. Falls back to a
 * full index when no prior state exists or `incremental` is false.
 */
export class IncrementalIndexer {
  constructor(
    private scanner: FileScanner,
    private chunker: CodeChunker,
    private embedder: Embedder,
    private store: VectorStore,
  ) {}

  /**
   * Index a codebase. When `incremental` is true (default) and a previous
   * index state exists, only changed files are re-indexed.
   */
  async index(
    rawOptions: { rootDir: string; include?: string[]; exclude?: string[]; incremental?: boolean },
    onProgress?: ProgressCallback,
  ): Promise<IndexStats> {
    const options = IndexOptionsSchema.parse(rawOptions);
    const start = Date.now();
    const rootDir = resolve(options.rootDir);
    const statePath = join(rootDir, STATE_FILE);

    // Make sure we're inside a git repository
    const headCommit = await this.getHeadCommit(rootDir);
    if (!headCommit) {
      throw new Error(
        "Not a git repository (or no commits yet). Incremental indexing requires git.",
      );
    }

    // Determine mode: incremental or full
    const prevState = options.incremental !== false
      ? await this.readState(statePath)
      : null;

    const canIncremental =
      prevState !== null &&
      prevState.rootDir === rootDir &&
      prevState.lastCommitHash !== headCommit;

    // Same commit — nothing to do
    if (prevState && prevState.lastCommitHash === headCommit) {
      const stats: IndexStats = {
        mode: "incremental",
        filesScanned: 0,
        filesIndexed: 0,
        filesDeleted: 0,
        chunksCreated: 0,
        chunksDeleted: 0,
        commitHash: headCommit,
        durationMs: Date.now() - start,
      };
      onProgress?.({ stage: "done", stats });
      return stats;
    }

    if (canIncremental) {
      return this.incrementalIndex(
        rootDir,
        headCommit,
        prevState!,
        statePath,
        options,
        onProgress,
        start,
      );
    }

    return this.fullIndex(rootDir, headCommit, statePath, options, onProgress, start);
  }

  // ── Full Index ──────────────────────────────────────────────────────

  private async fullIndex(
    rootDir: string,
    commitHash: string,
    statePath: string,
    options: IndexOptions,
    onProgress: ProgressCallback | undefined,
    start: number,
  ): Promise<IndexStats> {
    onProgress?.({ stage: "scanning", message: "Scanning files…" });

    const files = await this.scanner.scan();
    const codeFiles = files.filter((f) => f.language !== null);

    onProgress?.({
      stage: "scanning",
      message: `Found ${codeFiles.length} source files`,
    });

    // Chunk all files
    await this.chunker.init();
    const allChunks: CodeChunk[] = [];

    for (let i = 0; i < codeFiles.length; i++) {
      const file = codeFiles[i]!;
      onProgress?.({
        stage: "chunking",
        file: file.relativePath,
        current: i + 1,
        total: codeFiles.length,
      });

      const content = await readFile(file.path, "utf-8");
      const chunks = await this.chunker.chunk(
        content,
        file.relativePath,
        file.language!,
      );
      allChunks.push(...chunks);
    }

    // Embed all chunks in batches
    const records = await this.embedChunks(allChunks, onProgress);

    // Store all at once (overwrite existing table for full index)
    onProgress?.({ stage: "storing", current: 0, total: records.length });
    if (records.length > 0) {
      await this.store.upsert(records);
    }
    onProgress?.({ stage: "storing", current: records.length, total: records.length });

    // Persist state
    await this.writeState(statePath, {
      lastCommitHash: commitHash,
      lastIndexedAt: new Date().toISOString(),
      rootDir,
      totalChunks: records.length,
    });

    const stats: IndexStats = {
      mode: "full",
      filesScanned: codeFiles.length,
      filesIndexed: codeFiles.length,
      filesDeleted: 0,
      chunksCreated: records.length,
      chunksDeleted: 0,
      commitHash,
      durationMs: Date.now() - start,
    };
    onProgress?.({ stage: "done", stats });
    return stats;
  }

  // ── Incremental Index ───────────────────────────────────────────────

  private async incrementalIndex(
    rootDir: string,
    commitHash: string,
    prevState: IndexState,
    statePath: string,
    options: IndexOptions,
    onProgress: ProgressCallback | undefined,
    start: number,
  ): Promise<IndexStats> {
    onProgress?.({
      stage: "diffing",
      message: `Diffing ${prevState.lastCommitHash.slice(0, 7)}..${commitHash.slice(0, 7)}`,
    });

    const changes = await this.getChangedFiles(
      rootDir,
      prevState.lastCommitHash,
      commitHash,
    );

    // Filter to supported languages and respect include/exclude
    const relevantChanges = changes.filter((c) => {
      if (c.status === "D") {
        // Always process deletes to clean up the store
        return FileScanner.detectLanguage(c.path) !== null;
      }
      return FileScanner.detectLanguage(c.path) !== null;
    });

    onProgress?.({
      stage: "diffing",
      message: `${relevantChanges.length} file(s) changed (${changes.length} total in diff)`,
    });

    if (relevantChanges.length === 0) {
      await this.writeState(statePath, {
        ...prevState,
        lastCommitHash: commitHash,
        lastIndexedAt: new Date().toISOString(),
      });

      const stats: IndexStats = {
        mode: "incremental",
        filesScanned: 0,
        filesIndexed: 0,
        filesDeleted: 0,
        chunksCreated: 0,
        chunksDeleted: 0,
        commitHash,
        durationMs: Date.now() - start,
      };
      onProgress?.({ stage: "done", stats });
      return stats;
    }

    // Split into files to delete and files to (re)index
    const toDelete = relevantChanges.filter((c) => c.status === "D");
    const toIndex = relevantChanges.filter((c) => c.status !== "D");

    // For renames, also delete the old path
    const renames = relevantChanges.filter(
      (c) => c.status === "R" && c.oldPath,
    );

    let chunksDeleted = 0;

    // Delete removed/renamed-from files from store
    for (const change of toDelete) {
      onProgress?.({ stage: "deleting", file: change.path });
      await this.store.deleteByFile(change.path);
      chunksDeleted++;
    }

    for (const change of renames) {
      onProgress?.({ stage: "deleting", file: change.oldPath! });
      await this.store.deleteByFile(change.oldPath!);
      chunksDeleted++;
    }

    // For modified files, delete old chunks before re-indexing
    for (const change of toIndex.filter((c) => c.status === "M")) {
      await this.store.deleteByFile(change.path);
    }

    // Chunk changed files
    await this.chunker.init();
    const allChunks: CodeChunk[] = [];
    let filesIndexed = 0;

    for (let i = 0; i < toIndex.length; i++) {
      const change = toIndex[i]!;
      const absPath = join(rootDir, change.path);

      onProgress?.({
        stage: "chunking",
        file: change.path,
        current: i + 1,
        total: toIndex.length,
      });

      // File might not exist if it was in the diff but deleted in a later commit
      try {
        await access(absPath);
      } catch {
        continue;
      }

      const language = FileScanner.detectLanguage(change.path);
      if (!language) continue;

      const content = await readFile(absPath, "utf-8");
      if (!content.trim()) continue;

      const chunks = await this.chunker.chunk(content, change.path, language);
      allChunks.push(...chunks);
      filesIndexed++;
    }

    // Embed and store
    const records = await this.embedChunks(allChunks, onProgress);

    if (records.length > 0) {
      onProgress?.({ stage: "storing", current: 0, total: records.length });
      await this.store.upsert(records);
      onProgress?.({
        stage: "storing",
        current: records.length,
        total: records.length,
      });
    }

    // Update state
    await this.writeState(statePath, {
      lastCommitHash: commitHash,
      lastIndexedAt: new Date().toISOString(),
      rootDir,
      totalChunks: prevState.totalChunks - chunksDeleted + records.length,
    });

    const stats: IndexStats = {
      mode: "incremental",
      filesScanned: relevantChanges.length,
      filesIndexed,
      filesDeleted: toDelete.length + renames.length,
      chunksCreated: records.length,
      chunksDeleted,
      commitHash,
      durationMs: Date.now() - start,
    };
    onProgress?.({ stage: "done", stats });
    return stats;
  }

  // ── Shared Helpers ──────────────────────────────────────────────────

  /** Embed an array of code chunks and return EmbeddingRecords */
  private async embedChunks(
    chunks: CodeChunk[],
    onProgress?: ProgressCallback,
  ): Promise<EmbeddingRecord[]> {
    if (chunks.length === 0) return [];

    const texts = chunks.map((c) => c.content);
    const records: EmbeddingRecord[] = [];

    // Embed in batches — the Embedder handles internal batching,
    // but we track progress at the chunk level
    onProgress?.({ stage: "embedding", current: 0, total: chunks.length });
    const vectors = await this.embedder.embed(texts);
    onProgress?.({
      stage: "embedding",
      current: chunks.length,
      total: chunks.length,
    });

    const now = new Date().toISOString();
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      records.push({
        id: chunk.id,
        vector: vectors[i]!,
        content: chunk.content,
        metadata: {
          filePath: chunk.filePath,
          kind: chunk.kind,
          name: chunk.name,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          source: "code",
          indexedAt: now,
        },
      });
    }

    return records;
  }

  // ── Git Operations ──────────────────────────────────────────────────

  /** Get the current HEAD commit hash */
  private async getHeadCommit(rootDir: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: rootDir },
      );
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get list of changed files between two commits using `git diff --name-status`.
   * Handles renames (R status) by tracking both old and new paths.
   */
  private async getChangedFiles(
    rootDir: string,
    fromCommit: string,
    toCommit: string,
  ): Promise<FileChange[]> {
    const { stdout } = await execFileAsync(
      "git",
      [
        "diff",
        "--name-status",
        "-M",           // detect renames
        fromCommit,
        toCommit,
      ],
      { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 },
    );

    const changes: FileChange[] = [];

    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;

      const parts = line.split("\t");
      const statusCol = parts[0];
      if (!statusCol) continue;
      const rawStatus = statusCol.charAt(0) as ChangeStatus;

      if (rawStatus === "R" || rawStatus === "C") {
        // Rename or Copy: status\told_path\tnew_path
        changes.push({
          status: rawStatus,
          path: parts[2] ?? parts[1]!,
          oldPath: parts[1],
        });
      } else {
        // Add, Modify, Delete: status\tpath
        changes.push({
          status: rawStatus,
          path: parts[1] ?? "",
        });
      }
    }

    return changes;
  }

  // ── State Persistence ───────────────────────────────────────────────

  private async readState(statePath: string): Promise<IndexState | null> {
    try {
      const raw = await readFile(statePath, "utf-8");
      const state = JSON.parse(raw) as IndexState;
      if (!state.lastCommitHash || !state.rootDir) return null;
      return state;
    } catch {
      return null;
    }
  }

  private async writeState(
    statePath: string,
    state: IndexState,
  ): Promise<void> {
    await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  }
}
