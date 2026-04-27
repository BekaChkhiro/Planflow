import { describe, it, expect } from "vitest";
import { FileScanner } from "../scanner/index.js";

describe("RAG package scaffold", () => {
  it("exports FileScanner", () => {
    expect(FileScanner).toBeDefined();
  });

  it("detects TypeScript language", () => {
    expect(FileScanner.detectLanguage("src/index.ts")).toBe("typescript");
    expect(FileScanner.detectLanguage("src/App.tsx")).toBe("typescript");
  });

  it("detects Python language", () => {
    expect(FileScanner.detectLanguage("main.py")).toBe("python");
  });

  it("returns null for unknown extensions", () => {
    expect(FileScanner.detectLanguage("data.csv")).toBeNull();
    expect(FileScanner.detectLanguage("README.md")).toBeNull();
  });
});
