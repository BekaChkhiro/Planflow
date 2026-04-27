import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import ignore, { type Ignore } from "ignore";
import type { ScannedFile, SupportedLanguage } from "../types.js";

const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".rb": "ruby",
  ".php": "php",
};

/** Patterns always excluded regardless of config */
const ALWAYS_IGNORED = [
  ".git",
  ".gitignore",
  ".gitattributes",
  "node_modules",
  ".next",
  ".turbo",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "target",        // Rust, Java
  "build",
  "dist",
  "out",
  ".cache",
  "coverage",
  ".nyc_output",
  ".DS_Store",
  ".env",
  ".env.*",
  "*.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

/** Max file size to index (1 MB) */
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * Discovers files in a directory, respecting .gitignore rules.
 * Detects programming language from file extensions.
 */
export class FileScanner {
  private ig: Ignore;
  private includePatterns: string[] | null;

  constructor(
    private rootDir: string,
    options?: { include?: string[]; exclude?: string[] },
  ) {
    this.ig = ignore();

    // Always ignore these directories/files
    this.ig.add(ALWAYS_IGNORED);

    // Add user-provided exclude patterns
    if (options?.exclude?.length) {
      this.ig.add(options.exclude);
    }

    this.includePatterns = options?.include?.length ? options.include : null;
  }

  /** Detect language from file extension */
  static detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = extname(filePath).toLowerCase();
    return EXTENSION_LANGUAGE_MAP[ext] ?? null;
  }

  /** Scan directory and return discovered files */
  async scan(): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    await this.walkDir(this.rootDir, results);
    return results;
  }

  /** Load .gitignore from a directory if it exists */
  private async loadGitignore(dir: string): Promise<void> {
    try {
      const gitignorePath = join(dir, ".gitignore");
      const content = await readFile(gitignorePath, "utf-8");
      this.ig.add(content);
    } catch {
      // No .gitignore in this directory — that's fine
    }
  }

  /** Recursively walk a directory, collecting matching files */
  private async walkDir(dir: string, results: ScannedFile[]): Promise<void> {
    // Load .gitignore for this directory before processing entries
    await this.loadGitignore(dir);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or similar — skip
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(this.rootDir, fullPath);

      // Normalize to forward slashes for cross-platform ignore matching
      const normalizedPath = relPath.split("\\").join("/");
      const checkPath = entry.isDirectory() ? normalizedPath + "/" : normalizedPath;
      if (this.ig.ignores(checkPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results);
        continue;
      }

      if (!entry.isFile()) continue;

      // If include patterns are set, file must have a recognized language
      // or match one of the include extensions
      if (this.includePatterns && !this.matchesInclude(relPath)) {
        continue;
      }

      // Get file stats
      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }

      // Skip files that are too large
      if (fileStat.size > MAX_FILE_SIZE) continue;

      // Skip empty files
      if (fileStat.size === 0) continue;

      const language = FileScanner.detectLanguage(entry.name);

      results.push({
        path: fullPath,
        relativePath: relPath,
        language,
        sizeBytes: fileStat.size,
        lastModified: fileStat.mtime,
      });
    }
  }

  /** Check if a relative path matches any include pattern */
  private matchesInclude(relPath: string): boolean {
    if (!this.includePatterns) return true;

    return this.includePatterns.some((pattern) => {
      // Simple extension match: "*.ts" → check extension
      if (pattern.startsWith("*.")) {
        const ext = pattern.slice(1); // ".ts"
        return relPath.endsWith(ext);
      }
      // Directory prefix: "src/" → check if path starts with it
      if (pattern.endsWith("/")) {
        return relPath.startsWith(pattern);
      }
      // Glob-like "**/*.ts" → check extension
      if (pattern.startsWith("**/")) {
        const ext = pattern.slice(pattern.lastIndexOf("."));
        return relPath.endsWith(ext);
      }
      // Exact match
      return relPath === pattern;
    });
  }
}
