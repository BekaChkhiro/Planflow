import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CodeChunk, SupportedLanguage } from "../types.js";

// ── Mock helpers ───────────────────────────────────────────────

interface MockNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildren: MockNode[];
  children: MockNode[];
  childForFieldName: (name: string) => MockNode | null;
}

function node(
  type: string,
  text: string,
  startRow: number,
  endRow: number,
  opts: { children?: MockNode[]; fields?: Record<string, MockNode> } = {},
): MockNode {
  const children = opts.children ?? [];
  const fields = opts.fields ?? {};
  return {
    type,
    text,
    startPosition: { row: startRow, column: 0 },
    endPosition: { row: endRow, column: 0 },
    namedChildren: children,
    children,
    childForFieldName: (name: string) => fields[name] ?? null,
  };
}

// ── Mock web-tree-sitter ───────────────────────────────────────

const mockParse = vi.fn();

vi.mock("web-tree-sitter", () => ({
  default: class MockParser {
    static init = vi.fn().mockResolvedValue(undefined);
    static Language = { load: vi.fn().mockResolvedValue({}) };
    setLanguage = vi.fn();
    parse = mockParse;
    delete = vi.fn();
  },
}));

// Mock fs access so grammar files appear to exist
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, access: vi.fn().mockResolvedValue(undefined) };
});

// Must import AFTER mocks are set up
const { CodeChunker } = await import("../chunker/index.js");

// ── Tests ──────────────────────────────────────────────────────

