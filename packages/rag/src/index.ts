// Core types
export type {
  SupportedLanguage,
  ScannedFile,
  CodeChunk,
  DocChunk,
  EmbeddingRecord,
  ChunkMetadata,
  SearchResult,
  IndexOptions,
  SearchOptions,
  EmbedderConfig,
} from "./types.js";

export { IndexOptionsSchema, SearchOptionsSchema } from "./types.js";

// Modules
export { FileScanner } from "./scanner/index.js";
export { CodeChunker, type CodeChunkerOptions } from "./chunker/index.js";
export { Embedder, EmbedderError } from "./embedder/index.js";
export { VectorStore } from "./store/index.js";
export { HybridSearch } from "./search/index.js";
export {
  DocsIndexer,
  type DocsIndexStats,
  type DocsProgressCallback,
  type DocsProgressEvent,
} from "./indexer/index.js";
export {
  IncrementalIndexer,
  type IndexStats,
  type ProgressCallback,
  type ProgressEvent,
} from "./indexer/index.js";
