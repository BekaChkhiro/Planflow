import SwiftUI

/// Vertical offset reserved at the top of each column for the window's
/// traffic-light controls (since we hide the system title bar).
enum Chrome {
    static let topInset: CGFloat = 32
}

/// A custom in-content top bar used instead of the macOS window toolbar, so the
/// chrome blends seamlessly with the dark canvas. Hosts a sidebar toggle plus
/// leading / centered / trailing content.
struct ChromeHeader<Leading: View, Center: View, Trailing: View>: View {
    var toggleSidebar: () -> Void
    @ViewBuilder var leading: Leading
    @ViewBuilder var center: Center
    @ViewBuilder var trailing: Trailing

    var body: some View {
        ZStack {
            center
            HStack(spacing: Theme.Spacing.md) {
                Button(action: toggleSidebar) {
                    Image(systemName: "sidebar.leading").font(.body)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Toggle sidebar")
                leading
                Spacer(minLength: Theme.Spacing.md)
                trailing
            }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Chrome.topInset)
        .padding(.bottom, Theme.Spacing.sm)
    }
}

/// A pill segmented control for the project tabs (Chat / Tasks / Plan / Activity).
struct SegmentedTabBar: View {
    @Binding var selection: ProjectTab

    var body: some View {
        HStack(spacing: 2) {
            ForEach(ProjectTab.allCases) { tab in
                Button {
                    withAnimation(.snappy) { selection = tab }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: tab.symbol).font(.caption2)
                        Text(tab.rawValue).font(.callout.weight(.medium))
                    }
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.vertical, 5)
                    .foregroundStyle(selection == tab ? Color.primary : Color.secondary)
                    .background(selection == tab ? Color.surfaceHover : Color.clear, in: Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Color.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.hairline, lineWidth: 1))
    }
}
