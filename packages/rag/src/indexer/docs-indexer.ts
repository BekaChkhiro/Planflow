import { createHash } from "node:crypto";
import type { DocChunk, EmbedderConfig, EmbeddingRecord } from "../types.js";
import { Embedder } from "../embedder/index.js";
import { VectorStore } from "../store/index.js";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 50;
const MAX_PAGE_BYTES = 2 * 1024 * 1024; // 2 MB per page
const MIN_CHUNK_LENGTH = 50; // Skip tiny sections

/** Stats returned after a docs indexing run */
export interface DocsIndexStats {
  pagesIndexed: number;
  chunksCreated: number;
  durationMs: number;
  sources: string[];
}

/** Callback for reporting docs indexing progress */
export type DocsProgressCallback = (event: DocsProgressEvent) => void;

export type DocsProgressEvent =
  | { stage: "fetching"; url: string; current: number; total: number }
  | { stage: "chunking"; url: string; chunks: number }
  | { stage: "embedding"; current: number; total: number }
  | { stage: "storing"; current: number; total: number }
  | { stage: "done"; stats: DocsIndexStats };

/**
 * Crawls and indexes external documentation from URLs or llms.txt files.
 *
 * Supports:
 * - Direct URLs (HTML or Markdown content)
 * - llms.txt files (standard format listing documentation URLs)
 * - Multiple URLs in a single call
 *
 * Produces DocChunk[] split by Markdown headings, ready for embedding.
 */
export class DocsIndexer {
  private embedder: Embedder | null = null;
  private store: VectorStore | null = null;

  constructor(opts?: { embedder?: Embedder; store?: VectorStore }) {
    this.embedder = opts?.embedder ?? null;
    this.store = opts?.store ?? null;
  }

  /**
   * Index documentation from a URL or llms.txt source.
   * If `source` ends with `llms.txt` or contains a list of URLs,
   * each discovered page is fetched and chunked.
   *
   * Returns the generated DocChunks (without embedding/storing).
   */
  async index(
    source: string,
    onProgress?: DocsProgressCallback,
  ): Promise<DocChunk[]> {
    const urls = await this.resolveUrls(source);

    const allChunks: DocChunk[] = [];

    const pageCount = Math.min(urls.length, MAX_PAGES);
    for (let i = 0; i < pageCount; i++) {
      const url = urls[i]!;
      onProgress?.({ stage: "fetching", url, current: i + 1, total: pageCount });

      const content = await this.fetchPage(url);
      if (!content) continue;

      const markdown = this.toMarkdown(content, url);
      const chunks = this.chunkMarkdown(markdown, url);

      onProgress?.({ stage: "chunking", url, chunks: chunks.length });
      allChunks.push(...chunks);
    }

    return allChunks;
  }

