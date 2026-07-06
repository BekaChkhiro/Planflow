import SwiftUI

enum Theme {
    static let accent = Color.accent

    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 36
    }

    enum Radius {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 6
        static let md: CGFloat = 9
        static let lg: CGFloat = 13
        static let xl: CGFloat = 18
    }
}

// MARK: - Palette (Codex-style, dark-first neutrals)

extension Color {
    /// App accent (refined indigo). Falls back to the asset accent color.
    static let accent = Color("AccentColor")

    /// Window / canvas background — near-black neutral.
    static let canvas = Color(light: Color(hex: 0xF7F7F8), dark: Color(hex: 0x0C0C0E))
    /// Sidebar / secondary surface.
    static let sidebar = Color(light: Color(hex: 0xF1F1F3), dark: Color(hex: 0x111114))
    /// Elevated surface (cards, popovers).
    static let surface = Color(light: .white, dark: Color(hex: 0x17171B))
    /// Hover / pressed surface.
    static let surfaceHover = Color(light: Color(hex: 0xEDEDEF), dark: Color(hex: 0x1E1E23))
    /// Selected surface tint.
    static let surfaceSelected = Color(light: Color(hex: 0xE6E6EA), dark: Color(hex: 0x26262D))
    /// Hairline border.
    static let hairline = Color(light: Color.black.opacity(0.08), dark: Color.white.opacity(0.08))
    /// Stronger border.
    static let stroke = Color(light: Color.black.opacity(0.12), dark: Color.white.opacity(0.12))

    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha)
    }

    /// Resolves to one of two colors based on the current appearance.
    init(light: Color, dark: Color) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(isDark ? dark : light)
        })
    }
}

// MARK: - Surfaces

/// A refined surface card with a hairline border.
struct Card<Content: View>: View {
    var padding: CGFloat = Theme.Spacing.md
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(padding)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .strokeBorder(Color.hairline, lineWidth: 1))
    }
}

/// A small status pill.
struct Pill: View {
    let text: String
    var color: Color = .secondary
    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2.5)
            .background(color.opacity(0.14), in: Capsule())
            .foregroundStyle(color)
    }
}

/// A soft, monochrome icon chip used for list/grid leading glyphs.
struct IconChip: View {
    let symbol: String
    var tint: Color = .accent
    var size: CGFloat = 30
    var body: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
            .fill(tint.opacity(0.14))
            .frame(width: size, height: size)
            .overlay(Image(systemName: symbol).font(.system(size: size * 0.45, weight: .medium)).foregroundStyle(tint))
    }
}

// MARK: - Helpers

extension Date {
    var relativeShort: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: self, relativeTo: Date())
    }
}

// Back-compat aliases used by earlier views.
extension Color {
    static let cardBackground = Color.surface
    static let subtleBackground = Color.canvas
    static let separatorColor = Color.hairline
}
