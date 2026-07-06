import SwiftUI

/// A lightweight block-level Markdown renderer suitable for viewing
/// PROJECT_PLAN.md-style documents. Handles headings, paragraphs, ordered &
/// unordered lists, fenced code blocks, blockquotes and horizontal rules.
/// Inline emphasis/code/links are rendered via `AttributedString`.
struct MarkdownView: View {
    let markdown: String

    private var blocks: [MarkdownBlock] { MarkdownParser.parse(markdown) }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func view(for block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            MarkdownInline(text).font(headingFont(level)).bold()
                .padding(.top, level <= 2 ? Theme.Spacing.sm : 0)
        case .paragraph(let text):
            MarkdownInline(text).font(.body).lineSpacing(2)
        case .bullet(let items):
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                        Text("•").foregroundStyle(.secondary)
                        MarkdownInline(item).font(.body)
                    }
                }
            }
        case .ordered(let items):
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                        Text("\(index + 1).").foregroundStyle(.secondary).monospacedDigit()
                        MarkdownInline(item).font(.body)
                    }
                }
            }
        case .code(let code, let language):
            codeBlock(code, language: language)
        case .quote(let text):
            HStack(spacing: Theme.Spacing.md) {
                RoundedRectangle(cornerRadius: 2).fill(Color.accent.opacity(0.5)).frame(width: 3)
                MarkdownInline(text).font(.body).foregroundStyle(.secondary)
            }
        case .table(let headers, let rows):
            MarkdownTable(headers: headers, rows: rows)
        case .divider:
            Divider().padding(.vertical, Theme.Spacing.xs)
        }
    }

    private func codeBlock(_ code: String, language: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let language, !language.isEmpty {
                Text(language.uppercased())
                    .font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
                    .padding(.bottom, Theme.Spacing.xs)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.callout.monospaced())
                    .fixedSize()
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title.weight(.bold)
        case 2: return .title2.weight(.semibold)
        case 3: return .title3.weight(.semibold)
        case 4: return .headline
        default: return .subheadline.weight(.semibold)
        }
    }
}

/// Renders a single line of inline markdown (bold/italic/code/links).
struct MarkdownInline: View {
    let raw: String
    init(_ raw: String) { self.raw = raw }

    var body: some View {
        if let attributed = try? AttributedString(
            markdown: raw,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            Text(attributed).tint(Color.accent)
        } else {
            Text(raw)
        }
    }
}

// MARK: - Parser

enum MarkdownBlock {
    case heading(level: Int, text: String)
    case paragraph(String)
    case bullet([String])
    case ordered([String])
    case code(String, language: String?)
    case quote(String)
    case table(headers: [String], rows: [[String]])
    case divider
}