  /**
   * Index documentation and embed+store the chunks.
   * Requires embedder and store to be provided in the constructor.
   */
  async indexAndStore(
    source: string,
    onProgress?: DocsProgressCallback,
  ): Promise<DocsIndexStats> {
    if (!this.embedder || !this.store) {
      throw new Error(
        "DocsIndexer: embedder and store are required for indexAndStore(). Pass them in the constructor.",
      );
    }

    const start = Date.now();
    const chunks = await this.index(source, onProgress);

    if (chunks.length === 0) {
      const stats: DocsIndexStats = {
        pagesIndexed: 0,
        chunksCreated: 0,
        durationMs: Date.now() - start,
        sources: [],
      };
      onProgress?.({ stage: "done", stats });
      return stats;
    }

    // Embed
    const texts = chunks.map((c) => c.content);
    onProgress?.({ stage: "embedding", current: 0, total: texts.length });
    const vectors = await this.embedder.embed(texts);
    onProgress?.({ stage: "embedding", current: texts.length, total: texts.length });

    // Build records
    const now = new Date().toISOString();
    const records: EmbeddingRecord[] = chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: vectors[i]!,
      content: chunk.content,
      metadata: {
        filePath: chunk.source,
        kind: "docs",
        name: chunk.title,
        language: "markdown",
        startLine: 0,
        endLine: 0,
        source: "docs" as const,
        indexedAt: now,
      },
    }));

    // Store
    onProgress?.({ stage: "storing", current: 0, total: records.length });
    await this.store.upsert(records);
    onProgress?.({ stage: "storing", current: records.length, total: records.length });

    const sources = [...new Set(chunks.map((c) => c.source))];
    const stats: DocsIndexStats = {
      pagesIndexed: sources.length,
      chunksCreated: records.length,
      durationMs: Date.now() - start,
      sources,
    };
    onProgress?.({ stage: "done", stats });
    return stats;
  }

  /**
   * Delete all indexed docs for a given source URL from the store.
   */
  async deleteBySource(sourceUrl: string): Promise<void> {
    if (!this.store) {
      throw new Error("DocsIndexer: store is required for deleteBySource()");
    }
    await this.store.deleteByFile(sourceUrl);
  }

  // ── URL Resolution ──────────────────────────────────────────────────

  /**
   * Resolve the input source to a list of URLs to fetch.
   * - If the source looks like an llms.txt URL, fetch and parse it
   * - If the source is a single URL, return it as-is
   */
  async resolveUrls(source: string): Promise<string[]> {
    const trimmed = source.trim();

    // Check if this is an llms.txt URL
    if (this.isLlmsTxt(trimmed)) {
      return this.parseLlmsTxt(trimmed);
    }

    // Could be raw multi-line content with URLs
    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 1) {
      const urls = lines
        .map((l) => this.extractUrlFromLine(l))
        .filter((u): u is string => u !== null);
      if (urls.length > 0) return urls;
    }

    // Single URL
    if (this.isUrl(trimmed)) {
      return [trimmed];
    }

    throw new Error(
      `DocsIndexer: unable to resolve source "${trimmed.slice(0, 100)}". ` +
        "Provide a URL, an llms.txt URL, or raw llms.txt content.",
    );
  }

  // ── Fetching ────────────────────────────────────────────────────────

  /** Fetch a single page, returning the body text. Returns null on failure. */
  async fetchPage(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "PlanFlow-DocsIndexer/1.0",
          Accept: "text/html, text/markdown, text/plain, */*",
        },
        redirect: "follow",
      });

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") ?? "";
      const buffer = await response.arrayBuffer();

      if (buffer.byteLength > MAX_PAGE_BYTES) return null;

      // Only process text-based content
      if (
        contentType.includes("text/") ||
        contentType.includes("application/json") ||
        contentType.includes("application/xml") ||
        contentType.includes("application/xhtml")
      ) {
        return new TextDecoder().decode(buffer);
      }

      // Default: try to decode as text
      return new TextDecoder().decode(buffer);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Content Conversion ──────────────────────────────────────────────

  /**
   * Convert fetched content to Markdown.
   * If the content looks like HTML, strip tags and preserve structure.
   * If it's already Markdown or plain text, return as-is.
   */
  toMarkdown(content: string, _url: string): string {
    const trimmed = content.trim();

    if (this.isHtml(trimmed)) {
      return this.htmlToMarkdown(trimmed);
    }

    return trimmed;
  }

  /** Basic HTML → Markdown conversion */
  htmlToMarkdown(html: string): string {
    let text = html;

    // Remove script and style blocks entirely
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    text = text.replace(/<header[\s\S]*?<\/header>/gi, "");

    // Convert headings
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
    text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n");
    text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n");

    // Convert code blocks
    text = text.replace(
      /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
      "\n```\n$1\n```\n",
    );
    text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

    // Convert links
    text = text.replace(
      /<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      "[$2]($1)",
    );

    // Convert emphasis
    text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
    text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");

    // Convert lists
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
    text = text.replace(/<\/?[ou]l[^>]*>/gi, "\n");

    // Convert paragraphs and line breaks
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<hr\s*\/?>/gi, "\n---\n");

    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, "");

    // Decode common HTML entities
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    text = text.replace(/&#(\d+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10)),
    );

    // Clean up excessive whitespace
    text = text.replace(/\n{3,}/g, "\n\n");
    text = text.replace(/[ \t]+/g, " ");

    return text.trim();
  }

  // ── Markdown Chunking ───────────────────────────────────────────────

  /**
   * Split Markdown content into chunks by headings (h1-h4).
   * Each chunk contains the heading + its content until the next heading.
   */
  chunkMarkdown(markdown: string, sourceUrl: string): DocChunk[] {
    const lines = markdown.split("\n");
    const chunks: DocChunk[] = [];

    let currentTitle = this.titleFromUrl(sourceUrl);
    let currentSection: string | null = null;
    let currentLines: string[] = [];

    const flush = () => {
      const content = currentLines.join("\n").trim();
      if (content.length >= MIN_CHUNK_LENGTH) {
        chunks.push({
          id: this.chunkId(sourceUrl, currentSection ?? currentTitle, content),
          source: sourceUrl,
          title: currentTitle,
          content,
          section: currentSection,
        });
      }
      currentLines = [];
    };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+)/);

      if (headingMatch) {
        // Flush the previous section
        flush();

        const level = headingMatch[1]!.length;
        const heading = headingMatch[2]!.trim();

        if (level === 1) {
          currentTitle = heading;
          currentSection = null;
        } else {
          currentSection = heading;
        }

        currentLines.push(line);
      } else {
        currentLines.push(line);
      }
    }

    // Flush remaining content
    flush();

    return chunks;
  }

  // ── llms.txt Parsing ────────────────────────────────────────────────

  /**
   * Fetch and parse an llms.txt file.
   *
   * The llms.txt standard format:
   *   # Title
   *   > Description
   *   Optional preamble text
   *   ## Section
   *   - [Link text](url): description
   *   - url
   *
   * Returns a list of discovered documentation URLs.
   */
  async parseLlmsTxt(url: string): Promise<string[]> {
    const content = await this.fetchPage(url);
    if (!content) {
      throw new Error(`DocsIndexer: failed to fetch llms.txt from ${url}`);
    }

    return this.extractUrlsFromLlmsTxt(content, url);
  }

  /** Extract URLs from llms.txt content */
  extractUrlsFromLlmsTxt(content: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const base = new URL(baseUrl);

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) {
        continue;
      }

      const raw = this.extractLinkFromLine(trimmed);
      if (raw) {
        // Resolve relative URLs against the base
        try {
          const resolved = new URL(raw, base).href;
          urls.push(resolved);
        } catch {
          // Skip invalid URLs
        }
      }
    }

    return [...new Set(urls)]; // Deduplicate
  }

  // ── Utility Methods ─────────────────────────────────────────────────

  /** Check if a string looks like HTML */
  private isHtml(content: string): boolean {
    return (
      content.startsWith("<!") ||
      content.startsWith("<html") ||
      content.startsWith("<HTML") ||
      /<html[\s>]/i.test(content.slice(0, 500))
    );
  }

  /** Check if a string is a URL */
  private isUrl(str: string): boolean {
    return /^https?:\/\/\S+/i.test(str);
  }

  /** Check if a URL points to an llms.txt file */
  private isLlmsTxt(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.pathname.endsWith("llms.txt") ||
             parsed.pathname.endsWith("llms-full.txt");
    } catch {
      return false;
    }
  }

  /** Extract an absolute URL from a line of text (Markdown link or bare URL) */
  private extractUrlFromLine(line: string): string | null {
    // Markdown link: [text](https://...)
    const mdMatch = line.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) return mdMatch[1]!;

    // Bare URL (possibly prefixed with - or *)
    const bareMatch = line.match(/(https?:\/\/[^\s),]+)/);
    if (bareMatch) return bareMatch[1]!;

    return null;
  }

  /** Extract a link (absolute or relative) from a line of text */
  private extractLinkFromLine(line: string): string | null {
    // Markdown link: [text](url) — captures any href including relative paths
    const mdMatch = line.match(/\[.*?\]\(([^\s)]+)\)/);
    if (mdMatch) return mdMatch[1]!;

    // Bare URL (possibly prefixed with - or *)
    const bareMatch = line.match(/(https?:\/\/[^\s),]+)/);
    if (bareMatch) return bareMatch[1]!;

    return null;
  }

  /** Generate a title from a URL */
  private titleFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/$/, "");
      const lastSegment = path.split("/").pop() ?? parsed.hostname;
      return lastSegment
        .replace(/[-_]/g, " ")
        .replace(/\.\w+$/, "")
        .trim() || parsed.hostname;
    } catch {
      return url.slice(0, 60);
    }
  }

  /** Generate a deterministic chunk ID from source + section + content */
  private chunkId(source: string, section: string, content: string): string {
    const input = `docs:${source}:${section}:${content.slice(0, 200)}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }
}
