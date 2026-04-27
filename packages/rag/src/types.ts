import { z } from "zod";

/** Supported programming languages for Tree-sitter parsing */
export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "c"
  | "cpp"
  | "ruby"
  | "php";

/** A file discovered by the scanner */
export interface ScannedFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage | null;
  sizeBytes: number;
  lastModified: Date;
}

/** A code chunk extracted by Tree-sitter */
export interface CodeChunk {
  id: string;
  filePath: string;
  language: SupportedLanguage;
  kind: "function" | "class" | "method" | "module" | "interface" | "type" | "block";
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  parentName: string | null;
}

/** A document chunk for non-code files (markdown, text) */
export interface DocChunk {
  id: string;
  source: string;
  title: string;
  content: string;
  section: string | null;
}

/** A vector embedding with metadata */
export interface EmbeddingRecord {
  id: string;
  vector: Float32Array;
  content: string;
  metadata: ChunkMetadata;
}

/** Metadata stored alongside each vector */
export interface ChunkMetadata {
  filePath: string;
  kind: string;
  name: string;
  language: string;
  startLine: number;
  endLine: number;
  source: "code" | "docs";
  indexedAt: string;
}

/** Search result returned by the hybrid search engine */
export interface SearchResult {
  chunk: CodeChunk | DocChunk;
  score: number;
  source: "vector" | "keyword" | "hybrid";
}

/** Options for indexing a codebase */
export const IndexOptionsSchema = z.object({
  rootDir: z.string(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  incremental: z.boolean().default(true),
});

export type IndexOptions = z.infer<typeof IndexOptionsSchema>;

/** Options for searching the index */
export const SearchOptionsSchema = z.object({
  query: z.string(),
  limit: z.number().int().positive().default(10),
  language: z.string().optional(),
  kind: z.string().optional(),
  source: z.enum(["code", "docs", "all"]).default("all"),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

/** Configuration for the embedding provider */
export interface EmbedderConfig {
  apiUrl: string;
  apiToken: string;
  model: string;
  batchSize: number;
  dimensions: number;
}