enum MarkdownParser {
    static func parse(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var i = 0

        var paragraph: [String] = []
        func flushParagraph() {
            if !paragraph.isEmpty {
                blocks.append(.paragraph(paragraph.joined(separator: " ")))
                paragraph.removeAll()
            }
        }

        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Fenced code block
            if trimmed.hasPrefix("```") {
                flushParagraph()
                let language = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var code: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[i]); i += 1
                }
                blocks.append(.code(code.joined(separator: "\n"), language: language.isEmpty ? nil : language))
                i += 1
                continue
            }

            // Blank line
            if trimmed.isEmpty { flushParagraph(); i += 1; continue }

            // Horizontal rule
            if trimmed == "---" || trimmed == "***" || trimmed == "___" {
                flushParagraph(); blocks.append(.divider); i += 1; continue
            }

            // Table: a `| ... |` header row followed by a `| --- | --- |` separator.
            if trimmed.hasPrefix("|"), i + 1 < lines.count,
               isTableSeparator(lines[i + 1].trimmingCharacters(in: .whitespaces)) {
                flushParagraph()
                let headers = parseTableRow(trimmed)
                i += 2 // skip header + separator
                var rows: [[String]] = []
                while i < lines.count {
                    let row = lines[i].trimmingCharacters(in: .whitespaces)
                    guard row.hasPrefix("|") else { break }
                    rows.append(parseTableRow(row))
                    i += 1
                }
                blocks.append(.table(headers: headers, rows: rows))
                continue
            }

            // Heading
            if let heading = parseHeading(trimmed) {
                flushParagraph(); blocks.append(heading); i += 1; continue
            }

            // Blockquote (collect consecutive)
            if trimmed.hasPrefix(">") {
                flushParagraph()
                var quote: [String] = []
                while i < lines.count, lines[i].trimmingCharacters(in: .whitespaces).hasPrefix(">") {
                    quote.append(String(lines[i].trimmingCharacters(in: .whitespaces).dropFirst()).trimmingCharacters(in: .whitespaces))
                    i += 1
                }
                blocks.append(.quote(quote.joined(separator: " ")))
                continue
            }

            // Unordered list (tolerates blank lines between items)
            if isBullet(trimmed) {
                flushParagraph()
                let (items, next) = collectList(lines, from: i, matches: isBullet, strip: stripBullet)
                blocks.append(.bullet(items)); i = next
                continue
            }

            // Ordered list (tolerates blank lines between items)
            if isOrdered(trimmed) {
                flushParagraph()
                let (items, next) = collectList(lines, from: i, matches: isOrdered, strip: stripOrdered)
                blocks.append(.ordered(items)); i = next
                continue
            }

            // Paragraph text
            paragraph.append(trimmed)
            i += 1
        }
        flushParagraph()
        return blocks
    }

    private static func parseHeading(_ line: String) -> MarkdownBlock? {
        var level = 0
        for ch in line { if ch == "#" { level += 1 } else { break } }
        guard (1...6).contains(level), line.dropFirst(level).first == " " else { return nil }
        let text = String(line.dropFirst(level)).trimmingCharacters(in: .whitespaces)
        return .heading(level: level, text: text)
    }

    /// Collects consecutive list items, skipping single blank separator lines
    /// when the next non-blank line is still a list item of the same kind.
    private static func collectList(
        _ lines: [String], from start: Int,
        matches: (String) -> Bool, strip: (String) -> String
    ) -> ([String], Int) {
        var items: [String] = []
        var i = start
        while i < lines.count {
            let t = lines[i].trimmingCharacters(in: .whitespaces)
            if matches(t) { items.append(strip(t)); i += 1 }
            else if t.isEmpty {
                var j = i + 1
                while j < lines.count, lines[j].trimmingCharacters(in: .whitespaces).isEmpty { j += 1 }
                if j < lines.count, matches(lines[j].trimmingCharacters(in: .whitespaces)) { i = j }
                else { break }
            } else { break }
        }
        return (items, i)
    }

    private static func isBullet(_ line: String) -> Bool {
        line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ")
    }
    private static func stripBullet(_ line: String) -> String {
        String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
    }

    private static func isOrdered(_ line: String) -> Bool {
        guard let dotIndex = line.firstIndex(of: ".") else { return false }
        let prefix = line[line.startIndex..<dotIndex]
        return !prefix.isEmpty && prefix.allSatisfy(\.isNumber)
            && line.index(after: dotIndex) < line.endIndex
            && line[line.index(after: dotIndex)] == " "
    }
    private static func stripOrdered(_ line: String) -> String {
        guard let dotIndex = line.firstIndex(of: ".") else { return line }
        return String(line[line.index(after: dotIndex)...]).trimmingCharacters(in: .whitespaces)
    }

    /// A `| --- | :--: |` style separator row.
    private static func isTableSeparator(_ line: String) -> Bool {
        guard line.contains("|"), line.contains("-") else { return false }
        let cells = parseTableRow(line)
        guard !cells.isEmpty else { return false }
        return cells.allSatisfy { cell in
            let trimmed = cell.trimmingCharacters(in: .whitespaces)
            return !trimmed.isEmpty && trimmed.allSatisfy { $0 == "-" || $0 == ":" }
        }
    }

    private static func parseTableRow(_ line: String) -> [String] {
        var cells = line.split(separator: "|", omittingEmptySubsequences: false).map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        // Drop leading/trailing empties produced by the outer pipes.
        if cells.first == "" { cells.removeFirst() }
        if cells.last == "" { cells.removeLast() }
        return cells
    }
}

// MARK: - Table view

struct MarkdownTable: View {
    let headers: [String]
    let rows: [[String]]

    private var columnCount: Int {
        max(headers.count, rows.map(\.count).max() ?? 0)
    }

    var body: some View {
        VStack(spacing: 0) {
            row(headers, isHeader: true)
            ForEach(Array(rows.enumerated()), id: \.offset) { index, cells in
                Divider().overlay(Color.hairline)
                row(cells, isHeader: false)
                    .background(index.isMultiple(of: 2) ? Color.clear : Color.canvas.opacity(0.4))
            }
        }
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ cells: [String], isHeader: Bool) -> some View {
        HStack(spacing: 0) {
            ForEach(0..<columnCount, id: \.self) { col in
                let value = col < cells.count ? cells[col] : ""
                Group {
                    if isHeader {
                        Text(value).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    } else {
                        MarkdownInline(value).font(.callout)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                if col < columnCount - 1 {
                    Rectangle().fill(Color.hairline).frame(width: 1)
                }
            }
        }
    }
}