describe("CodeChunker", () => {
  let chunker: InstanceType<typeof CodeChunker>;

  beforeEach(() => {
    vi.clearAllMocks();
    chunker = new CodeChunker({ grammarsDir: "/fake/grammars" });
  });

  afterEach(() => {
    chunker.dispose();
  });

  describe("empty / blank input", () => {
    it("returns [] for empty string", async () => {
      expect(await chunker.chunk("", "f.ts", "typescript")).toEqual([]);
    });

    it("returns [] for whitespace-only string", async () => {
      expect(await chunker.chunk("   \n  \n  ", "f.ts", "typescript")).toEqual([]);
    });
  });

  describe("function extraction", () => {
    it("extracts a top-level function", async () => {
      const code = "function hello() {\n  return 'world';\n}";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 2, {
          children: [
            node("function_declaration", code, 0, 2, {
              fields: { name: node("identifier", "hello", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "src/greet.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("function");
      expect(chunks[0]!.name).toBe("hello");
      expect(chunks[0]!.content).toBe(code);
      expect(chunks[0]!.startLine).toBe(1);
      expect(chunks[0]!.endLine).toBe(3);
      expect(chunks[0]!.parentName).toBeNull();
      expect(chunks[0]!.language).toBe("typescript");
      expect(chunks[0]!.filePath).toBe("src/greet.ts");
    });

    it("extracts multiple functions", async () => {
      const fn1 = "function a() {}";
      const fn2 = "function b() {}";
      const code = `${fn1}\n${fn2}`;

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 1, {
          children: [
            node("function_declaration", fn1, 0, 0, {
              fields: { name: node("identifier", "a", 0, 0) },
            }),
            node("function_declaration", fn2, 1, 1, {
              fields: { name: node("identifier", "b", 1, 1) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "f.ts", "typescript");

      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.name).toBe("a");
      expect(chunks[1]!.name).toBe("b");
    });
  });

  describe("class and method extraction", () => {
    it("extracts a class and its methods separately", async () => {
      const methodText = "greet() {\n    return 'hi';\n  }";
      const classText = `class Foo {\n  ${methodText}\n}`;

      const methodNode = node("method_definition", methodText, 1, 3, {
        fields: { name: node("property_identifier", "greet", 1, 1) },
      });

      const bodyNode = node("class_body", `{\n  ${methodText}\n}`, 0, 4, {
        children: [methodNode],
      });

      const classNode = node("class_declaration", classText, 0, 4, {
        children: [bodyNode],
        fields: {
          name: node("type_identifier", "Foo", 0, 0),
          body: bodyNode,
        },
      });

      mockParse.mockReturnValue({
        rootNode: node("program", classText, 0, 4, {
          children: [classNode],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(classText, "foo.ts", "typescript");

      // Should have the class chunk + the method chunk
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      const classChunk = chunks.find((c) => c.kind === "class");
      const methodChunk = chunks.find((c) => c.kind === "method");

      expect(classChunk).toBeDefined();
      expect(classChunk!.name).toBe("Foo");
      expect(classChunk!.parentName).toBeNull();

      expect(methodChunk).toBeDefined();
      expect(methodChunk!.name).toBe("greet");
      expect(methodChunk!.parentName).toBe("Foo");
    });
  });

  describe("arrow function extraction", () => {
    it("extracts named arrow functions", async () => {
      const code = "const add = (a, b) => a + b;";

      const arrowNode = node("arrow_function", "(a, b) => a + b", 0, 0);
      const declarator = node("variable_declarator", "add = (a, b) => a + b", 0, 0, {
        fields: {
          name: node("identifier", "add", 0, 0),
          value: arrowNode,
        },
      });
      const lexDecl = node("lexical_declaration", code, 0, 0, {
        children: [declarator],
      });

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, { children: [lexDecl] }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "math.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("function");
      expect(chunks[0]!.name).toBe("add");
    });

    it("ignores non-function variable declarations", async () => {
      const code = "const x = 42;\nconst y = 'hello';\nconst z = true;";

      const declNode = node("lexical_declaration", "const x = 42;", 0, 0, {
        children: [
          node("variable_declarator", "x = 42", 0, 0, {
            fields: {
              name: node("identifier", "x", 0, 0),
              value: node("number", "42", 0, 0),
            },
          }),
        ],
      });

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 2, { children: [declNode] }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "f.ts", "typescript");

      // Should NOT extract as a function; may have a module chunk
      const fnChunks = chunks.filter((c) => c.kind === "function");
      expect(fnChunks).toHaveLength(0);
    });
  });

  describe("export statement handling", () => {
    it("extracts exported function with export keyword in content", async () => {
      const code = "export function serve() {}";

      const fnNode = node("function_declaration", "function serve() {}", 0, 0, {
        fields: { name: node("identifier", "serve", 0, 0) },
      });
      const exportNode = node("export_statement", code, 0, 0, {
        children: [fnNode],
      });

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, { children: [exportNode] }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "server.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("function");
      expect(chunks[0]!.name).toBe("serve");
      // Content should include the `export` keyword
      expect(chunks[0]!.content).toBe(code);
    });

    it("extracts exported arrow function", async () => {
      const code = "export const handler = () => {}";

      const arrowNode = node("arrow_function", "() => {}", 0, 0);
      const declarator = node("variable_declarator", "handler = () => {}", 0, 0, {
        fields: {
          name: node("identifier", "handler", 0, 0),
          value: arrowNode,
        },
      });
      const lexDecl = node("lexical_declaration", "const handler = () => {}", 0, 0, {
        children: [declarator],
      });
      const exportNode = node("export_statement", code, 0, 0, {
        children: [lexDecl],
      });

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, { children: [exportNode] }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "api.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("function");
      expect(chunks[0]!.name).toBe("handler");
    });
  });

  describe("interface and type extraction", () => {
    it("extracts TypeScript interfaces", async () => {
      const code = "interface User {\n  name: string;\n  age: number;\n}";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 3, {
          children: [
            node("interface_declaration", code, 0, 3, {
              fields: { name: node("type_identifier", "User", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "types.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("interface");
      expect(chunks[0]!.name).toBe("User");
    });

    it("extracts type aliases", async () => {
      const code = "type ID = string | number;";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("type_alias_declaration", code, 0, 0, {
              fields: { name: node("type_identifier", "ID", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "types.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("type");
      expect(chunks[0]!.name).toBe("ID");
    });
  });

  describe("Python extraction", () => {
    it("extracts Python functions and classes", async () => {
      const fnCode = "def greet(name):\n    return f'Hello {name}'";
      const clsCode = "class Dog:\n    def bark(self):\n        print('Woof')";
      const code = `${fnCode}\n\n${clsCode}`;

      const barkNode = node("function_definition", "def bark(self):\n        print('Woof')", 3, 4, {
        fields: { name: node("identifier", "bark", 3, 3) },
      });
      const bodyNode = node("block", "    def bark(self):\n        print('Woof')", 3, 4, {
        children: [barkNode],
      });
      const classNode = node("class_definition", clsCode, 2, 4, {
        fields: {
          name: node("identifier", "Dog", 2, 2),
          body: bodyNode,
        },
        children: [bodyNode],
      });

      mockParse.mockReturnValue({
        rootNode: node("module", code, 0, 4, {
          children: [
            node("function_definition", fnCode, 0, 1, {
              fields: { name: node("identifier", "greet", 0, 0) },
            }),
            classNode,
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "animals.py", "python");

      const fnChunk = chunks.find((c) => c.kind === "function" && c.name === "greet");
      const clsChunk = chunks.find((c) => c.kind === "class" && c.name === "Dog");
      const methodChunk = chunks.find((c) => c.kind === "method" && c.name === "bark");

      expect(fnChunk).toBeDefined();
      expect(clsChunk).toBeDefined();
      expect(methodChunk).toBeDefined();
      expect(methodChunk!.parentName).toBe("Dog");
    });
  });

  describe("module chunks (uncovered code)", () => {
    it("creates module chunk for top-level code not in any declaration", async () => {
      const imports = 'import fs from "fs";\nimport path from "path";\nimport os from "os";';
      const fn = "function main() {}";
      const code = `${imports}\n\n${fn}`;

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 4, {
          children: [
            // Import statements aren't extractable
            node("import_statement", 'import fs from "fs";', 0, 0),
            node("import_statement", 'import path from "path";', 1, 1),
            node("import_statement", 'import os from "os";', 2, 2),
            node("function_declaration", fn, 4, 4, {
              fields: { name: node("identifier", "main", 4, 4) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "app.ts", "typescript");

      const moduleChunks = chunks.filter((c) => c.kind === "module");
      const fnChunks = chunks.filter((c) => c.kind === "function");

      expect(fnChunks).toHaveLength(1);
      expect(moduleChunks).toHaveLength(1);
      expect(moduleChunks[0]!.content).toContain("import fs");
    });

    it("skips module chunk when uncovered lines are below minChunkLines", async () => {
      const code = "const x = 1;\n\nfunction foo() {}";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 2, {
          children: [
            node("lexical_declaration", "const x = 1;", 0, 0, {
              children: [
                node("variable_declarator", "x = 1", 0, 0, {
                  fields: {
                    name: node("identifier", "x", 0, 0),
                    value: node("number", "1", 0, 0),
                  },
                }),
              ],
            }),
            node("function_declaration", "function foo() {}", 2, 2, {
              fields: { name: node("identifier", "foo", 2, 2) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "f.ts", "typescript");

      // Only 1 uncovered line (const x = 1;), below default minChunkLines=3
      const moduleChunks = chunks.filter((c) => c.kind === "module");
      expect(moduleChunks).toHaveLength(0);
    });
  });

  describe("chunk IDs", () => {
    it("generates deterministic IDs", async () => {
      const code = "function test() {}";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("function_declaration", code, 0, 0, {
              fields: { name: node("identifier", "test", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks1 = await chunker.chunk(code, "a.ts", "typescript");
      const chunks2 = await chunker.chunk(code, "a.ts", "typescript");

      expect(chunks1[0]!.id).toBe(chunks2[0]!.id);
    });

    it("produces different IDs for different files", async () => {
      const code = "function test() {}";
      const makeTree = () => ({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("function_declaration", code, 0, 0, {
              fields: { name: node("identifier", "test", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      mockParse.mockReturnValue(makeTree());
      const c1 = await chunker.chunk(code, "a.ts", "typescript");

      mockParse.mockReturnValue(makeTree());
      const c2 = await chunker.chunk(code, "b.ts", "typescript");

      expect(c1[0]!.id).not.toBe(c2[0]!.id);
    });

    it("IDs are 16 hex characters", async () => {
      const code = "function f() {}";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("function_declaration", code, 0, 0, {
              fields: { name: node("identifier", "f", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "f.ts", "typescript");
      expect(chunks[0]!.id).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("fallback behavior", () => {
    it("returns a single module chunk when grammar is unavailable", async () => {
      // Override access mock to simulate missing grammar
      const { access } = await import("node:fs/promises");
      vi.mocked(access).mockRejectedValueOnce(new Error("ENOENT"));

      const code = "function hello() {}\nconst x = 1;";
      const chunks = await chunker.chunk(code, "f.ts", "typescript");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("module");
      expect(chunks[0]!.name).toBe("module");
      expect(chunks[0]!.content).toBe(code);
      expect(chunks[0]!.startLine).toBe(1);
      expect(chunks[0]!.endLine).toBe(2);
    });
  });

  describe("name extraction fallback", () => {
    it("uses line number when node has no name field", async () => {
      const code = "struct { int x; }";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("struct_specifier", code, 0, 0, {
              // No name field, no identifier children
              children: [],
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "main.c", "c");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.name).toBe("type:L1");
    });
  });

  describe("TSX grammar resolution", () => {
    it("uses tsx grammar for .tsx files", async () => {
      const Parser = (await import("web-tree-sitter")).default;
      const code = "function App() { return <div/>; }";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("function_declaration", code, 0, 0, {
              fields: { name: node("identifier", "App", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      await chunker.chunk(code, "App.tsx", "typescript");

      // Verify Language.load was called with tsx WASM
      expect(Parser.Language.load).toHaveBeenCalledWith(
        expect.stringContaining("tree-sitter-tsx.wasm"),
      );
    });

    it("uses typescript grammar for .ts files", async () => {
      const Parser = (await import("web-tree-sitter")).default;
      const code = "function app() {}";

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("function_declaration", code, 0, 0, {
              fields: { name: node("identifier", "app", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      await chunker.chunk(code, "app.ts", "typescript");

      expect(Parser.Language.load).toHaveBeenCalledWith(
        expect.stringContaining("tree-sitter-typescript.wasm"),
      );
    });
  });

  describe("Rust impl block extraction", () => {
    it("extracts name from Rust impl blocks", async () => {
      const code = "impl MyStruct {\n  fn method(&self) {}\n}";

      const methodNode = node("function_item", "fn method(&self) {}", 1, 1, {
        fields: { name: node("identifier", "method", 1, 1) },
      });
      const bodyNode = node("declaration_list", "{\n  fn method(&self) {}\n}", 0, 2, {
        children: [methodNode],
      });
      const implNode = node("impl_item", code, 0, 2, {
        fields: {
          type: node("type_identifier", "MyStruct", 0, 0),
          body: bodyNode,
        },
        children: [bodyNode],
      });

      mockParse.mockReturnValue({
        rootNode: node("source_file", code, 0, 2, {
          children: [implNode],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "lib.rs", "rust");

      const implChunk = chunks.find((c) => c.kind === "class");
      expect(implChunk).toBeDefined();
      expect(implChunk!.name).toContain("MyStruct");
    });
  });

  describe("module chunks with blank lines", () => {
    it("allows a single blank line within an uncovered block", async () => {
      // 5 lines: 3 imports, 1 blank, 1 more import — all uncovered, blank in middle
      const code = 'import a from "a";\nimport b from "b";\nimport c from "c";\n\nimport d from "d";\n\nfunction main() {}';

      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 6, {
          children: [
            node("import_statement", 'import a from "a";', 0, 0),
            node("import_statement", 'import b from "b";', 1, 1),
            node("import_statement", 'import c from "c";', 2, 2),
            node("import_statement", 'import d from "d";', 4, 4),
            node("function_declaration", "function main() {}", 6, 6, {
              fields: { name: node("identifier", "main", 6, 6) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      const chunks = await chunker.chunk(code, "f.ts", "typescript");

      const moduleChunks = chunks.filter((c) => c.kind === "module");
      // The blank line at row 3 between imports should be absorbed into the module block
      expect(moduleChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("dispose", () => {
    it("clears state and allows re-init", async () => {
      const code = "function f() {}";
      mockParse.mockReturnValue({
        rootNode: node("program", code, 0, 0, {
          children: [
            node("function_declaration", code, 0, 0, {
              fields: { name: node("identifier", "f", 0, 0) },
            }),
          ],
        }),
        delete: vi.fn(),
      });

      await chunker.chunk(code, "f.ts", "typescript");
      chunker.dispose();

      // Should work again after dispose
      const chunks = await chunker.chunk(code, "f.ts", "typescript");
      expect(chunks).toHaveLength(1);
    });
  });
});
