import { describe, it, expect, vi, afterEach } from "vitest";
import { DocsIndexer } from "../indexer/docs-indexer.js";
import type { DocsProgressEvent } from "../indexer/docs-indexer.js";

// ── Helpers ──────────────────────────────────────────────────────────

function mockFetchResponse(body: string, opts?: { status?: number; contentType?: string }) {
  return {
    ok: (opts?.status ?? 200) < 400,
    status: opts?.status ?? 200,
    headers: new Map([["content-type", opts?.contentType ?? "text/html"]]),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
  };
}

function makeMockEmbedder() {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
    ),
    embedOne: vi.fn(async () => new Float32Array([0.1, 0.2, 0.3])),
  };
}

function makeMockStore() {
  return {
    init: vi.fn(),
    upsert: vi.fn(),
    deleteByFile: vi.fn(),
    search: vi.fn(),
    count: vi.fn(),
    scan: vi.fn(),
    close: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("DocsIndexer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("resolveUrls", () => {
    it("returns a single URL as-is", async () => {
      const indexer = new DocsIndexer();
      const urls = await indexer.resolveUrls("https://docs.example.com/guide");
      expect(urls).toEqual(["https://docs.example.com/guide"]);
    });

    it("fetches and parses llms.txt URL", async () => {
      const llmsContent = `# Example Docs
> Documentation for Example

## API Reference
- [Getting Started](https://docs.example.com/start): Intro guide
- [API Reference](https://docs.example.com/api): Full API docs
`;
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse(llmsContent, { contentType: "text/plain" }),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer();
      const urls = await indexer.resolveUrls("https://example.com/llms.txt");

      expect(urls).toContain("https://docs.example.com/start");
      expect(urls).toContain("https://docs.example.com/api");
    });

    it("parses raw llms.txt content (multi-line URLs)", async () => {
      const indexer = new DocsIndexer();
      const content = `https://docs.example.com/page1
https://docs.example.com/page2
https://docs.example.com/page3`;

      const urls = await indexer.resolveUrls(content);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe("https://docs.example.com/page1");
    });

    it("throws on unresolvable source", async () => {
      const indexer = new DocsIndexer();
      await expect(indexer.resolveUrls("not a url")).rejects.toThrow(
        "unable to resolve source",
      );
    });
  });

  describe("extractUrlsFromLlmsTxt", () => {
    it("extracts markdown links", () => {
      const indexer = new DocsIndexer();
      const content = `# Title
> Description

## Docs
- [Guide](https://example.com/guide): User guide
- [API](/api): API reference
`;
      const urls = indexer.extractUrlsFromLlmsTxt(content, "https://example.com/llms.txt");

      expect(urls).toContain("https://example.com/guide");
      expect(urls).toContain("https://example.com/api"); // relative resolved
    });

    it("extracts bare URLs", () => {
      const indexer = new DocsIndexer();
      const content = `# Title
https://example.com/page1
- https://example.com/page2
`;
      const urls = indexer.extractUrlsFromLlmsTxt(content, "https://example.com/llms.txt");
      expect(urls).toContain("https://example.com/page1");
      expect(urls).toContain("https://example.com/page2");
    });

    it("skips headings and blockquotes", () => {
      const indexer = new DocsIndexer();
      const content = `# https://should-not-match.com
> https://also-should-not-match.com
https://this-should-match.com
`;
      const urls = indexer.extractUrlsFromLlmsTxt(content, "https://example.com/llms.txt");
      expect(urls).toEqual(["https://this-should-match.com/"]);
    });

    it("deduplicates URLs", () => {
      const indexer = new DocsIndexer();
      const content = `
- [Page](https://example.com/page)
- https://example.com/page
`;
      const urls = indexer.extractUrlsFromLlmsTxt(content, "https://example.com/llms.txt");
      expect(urls).toHaveLength(1);
    });
  });

  describe("fetchPage", () => {
    it("returns page content on success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse("# Hello World"),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer();
      const content = await indexer.fetchPage("https://example.com/page");
      expect(content).toBe("# Hello World");
    });

    it("returns null on HTTP error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse("Not Found", { status: 404 }),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer();
      const content = await indexer.fetchPage("https://example.com/missing");
      expect(content).toBeNull();
    });

    it("returns null on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new TypeError("fetch failed"),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer();
      const content = await indexer.fetchPage("https://unreachable.test");
      expect(content).toBeNull();
    });
  });

  describe("toMarkdown", () => {
    it("returns Markdown content as-is", () => {
      const indexer = new DocsIndexer();
      const md = "# Title\n\nSome **bold** text.";
      expect(indexer.toMarkdown(md, "https://x.com")).toBe(md);
    });

    it("converts HTML to Markdown", () => {
      const indexer = new DocsIndexer();
      const html = `<!DOCTYPE html>
<html><body>
<h1>Title</h1>
<p>Hello <strong>world</strong></p>
<h2>Section</h2>
<p>Some text with a <a href="https://example.com">link</a>.</p>
</body></html>`;

      const result = indexer.toMarkdown(html, "https://x.com");

      expect(result).toContain("# Title");
      expect(result).toContain("**world**");
      expect(result).toContain("## Section");
      expect(result).toContain("[link](https://example.com)");
    });
  });

  describe("htmlToMarkdown", () => {
    it("strips script and style tags", () => {
      const indexer = new DocsIndexer();
      const html = `<html><head><style>body{color:red}</style></head>
<body><script>alert('x')</script><p>Content</p></body></html>`;

      const result = indexer.htmlToMarkdown(html);
      expect(result).not.toContain("alert");
      expect(result).not.toContain("color:red");
      expect(result).toContain("Content");
    });

    it("converts code blocks", () => {
      const indexer = new DocsIndexer();
      const html = `<pre><code>const x = 1;</code></pre>`;
      const result = indexer.htmlToMarkdown(html);
      expect(result).toContain("```");
      expect(result).toContain("const x = 1;");
    });

    it("converts inline code", () => {
      const indexer = new DocsIndexer();
      const html = `<p>Use <code>npm install</code> to install.</p>`;
      const result = indexer.htmlToMarkdown(html);
      expect(result).toContain("`npm install`");
    });

    it("converts lists", () => {
      const indexer = new DocsIndexer();
      const html = `<ul><li>First</li><li>Second</li></ul>`;
      const result = indexer.htmlToMarkdown(html);
      expect(result).toContain("- First");
      expect(result).toContain("- Second");
    });

    it("decodes HTML entities", () => {
      const indexer = new DocsIndexer();
      const html = `<p>&amp; &lt; &gt; &quot; &#39; &nbsp;</p>`;
      const result = indexer.htmlToMarkdown(html);
      expect(result).toContain("& < > \"");
    });

    it("strips nav, footer, header", () => {
      const indexer = new DocsIndexer();
      const html = `<nav>Navigation</nav><p>Content</p><footer>Footer</footer>`;
      const result = indexer.htmlToMarkdown(html);
      expect(result).not.toContain("Navigation");
      expect(result).not.toContain("Footer");
      expect(result).toContain("Content");
    });
  });

  describe("chunkMarkdown", () => {
    it("splits by headings", () => {
      const indexer = new DocsIndexer();
      const md = `# Main Title

Introduction paragraph with enough text to pass the minimum chunk length threshold.

## Getting Started

Getting started content goes here and needs to be long enough to qualify as a chunk.

## API Reference

API reference content that is sufficiently long to meet the minimum chunk length requirements.
`;
      const chunks = indexer.chunkMarkdown(md, "https://docs.example.com/guide");

      expect(chunks.length).toBe(3);
      expect(chunks[0]!.title).toBe("Main Title");
      expect(chunks[0]!.section).toBeNull();
      expect(chunks[1]!.section).toBe("Getting Started");
      expect(chunks[2]!.section).toBe("API Reference");
    });

    it("generates deterministic IDs", () => {
      const indexer = new DocsIndexer();
      const md = "# Title\n\nContent that is long enough to meet the minimum length for chunking.";

      const chunks1 = indexer.chunkMarkdown(md, "https://example.com");
      const chunks2 = indexer.chunkMarkdown(md, "https://example.com");

      expect(chunks1[0]!.id).toBe(chunks2[0]!.id);
    });

    it("skips chunks below minimum length", () => {
      const indexer = new DocsIndexer();
      const md = `# Title

Short.

## Section

This section has enough content to pass the minimum chunk length threshold for indexing.
`;
      const chunks = indexer.chunkMarkdown(md, "https://example.com");
      // "Short." is below MIN_CHUNK_LENGTH, so only the second section should survive
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.section).toBe("Section");
    });

    it("sets source URL on all chunks", () => {
      const indexer = new DocsIndexer();
      const md = "# Title\n\nSome content that is long enough to pass the minimum chunk length threshold.";
      const url = "https://docs.example.com/page";

      const chunks = indexer.chunkMarkdown(md, url);
      expect(chunks.every((c) => c.source === url)).toBe(true);
    });
  });

  describe("index", () => {
    it("fetches and chunks a single URL", async () => {
      const markdown = `# Test Docs

This is an introduction that is long enough to be a valid chunk.

## Installation

Installation instructions that are also long enough to be a valid chunk for testing.
`;
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse(markdown, { contentType: "text/markdown" }),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer();
      const chunks = await indexer.index("https://docs.example.com/guide");

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]!.source).toBe("https://docs.example.com/guide");
    });

    it("reports progress events", async () => {
      const markdown = "# Docs\n\nContent that is long enough to pass the minimum chunk length threshold for indexing.";
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse(markdown, { contentType: "text/markdown" }),
      ) as unknown as typeof fetch;

      const events: DocsProgressEvent[] = [];
      const indexer = new DocsIndexer();
      await indexer.index("https://example.com/page", (e) => events.push(e));

      expect(events.some((e) => e.stage === "fetching")).toBe(true);
      expect(events.some((e) => e.stage === "chunking")).toBe(true);
    });

    it("handles fetch failures gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse("", { status: 500 }),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer();
      const chunks = await indexer.index("https://example.com/failing");
      expect(chunks).toEqual([]);
    });
  });

  describe("indexAndStore", () => {
    it("embeds and stores chunks", async () => {
      const markdown = `# API Guide

This introduction is long enough to qualify as a chunk for the docs indexer.

## Authentication

Authentication section content is also long enough to pass the threshold.
`;
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse(markdown, { contentType: "text/markdown" }),
      ) as unknown as typeof fetch;

      const embedder = makeMockEmbedder();
      const store = makeMockStore();

      const indexer = new DocsIndexer({
        embedder: embedder as any,
        store: store as any,
      });

      const stats = await indexer.indexAndStore("https://example.com/api");

      expect(embedder.embed).toHaveBeenCalledOnce();
      expect(store.upsert).toHaveBeenCalledOnce();
      expect(stats.chunksCreated).toBeGreaterThan(0);
      expect(stats.pagesIndexed).toBe(1);

      // Verify stored records have source="docs"
      const records = store.upsert.mock.calls[0]![0];
      expect(records[0].metadata.source).toBe("docs");
      expect(records[0].metadata.kind).toBe("docs");
    });

    it("throws without embedder/store", async () => {
      const indexer = new DocsIndexer();
      await expect(
        indexer.indexAndStore("https://example.com"),
      ).rejects.toThrow("embedder and store are required");
    });

    it("reports progress events through full pipeline", async () => {
      const markdown = "# Docs\n\nContent that is long enough to pass the minimum chunk length threshold for the indexer.";
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse(markdown, { contentType: "text/markdown" }),
      ) as unknown as typeof fetch;

      const events: DocsProgressEvent[] = [];
      const indexer = new DocsIndexer({
        embedder: makeMockEmbedder() as any,
        store: makeMockStore() as any,
      });

      await indexer.indexAndStore("https://example.com/docs", (e) => events.push(e));

      const stages = events.map((e) => e.stage);
      expect(stages).toContain("fetching");
      expect(stages).toContain("chunking");
      expect(stages).toContain("embedding");
      expect(stages).toContain("storing");
      expect(stages).toContain("done");
    });

    it("handles zero chunks (empty page)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse("", { status: 404 }),
      ) as unknown as typeof fetch;

      const indexer = new DocsIndexer({
        embedder: makeMockEmbedder() as any,
        store: makeMockStore() as any,
      });

      const stats = await indexer.indexAndStore("https://example.com/empty");
      expect(stats.chunksCreated).toBe(0);
      expect(stats.pagesIndexed).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("extractUrlFromLine returns null for non-URL text", () => {
      const indexer = new DocsIndexer();
      // Access private method via any
      const result = (indexer as any).extractUrlFromLine("just plain text, no URL");
      expect(result).toBeNull();
    });

    it("extractLinkFromLine returns null for non-link text", () => {
      const indexer = new DocsIndexer();
      const result = (indexer as any).extractLinkFromLine("no links here");
      expect(result).toBeNull();
    });

    it("titleFromUrl handles invalid URLs gracefully", () => {
      const indexer = new DocsIndexer();
      const result = (indexer as any).titleFromUrl("not-a-valid-url");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("titleFromUrl extracts last segment from path", () => {
      const indexer = new DocsIndexer();
      const result = (indexer as any).titleFromUrl("https://docs.example.com/getting-started");
      expect(result).toBe("getting started");
    });
  });

  describe("deleteBySource", () => {
    it("delegates to store.deleteByFile", async () => {
      const store = makeMockStore();
      const indexer = new DocsIndexer({ store: store as any });

      await indexer.deleteBySource("https://example.com/old-docs");
      expect(store.deleteByFile).toHaveBeenCalledWith("https://example.com/old-docs");
    });

    it("throws without store", async () => {
      const indexer = new DocsIndexer();
      await expect(
        indexer.deleteBySource("https://example.com"),
      ).rejects.toThrow("store is required");
    });
  });
});
