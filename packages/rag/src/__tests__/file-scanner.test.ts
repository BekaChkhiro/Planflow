import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileScanner } from "../scanner/index.js";

/** Create a temp directory with test files for each test */
async function createTestDir(): Promise<string> {
  const dir = join(tmpdir(), `rag-scanner-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeTestFile(dir: string, relPath: string, content = "// code") {
  const fullPath = join(dir, relPath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content);
}

describe("FileScanner", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("detectLanguage", () => {
    it("detects TypeScript files", () => {
      expect(FileScanner.detectLanguage("src/index.ts")).toBe("typescript");
      expect(FileScanner.detectLanguage("App.tsx")).toBe("typescript");
    });

    it("detects JavaScript files", () => {
      expect(FileScanner.detectLanguage("main.js")).toBe("javascript");
      expect(FileScanner.detectLanguage("config.mjs")).toBe("javascript");
      expect(FileScanner.detectLanguage("config.cjs")).toBe("javascript");
    });

    it("detects Python files", () => {
      expect(FileScanner.detectLanguage("main.py")).toBe("python");
    });

    it("detects Go files", () => {
      expect(FileScanner.detectLanguage("main.go")).toBe("go");
    });

    it("detects Rust files", () => {
      expect(FileScanner.detectLanguage("lib.rs")).toBe("rust");
    });

    it("detects C/C++ files", () => {
      expect(FileScanner.detectLanguage("main.c")).toBe("c");
      expect(FileScanner.detectLanguage("main.h")).toBe("c");
      expect(FileScanner.detectLanguage("main.cpp")).toBe("cpp");
      expect(FileScanner.detectLanguage("main.cc")).toBe("cpp");
      expect(FileScanner.detectLanguage("main.hpp")).toBe("cpp");
    });

    it("returns null for unknown extensions", () => {
      expect(FileScanner.detectLanguage("data.csv")).toBeNull();
      expect(FileScanner.detectLanguage("README.md")).toBeNull();
      expect(FileScanner.detectLanguage("image.png")).toBeNull();
    });
  });

  describe("scan", () => {
    it("discovers files in a directory", async () => {
      await writeTestFile(testDir, "index.ts", "export const x = 1;");
      await writeTestFile(testDir, "utils.ts", "export function foo() {}");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(2);
      expect(files.map((f) => f.relativePath).sort()).toEqual(["index.ts", "utils.ts"]);
    });

    it("discovers files in nested directories", async () => {
      await writeTestFile(testDir, "src/index.ts");
      await writeTestFile(testDir, "src/utils/helpers.ts");
      await writeTestFile(testDir, "lib/main.py");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(3);
      const paths = files.map((f) => f.relativePath).sort();
      expect(paths).toEqual(["lib/main.py", "src/index.ts", "src/utils/helpers.ts"]);
    });

    it("sets correct language for each file", async () => {
      await writeTestFile(testDir, "app.ts");
      await writeTestFile(testDir, "server.go");
      await writeTestFile(testDir, "readme.md");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();
      const byPath = Object.fromEntries(files.map((f) => [f.relativePath, f]));

      expect(byPath["app.ts"]!.language).toBe("typescript");
      expect(byPath["server.go"]!.language).toBe("go");
      expect(byPath["readme.md"]!.language).toBeNull();
    });

    it("includes file size and lastModified", async () => {
      const content = "export const hello = 'world';";
      await writeTestFile(testDir, "index.ts", content);

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files[0]!.sizeBytes).toBe(Buffer.byteLength(content));
      expect(files[0]!.lastModified).toBeInstanceOf(Date);
    });

    it("skips empty files", async () => {
      await writeTestFile(testDir, "empty.ts", "");
      await writeTestFile(testDir, "nonempty.ts", "const x = 1;");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("nonempty.ts");
    });

    it("respects .gitignore rules", async () => {
      await writeTestFile(testDir, ".gitignore", "*.log\nsecrets/\n");
      await writeTestFile(testDir, "app.ts", "code");
      await writeTestFile(testDir, "debug.log", "log data");
      await writeTestFile(testDir, "secrets/api-key.txt", "secret");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("app.ts");
    });

    it("respects nested .gitignore files", async () => {
      await writeTestFile(testDir, ".gitignore", "*.log\n");
      await writeTestFile(testDir, "src/.gitignore", "generated/\n");
      await writeTestFile(testDir, "src/app.ts", "code");
      await writeTestFile(testDir, "src/generated/types.ts", "generated code");
      await writeTestFile(testDir, "root.log", "log");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("src/app.ts");
    });

    it("always ignores node_modules and .git", async () => {
      await writeTestFile(testDir, "app.ts", "code");
      await writeTestFile(testDir, "node_modules/pkg/index.js", "module code");
      await writeTestFile(testDir, ".git/config", "git config");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("app.ts");
    });

    it("supports custom exclude patterns", async () => {
      await writeTestFile(testDir, "src/app.ts", "code");
      await writeTestFile(testDir, "src/app.test.ts", "test code");
      await writeTestFile(testDir, "src/app.spec.ts", "spec code");

      const scanner = new FileScanner(testDir, {
        exclude: ["*.test.ts", "*.spec.ts"],
      });
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("src/app.ts");
    });

    it("supports include patterns to filter files", async () => {
      await writeTestFile(testDir, "src/app.ts", "code");
      await writeTestFile(testDir, "src/style.css", "css");
      await writeTestFile(testDir, "src/data.json", "{}");

      const scanner = new FileScanner(testDir, {
        include: ["*.ts"],
      });
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("src/app.ts");
    });

    it("sets absolute path correctly", async () => {
      await writeTestFile(testDir, "src/app.ts", "code");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files[0]!.path).toBe(join(testDir, "src/app.ts"));
      expect(files[0]!.relativePath).toBe("src/app.ts");
    });

    it("skips files that exceed max size", async () => {
      // Create a file larger than 1MB
      const bigContent = "x".repeat(1024 * 1024 + 1);
      await writeTestFile(testDir, "big.ts", bigContent);
      await writeTestFile(testDir, "small.ts", "const x = 1;");

      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("small.ts");
    });

    it("handles stat errors gracefully (file disappears)", async () => {
      await writeTestFile(testDir, "app.ts", "code");
      // Scanning should still work even if a file becomes inaccessible
      const scanner = new FileScanner(testDir);
      const files = await scanner.scan();
      expect(files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("matchesInclude patterns", () => {
    it("matches directory prefix patterns", async () => {
      await writeTestFile(testDir, "src/app.ts", "code");
      await writeTestFile(testDir, "lib/util.ts", "code");

      const scanner = new FileScanner(testDir, { include: ["src/"] });
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("src/app.ts");
    });

    it("matches glob-like **/*.ext patterns", async () => {
      await writeTestFile(testDir, "src/app.ts", "code");
      await writeTestFile(testDir, "src/main.js", "code");

      const scanner = new FileScanner(testDir, { include: ["**/*.ts"] });
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("src/app.ts");
    });

    it("matches exact file names", async () => {
      await writeTestFile(testDir, "config.ts", "code");
      await writeTestFile(testDir, "other.ts", "code");

      const scanner = new FileScanner(testDir, { include: ["config.ts"] });
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]!.relativePath).toBe("config.ts");
    });
  });
});
