import Parser from "web-tree-sitter";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import type { CodeChunk, SupportedLanguage } from "../types.js";
import {
  EXTRACTABLE_NODES,
  CLASS_LIKE_NODES,
  METHOD_NODES,
  WRAPPER_NODES,
  GRAMMAR_FILES,
} from "./language-config.js";

export interface CodeChunkerOptions {
  /** Directory containing tree-sitter grammar WASM files. */
  grammarsDir?: string;
  /** Minimum non-blank lines for uncovered code to become a "module" chunk (default: 3). */
  minChunkLines?: number;
}

/**
 * Splits source code into semantic chunks using Tree-sitter AST parsing.
 *
 * Extracts functions, classes, methods, interfaces, and type definitions
 * as individual {@link CodeChunk} objects. For classes, methods are also
 * extracted as separate chunks with `parentName` set to the class name.
 *
 * Top-level code not belonging to any declaration is grouped into
 * "module" chunks.
 */
export class CodeChunker {
  private parser: Parser | null = null;
  private loadedLanguages = new Map<string, Parser.Language>();
  private initPromise: Promise<void> | null = null;
  private grammarsDir: string;
  private minChunkLines: number;

  constructor(options?: CodeChunkerOptions) {
    this.grammarsDir = options?.grammarsDir ?? resolve(process.cwd(), "grammars");
    this.minChunkLines = options?.minChunkLines ?? 3;
  }

