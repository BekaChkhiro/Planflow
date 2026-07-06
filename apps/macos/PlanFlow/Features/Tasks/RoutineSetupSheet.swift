import SwiftUI

/// Per-project setup for the Claude Code routine used to run tasks autonomously.
/// The user creates the routine (bound to this project's repo, with an API
/// trigger) at claude.ai/code/routines, then pastes its /fire URL and token here.
struct RoutineSetupSheet: View {
    let project: Project
    @Environment(RoutineConfigStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var fireURL = ""
    @State private var token = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Task automation").font(.title3.weight(.semibold))
                Text("Runs each task as an autonomous Claude Code cloud session for “\(project.name)”.")
                    .font(.callout).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            steps

            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                LabeledField(title: "Routine /fire URL", text: $fireURL,
                             prompt: "https://api.anthropic.com/v1/claude_code/routines/trig_…/fire")
                LabeledField(title: "Bearer token", text: $token,
                             prompt: "sk-ant-oat01-…", isSecure: true)
            }

            HStack {
                Button("Open claude.ai/code/routines") {
                    if let url = URL(string: "https://claude.ai/code/routines") { openURL(url) }
                }
                if store.hasConfig(for: project.id) {
                    Button("Remove", role: .destructive) { store.clear(for: project.id); dismiss() }
                }
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    store.save(RoutineConfig(fireURL: fireURL.trimmingCharacters(in: .whitespaces),
                                             token: token.trimmingCharacters(in: .whitespaces)),
                               for: project.id)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(!RoutineConfig(fireURL: fireURL, token: token).isValid)
            }
        }
        .padding(Theme.Spacing.xl)
        .frame(width: 560)
        .onAppear {
            if let config = store.config(for: project.id) {
                fireURL = config.fireURL
                token = config.token
            }
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            step(1, "Create a routine bound to this project's GitHub repo, with an **API trigger**.")
            step(2, "Give it a prompt that reads the task from the request `text` and implements it, and include **planflow-mcp** as a connector so it can mark the task done.")
            step(3, "Generate a token, then copy the **/fire URL** and **token** into the fields below.")
        }
        .padding(Theme.Spacing.md)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Text("\(n)").font(.caption.weight(.bold)).foregroundStyle(Color.accent)
                .frame(width: 16)
            Text(LocalizedStringKey(text)).font(.callout).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
