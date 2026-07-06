import SwiftUI

struct PermissionRequestView: View {
    let request: PermissionRequest
    let onDecision: (PermissionDecision) -> Void

    private var toolLabel: String {
        request.toolName.hasPrefix("mcp__")
            ? String(request.toolName.split(separator: "_").last ?? "")
            : request.toolName
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack(spacing: Theme.Spacing.sm) {
                Image(systemName: "hand.raised.fill").foregroundStyle(.orange)
                Text("Allow **\(toolLabel)**?").font(.headline)
                Spacer()
                Pill(text: "Permission", color: .orange)
            }

            if let summary = relevantInput {
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(summary)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                        .padding(Theme.Spacing.sm)
                }
                .frame(maxHeight: 120)
                .background(Color.subtleBackground, in: RoundedRectangle(cornerRadius: Theme.Radius.sm))
            }

            HStack {
                Button("Deny") { onDecision(.deny(reason: "Denied by user")) }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Allow Once") { onDecision(.allow(updatedInput: nil)) }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(Theme.Spacing.lg)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Theme.Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg)
            .strokeBorder(Color.orange.opacity(0.4), lineWidth: 1))
        .padding(Theme.Spacing.md)
        .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
    }

    private var relevantInput: String? {
        let s = request.input.displayString
        return s.isEmpty || s == "{}" ? nil : s
    }
}