  /** Initialize the Tree-sitter WASM runtime. Called automatically by chunk(). */
  async init(): Promise<void> {
    if (this.parser) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await Parser.init();
      this.parser = new Parser();
    })();

    return this.initPromise;
  }

  /** Parse source code and return semantic chunks. */
  async chunk(
    content: string,
    filePath: string,
    language: SupportedLanguage,
  ): Promise<CodeChunk[]> {
    await this.init();

    if (!content.trim()) return [];

    const lang = await this.loadLanguage(language, filePath);
    if (!lang) {
      return this.fallbackChunk(content, filePath, language);
    }

    this.parser!.setLanguage(lang);
    const tree = this.parser!.parse(content);

    try {
      return this.extractChunks(tree, content, filePath, language);
    } finally {
      tree.delete();
    }
  }

  /** Release WASM parser resources. */
  dispose(): void {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }
    this.loadedLanguages.clear();
    this.initPromise = null;
  }

  // ── Grammar loading ──────────────────────────────────────────

  private resolveGrammarFile(language: SupportedLanguage, filePath: string): string {
    // TSX files need the tsx grammar, not the typescript grammar
    if (language === "typescript" && /\.tsx$/i.test(filePath)) {
      return "tree-sitter-tsx.wasm";
    }
    return GRAMMAR_FILES[language];
  }

  private async loadLanguage(
    language: SupportedLanguage,
    filePath: string,
  ): Promise<Parser.Language | null> {
    const wasmFile = this.resolveGrammarFile(language, filePath);

    const cached = this.loadedLanguages.get(wasmFile);
    if (cached) return cached;

    const wasmPath = resolve(this.grammarsDir, wasmFile);
    try {
      await access(wasmPath);
    } catch {
      return null;
    }

    const lang = await Parser.Language.load(wasmPath);
    this.loadedLanguages.set(wasmFile, lang);
    return lang;
  }

  // ── AST extraction ───────────────────────────────────────────

  private extractChunks(
    tree: Parser.Tree,
    content: string,
    filePath: string,
    language: SupportedLanguage,
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const coveredLines = new Set<number>();

    for (const child of tree.rootNode.namedChildren) {
      this.processNode(child, chunks, filePath, language, null, coveredLines);
    }

    this.extractModuleChunks(content, filePath, language, coveredLines, chunks);

    return chunks;
  }

  private processNode(
    node: Parser.SyntaxNode,
    chunks: CodeChunk[],
    filePath: string,
    language: SupportedLanguage,
    parentName: string | null,
    coveredLines: Set<number>,
  ): void {
    const extractable = EXTRACTABLE_NODES[language];
    const wrappers = WRAPPER_NODES[language];

    // Handle wrapper nodes (export_statement, decorated_definition)
    if (wrappers.has(node.type)) {
      this.processWrapper(node, chunks, filePath, language, parentName, coveredLines);
      return;
    }

    // Direct extractable types
    if (extractable.has(node.type)) {
      this.extractNodeAsChunk(node, node, chunks, filePath, language, parentName, coveredLines);
      return;
    }

    // Named arrow/function expressions: const foo = () => {}
    if (this.isNamedArrowFunction(node, language)) {
      this.extractArrowFunction(node, chunks, filePath, language, parentName, coveredLines);
      return;
    }

    // Not extractable — recurse
    for (const child of node.namedChildren) {
      this.processNode(child, chunks, filePath, language, parentName, coveredLines);
    }
  }

  private processWrapper(
    wrapperNode: Parser.SyntaxNode,
    chunks: CodeChunk[],
    filePath: string,
    language: SupportedLanguage,
    parentName: string | null,
    coveredLines: Set<number>,
  ): void {
    const extractable = EXTRACTABLE_NODES[language];

    for (const child of wrapperNode.namedChildren) {
      if (extractable.has(child.type)) {
        // Use wrapper node for text (includes `export`), child for name
        this.extractNodeAsChunk(wrapperNode, child, chunks, filePath, language, parentName, coveredLines);
        return;
      }
      if (this.isNamedArrowFunction(child, language)) {
        this.extractArrowFunction(wrapperNode, chunks, filePath, language, parentName, coveredLines);
        return;
      }
    }

    // Wrapper with nothing extractable inside — recurse
    for (const child of wrapperNode.namedChildren) {
      this.processNode(child, chunks, filePath, language, parentName, coveredLines);
    }
  }

  private extractNodeAsChunk(
    textNode: Parser.SyntaxNode,
    declNode: Parser.SyntaxNode,
    chunks: CodeChunk[],
    filePath: string,
    language: SupportedLanguage,
    parentName: string | null,
    coveredLines: Set<number>,
  ): void {
    const extractable = EXTRACTABLE_NODES[language];
    const classLike = CLASS_LIKE_NODES[language];

    let kind = extractable.get(declNode.type)!;

    // Resolve decorated_definition to actual kind (Python)
    if (declNode.type === "decorated_definition") {
      const inner = declNode.namedChildren.find(
        (c) => c.type === "function_definition" || c.type === "class_definition",
      );
      if (inner?.type === "class_definition") kind = "class";
      else kind = "function";
    }

    const name = this.extractName(declNode, kind, language);
    const startLine = textNode.startPosition.row + 1;
    const endLine = textNode.endPosition.row + 1;

    chunks.push({
      id: this.makeChunkId(filePath, kind, name, startLine),
      filePath,
      language,
      kind,
      name,
      content: textNode.text,
      startLine,
      endLine,
      parentName,
    });
    this.markCovered(startLine, endLine, coveredLines);

    // For class-like nodes, also extract methods as separate chunks
    if (classLike.has(declNode.type)) {
      this.extractMethods(declNode, chunks, filePath, language, name, coveredLines);
    }
  }

  private extractMethods(
    classNode: Parser.SyntaxNode,
    chunks: CodeChunk[],
    filePath: string,
    language: SupportedLanguage,
    className: string,
    coveredLines: Set<number>,
  ): void {
    const methodTypes = METHOD_NODES[language];
    const body = classNode.childForFieldName("body") ?? classNode;

    for (const child of body.namedChildren) {
      if (methodTypes.has(child.type)) {
        const name = this.extractName(child, "method", language);
        const startLine = child.startPosition.row + 1;
        const endLine = child.endPosition.row + 1;

        chunks.push({
          id: this.makeChunkId(filePath, "method", name, startLine),
          filePath,
          language,
          kind: "method",
          name,
          content: child.text,
          startLine,
          endLine,
          parentName: className,
        });
        // Lines already covered by the class chunk
      }
    }
  }

  // ── Arrow function detection ─────────────────────────────────

  private isNamedArrowFunction(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
    if (language !== "typescript" && language !== "javascript") return false;
    if (node.type !== "lexical_declaration") return false;

    for (const child of node.namedChildren) {
      if (child.type === "variable_declarator") {
        const value = child.childForFieldName("value");
        if (value && (value.type === "arrow_function" || value.type === "function_expression")) {
          return true;
        }
      }
    }
    return false;
  }

  private extractArrowFunction(
    textNode: Parser.SyntaxNode,
    chunks: CodeChunk[],
    filePath: string,
    language: SupportedLanguage,
    parentName: string | null,
    coveredLines: Set<number>,
  ): void {
    // textNode may be an export_statement wrapping the lexical_declaration
    const lexDecl =
      textNode.type === "lexical_declaration"
        ? textNode
        : textNode.namedChildren.find((c) => c.type === "lexical_declaration");

    if (!lexDecl) return;

    for (const child of lexDecl.namedChildren) {
      if (child.type === "variable_declarator") {
        const nameNode = child.childForFieldName("name");
        const name = nameNode?.text ?? `arrow:L${textNode.startPosition.row + 1}`;
        const startLine = textNode.startPosition.row + 1;
        const endLine = textNode.endPosition.row + 1;

        chunks.push({
          id: this.makeChunkId(filePath, "function", name, startLine),
          filePath,
          language,
          kind: "function",
          name,
          content: textNode.text,
          startLine,
          endLine,
          parentName,
        });
        this.markCovered(startLine, endLine, coveredLines);
        return;
      }
    }
  }

  // ── Name extraction ──────────────────────────────────────────

  private extractName(
    node: Parser.SyntaxNode,
    kind: CodeChunk["kind"],
    language: SupportedLanguage,
  ): string {
    // Most declarations use a "name" field
    const nameNode = node.childForFieldName("name");
    if (nameNode) return nameNode.text;

    // Python decorated_definition: dig through to find the inner def/class
    if (node.type === "decorated_definition") {
      const inner = node.namedChildren.find(
        (c) => c.type === "function_definition" || c.type === "class_definition",
      );
      if (inner) {
        const innerName = inner.childForFieldName("name");
        if (innerName) return innerName.text;
      }
    }

    // Go type_declaration has a type_spec child
    if (language === "go" && node.type === "type_declaration") {
      const spec = node.namedChildren.find((c) => c.type === "type_spec");
      if (spec) {
        const specName = spec.childForFieldName("name");
        if (specName) return specName.text;
      }
    }

    // Rust impl blocks: impl Type or impl Trait for Type
    if (language === "rust" && node.type === "impl_item") {
      const typeNode = node.childForFieldName("type");
      if (typeNode) return `impl ${typeNode.text}`;
    }

    // Fallback: first identifier child
    for (const child of node.namedChildren) {
      if (child.type === "identifier" || child.type === "type_identifier") {
        return child.text;
      }
    }

    return `${kind}:L${node.startPosition.row + 1}`;
  }

  // ── Module chunks (uncovered code) ───────────────────────────

  private extractModuleChunks(
    content: string,
    filePath: string,
    language: SupportedLanguage,
    coveredLines: Set<number>,
    chunks: CodeChunk[],
  ): void {
    const lines = content.split("\n");
    let blockStart: number | null = null;
    const blockLines: string[] = [];

    const flush = () => {
      if (blockStart !== null && blockLines.length >= this.minChunkLines) {
        const text = blockLines.join("\n");
        if (text.trim()) {
          chunks.push({
            id: this.makeChunkId(filePath, "module", "module", blockStart),
            filePath,
            language,
            kind: "module",
            name: `module:L${blockStart}-${blockStart + blockLines.length - 1}`,
            content: text,
            startLine: blockStart,
            endLine: blockStart + blockLines.length - 1,
            parentName: null,
          });
        }
      }
      blockStart = null;
      blockLines.length = 0;
    };

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const isUncovered = !coveredLines.has(lineNum);
      const isNonBlank = lines[i]!.trim() !== "";

      if (isUncovered && isNonBlank) {
        if (blockStart === null) blockStart = lineNum;
        blockLines.push(lines[i]!);
      } else if (
        // Allow a single blank uncovered line to not break the block
        blockStart !== null &&
        isUncovered &&
        !isNonBlank &&
        i + 1 < lines.length &&
        !coveredLines.has(lineNum + 1) &&
        lines[i + 1]!.trim() !== ""
      ) {
        blockLines.push(lines[i]!);
      } else {
        flush();
      }
    }
    flush();
  }

  // ── Helpers ──────────────────────────────────────────────────

  private markCovered(startLine: number, endLine: number, coveredLines: Set<number>): void {
    for (let i = startLine; i <= endLine; i++) {
      coveredLines.add(i);
    }
  }

  private makeChunkId(filePath: string, kind: string, name: string, startLine: number): string {
    const input = `${filePath}:${kind}:${name}:${startLine}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }

  /** Fallback: return the entire file as a single module chunk. */
  private fallbackChunk(
    content: string,
    filePath: string,
    language: SupportedLanguage,
  ): CodeChunk[] {
    const lines = content.split("\n");
    return [
      {
        id: this.makeChunkId(filePath, "module", "module", 1),
        filePath,
        language,
        kind: "module",
        name: "module",
        content,
        startLine: 1,
        endLine: lines.length,
        parentName: null,
      },
    ];
  }
}
