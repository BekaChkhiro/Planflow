import type { CodeChunk, SupportedLanguage } from "../types.js";

type ChunkKind = CodeChunk["kind"];

/**
 * AST node types to extract as chunks, per language.
 * Maps tree-sitter node type -> chunk kind.
 */
export const EXTRACTABLE_NODES: Record<SupportedLanguage, Map<string, ChunkKind>> = {
  typescript: new Map([
    ["function_declaration", "function"],
    ["class_declaration", "class"],
    ["abstract_class_declaration", "class"],
    ["interface_declaration", "interface"],
    ["type_alias_declaration", "type"],
    ["enum_declaration", "type"],
    ["method_definition", "method"],
  ]),
  javascript: new Map([
    ["function_declaration", "function"],
    ["class_declaration", "class"],
    ["method_definition", "method"],
  ]),
  python: new Map([
    ["function_definition", "function"],
    ["class_definition", "class"],
    ["decorated_definition", "function"], // resolved to actual kind during extraction
  ]),
  go: new Map([
    ["function_declaration", "function"],
    ["method_declaration", "method"],
    ["type_declaration", "type"],
  ]),
  rust: new Map([
    ["function_item", "function"],
    ["impl_item", "class"],
    ["struct_item", "type"],
    ["enum_item", "type"],
    ["trait_item", "interface"],
  ]),
  java: new Map([
    ["method_declaration", "method"],
    ["class_declaration", "class"],
    ["interface_declaration", "interface"],
    ["constructor_declaration", "method"],
    ["enum_declaration", "type"],
  ]),
  c: new Map([
    ["function_definition", "function"],
    ["struct_specifier", "type"],
    ["enum_specifier", "type"],
  ]),
  cpp: new Map([
    ["function_definition", "function"],
    ["class_specifier", "class"],
    ["struct_specifier", "type"],
    ["enum_specifier", "type"],
  ]),
  ruby: new Map([
    ["method", "method"],
    ["singleton_method", "method"],
    ["class", "class"],
    ["module", "module"],
  ]),
  php: new Map([
    ["function_definition", "function"],
    ["class_declaration", "class"],
    ["method_declaration", "method"],
    ["interface_declaration", "interface"],
    ["trait_declaration", "class"],
  ]),
};

/** Node types that are class-like containers (we recurse into these for methods). */
export const CLASS_LIKE_NODES: Record<SupportedLanguage, Set<string>> = {
  typescript: new Set(["class_declaration", "abstract_class_declaration"]),
  javascript: new Set(["class_declaration"]),
  python: new Set(["class_definition"]),
  go: new Set([]), // Go methods are top-level
  rust: new Set(["impl_item"]),
  java: new Set(["class_declaration", "interface_declaration"]),
  c: new Set([]),
  cpp: new Set(["class_specifier"]),
  ruby: new Set(["class", "module"]),
  php: new Set(["class_declaration", "trait_declaration"]),
};

/** Node types that represent methods inside class-like nodes. */
export const METHOD_NODES: Record<SupportedLanguage, Set<string>> = {
  typescript: new Set(["method_definition"]),
  javascript: new Set(["method_definition"]),
  python: new Set(["function_definition", "decorated_definition"]),
  go: new Set([]),
  rust: new Set(["function_item"]),
  java: new Set(["method_declaration", "constructor_declaration"]),
  c: new Set([]),
  cpp: new Set(["function_definition"]),
  ruby: new Set(["method", "singleton_method"]),
  php: new Set(["method_declaration"]),
};

/** Wrapper nodes that may contain extractable declarations inside. */
export const WRAPPER_NODES: Record<SupportedLanguage, Set<string>> = {
  typescript: new Set(["export_statement"]),
  javascript: new Set(["export_statement"]),
  python: new Set(["decorated_definition"]),
  go: new Set([]),
  rust: new Set([]),
  java: new Set([]),
  c: new Set([]),
  cpp: new Set([]),
  ruby: new Set([]),
  php: new Set([]),
};

/** Grammar WASM file name for each language. */
export const GRAMMAR_FILES: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
  java: "tree-sitter-java.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  ruby: "tree-sitter-ruby.wasm",
  php: "tree-sitter-php.wasm",
};
