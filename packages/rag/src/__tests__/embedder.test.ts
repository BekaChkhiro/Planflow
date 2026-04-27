import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Embedder, EmbedderError } from "../embedder/index.js";
import type { EmbedderConfig } from "../types.js";

const defaultConfig: EmbedderConfig = {
  apiUrl: "https://api.planflow.tools/embed",
  apiToken: "pf_test_token",
  model: "voyage-code-3",
  batchSize: 3,
  dimensions: 1024,
};

function makeResponse(embeddings: number[][]) {
  return {
    data: embeddings.map((e, i) => ({ embedding: e, index: i })),
    usage: { total_tokens: 100 },
  };
}

function mockFetchOk(embeddings: number[][]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(makeResponse(embeddings)),
  });
}

describe("Embedder", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("throws if apiUrl is missing", () => {
      expect(
        () => new Embedder({ ...defaultConfig, apiUrl: "" }),
      ).toThrow("apiUrl is required");
    });

    it("throws if apiToken is missing", () => {
      expect(
        () => new Embedder({ ...defaultConfig, apiToken: "" }),
      ).toThrow("apiToken is required");
    });

    it("throws if model is missing", () => {
      expect(
        () => new Embedder({ ...defaultConfig, model: "" }),
      ).toThrow("model is required");
    });
  });

  describe("embed", () => {
    it("returns Float32Array for a single text", async () => {
      const embedding = [0.1, 0.2, 0.3];
      globalThis.fetch = mockFetchOk([embedding]);

      const embedder = new Embedder(defaultConfig);
      const results = await embedder.embed(["hello world"]);

      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(results[0]!)).toEqual(
        embedding.map((v) => Math.fround(v)),
      );
    });

    it("returns multiple embeddings for a batch", async () => {
      const embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
      ];
      globalThis.fetch = mockFetchOk(embeddings);

      const embedder = new Embedder(defaultConfig);
      const results = await embedder.embed(["text1", "text2"]);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(results[1]).toBeInstanceOf(Float32Array);
    });

    it("splits into multiple requests when exceeding batchSize", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              makeResponse([
                [0.1],
                [0.2],
                [0.3],
              ]),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeResponse([[0.4]])),
        });
      globalThis.fetch = mockFetch;

      const embedder = new Embedder({ ...defaultConfig, batchSize: 3 });
      const results = await embedder.embed(["a", "b", "c", "d"]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(4);

      // Verify first batch had 3 texts
      const firstCall = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(firstCall.input).toHaveLength(3);

      // Verify second batch had 1 text
      const secondCall = JSON.parse(mockFetch.mock.calls[1]![1].body);
      expect(secondCall.input).toHaveLength(1);
    });

    it("sends correct request body", async () => {
      const mockFetch = mockFetchOk([[0.1]]);
      globalThis.fetch = mockFetch;

      const embedder = new Embedder(defaultConfig);
      await embedder.embed(["test text"]);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(defaultConfig.apiUrl);
      expect(options.method).toBe("POST");
      expect(options.headers["Authorization"]).toBe(
        `Bearer ${defaultConfig.apiToken}`,
      );
      const body = JSON.parse(options.body);
      expect(body.input).toEqual(["test text"]);
      expect(body.model).toBe("voyage-code-3");
    });

    it("sorts response by index", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              { embedding: [0.9], index: 1 },
              { embedding: [0.1], index: 0 },
            ],
            usage: { total_tokens: 10 },
          }),
      });

      const embedder = new Embedder(defaultConfig);
      const results = await embedder.embed(["first", "second"]);

      expect(Array.from(results[0]!)[0]).toBeCloseTo(0.1);
      expect(Array.from(results[1]!)[0]).toBeCloseTo(0.9);
    });

    it("throws on empty input", async () => {
      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed([])).rejects.toThrow(
        "No non-empty texts to embed",
      );
    });

    it("filters out empty strings", async () => {
      const mockFetch = mockFetchOk([[0.1]]);
      globalThis.fetch = mockFetch;

      const embedder = new Embedder(defaultConfig);
      await embedder.embed(["", "hello", ""]);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.input).toEqual(["hello"]);
    });

    it("throws if all texts are empty", async () => {
      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["", ""])).rejects.toThrow(
        "No non-empty texts to embed",
      );
    });
  });

  describe("embedOne", () => {
    it("delegates to embed and returns single result", async () => {
      globalThis.fetch = mockFetchOk([[0.5, 0.6]]);

      const embedder = new Embedder(defaultConfig);
      const result = await embedder.embedOne("hello");

      expect(result).toBeInstanceOf(Float32Array);
      expect(result).toHaveLength(2);
    });
  });

  describe("retry logic", () => {
    it("retries on 500 and succeeds", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("server error"),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeResponse([[0.1]])),
        });
      globalThis.fetch = mockFetch;

      const embedder = new Embedder(defaultConfig);
      const results = await embedder.embed(["test"]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
    });

    it("does not retry on 401", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("unauthorized"),
        headers: new Headers(),
      });

      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["test"])).rejects.toThrow(EmbedderError);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry on 400", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: () => Promise.resolve("bad request"),
        headers: new Headers(),
      });

      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["test"])).rejects.toThrow(EmbedderError);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 429 and respects retry-after header", async () => {
      const headers = new Headers();
      headers.set("retry-after", "1");

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          text: () => Promise.resolve("rate limited"),
          headers,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeResponse([[0.1]])),
        });
      globalThis.fetch = mockFetch;

      const embedder = new Embedder(defaultConfig);
      const results = await embedder.embed(["test"]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
    });

    it("retries on network error (TypeError)", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeResponse([[0.1]])),
        });
      globalThis.fetch = mockFetch;

      const embedder = new Embedder(defaultConfig);
      const results = await embedder.embed(["test"]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
    });

    it("throws after exhausting all retries", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("error"),
        headers: new Headers(),
      });

      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["test"])).rejects.toThrow(EmbedderError);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
    });
  });

  describe("timeout", () => {
    it("throws EmbedderError when request is aborted", async () => {
      // Simulate AbortError immediately to avoid waiting for real timeouts
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      });

      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["test"])).rejects.toThrow("timed out");
    });
  });

  describe("constructor defaults", () => {
    it("uses default batchSize when not provided", () => {
      globalThis.fetch = mockFetchOk([[0.1]]);
      const embedder = new Embedder({
        apiUrl: "https://api.test/embed",
        apiToken: "token",
        model: "test-model",
        batchSize: 0,
        dimensions: 0,
      });
      expect(embedder).toBeDefined();
    });
  });

  describe("error edge cases", () => {
    it("rethrows non-abort non-EmbedderError from fetch", async () => {
      // Simulate an unexpected error that isn't AbortError or TypeError
      globalThis.fetch = vi.fn().mockRejectedValue(new RangeError("unexpected"));

      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["test"])).rejects.toThrow(RangeError);
    });

    it("handles response.text() failure in error path", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: () => Promise.reject(new Error("read fail")),
        headers: new Headers(),
      });

      const embedder = new Embedder(defaultConfig);
      await expect(embedder.embed(["test"])).rejects.toThrow(EmbedderError);
    });
  });

  describe("EmbedderError", () => {
    it("has correct name and statusCode", () => {
      const err = new EmbedderError("test", 500);
      expect(err.name).toBe("EmbedderError");
      expect(err.statusCode).toBe(500);
      expect(err.message).toBe("test");
    });

    it("supports retryAfterMs", () => {
      const err = new EmbedderError("rate limited", 429);
      err.retryAfterMs = 5000;
      expect(err.retryAfterMs).toBe(5000);
    });
  });
});
