import type { EmbedderConfig } from "../types.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens: number };
}

/**
 * Generates vector embeddings via the PlanFlow server-side proxy to Voyage-code-3.
 * Users don't need their own API key — PlanFlow pays for embeddings.
 */
export class Embedder {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly model: string;
  private readonly batchSize: number;
  private readonly dimensions: number;

  constructor(config: EmbedderConfig) {
    if (!config.apiUrl) throw new Error("EmbedderConfig.apiUrl is required");
    if (!config.apiToken) throw new Error("EmbedderConfig.apiToken is required");
    if (!config.model) throw new Error("EmbedderConfig.model is required");

    this.apiUrl = config.apiUrl;
    this.apiToken = config.apiToken;
    this.model = config.model;
    this.batchSize = config.batchSize || 128;
    this.dimensions = config.dimensions || 1024;
  }

  /** Embed a batch of text strings */
  async embed(texts: string[]): Promise<Float32Array[]> {
    const filtered = texts.filter((t) => t.length > 0);
    if (filtered.length === 0) {
      throw new Error("No non-empty texts to embed");
    }

    const results: Float32Array[] = [];

    for (let i = 0; i < filtered.length; i += this.batchSize) {
      const batch = filtered.slice(i, i + this.batchSize);
      const response = await this._requestWithRetry(batch);

      const sorted = response.data.sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        results.push(new Float32Array(item.embedding));
      }
    }

    return results;
  }

  /** Embed a single text string */
  async embedOne(text: string): Promise<Float32Array> {
    const [result] = await this.embed([text]);
    if (!result) throw new Error("Empty embedding result");
    return result;
  }

  private async _requestWithRetry(texts: string[]): Promise<VoyageResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._request(texts);
      } catch (error) {
        lastError = error as Error;

        if (!this._isRetryable(error as Error)) {
          throw error;
        }

        if (attempt < MAX_RETRIES) {
          const delay = this._getDelay(error as Error, attempt);
          await this._sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private async _request(texts: string[]): Promise<VoyageResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({ input: texts, model: this.model }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const err = new EmbedderError(
          `Embedding API error ${response.status}: ${body || response.statusText}`,
          response.status,
        );
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) err.retryAfterMs = parseInt(retryAfter, 10) * 1000;
        }
        throw err;
      }

      return (await response.json()) as VoyageResponse;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new EmbedderError(
          `Embedding request timed out after ${REQUEST_TIMEOUT_MS}ms`,
          408,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private _isRetryable(error: Error): boolean {
    if (error instanceof EmbedderError) {
      const s = error.statusCode;
      // Retry on server errors, timeouts, and rate limits
      if (s >= 500 || s === 408 || s === 429) return true;
      // Don't retry client errors (401, 403, 400, etc.)
      return false;
    }
    // Retry on network errors (TypeError from fetch)
    return error instanceof TypeError;
  }

  private _getDelay(error: Error, attempt: number): number {
    if (error instanceof EmbedderError && error.retryAfterMs) {
      return error.retryAfterMs;
    }
    return BASE_DELAY_MS * Math.pow(2, attempt - 1);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class EmbedderError extends Error {
  statusCode: number;
  retryAfterMs?: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "EmbedderError";
    this.statusCode = statusCode;
  }
}
