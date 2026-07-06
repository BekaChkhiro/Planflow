import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    @AppStorage(AppConfig.apiBaseURLKey) private var apiBaseURL = ""
    @AppStorage(ClaudeBinaryLocator.overrideKey) private var claudeBinaryPath = ""

    @State private var resolvedBinary: String?

    var body: some View {
        TabView {
            accountTab.tabItem { Label("Account", systemImage: "person.crop.circle") }
            agentTab.tabItem { Label("Agent", systemImage: "sparkles") }
            advancedTab.tabItem { Label("Advanced", systemImage: "gearshape.2") }
        }
        .padding(Theme.Spacing.lg)
        .onAppear { resolvedBinary = ClaudeBinaryLocator.resolve() }
    }

    private var accountTab: some View {
        Form {
            LabeledContent("Name", value: appState.currentUser?.displayName ?? "—")
            LabeledContent("Email", value: appState.currentUser?.email ?? "—")
            LabeledContent("Plan", value: appState.subscription?.tier?.capitalized ?? "Free")
            LabeledContent("Organization", value: appState.selectedOrganization?.name ?? "—")
            Section {
                Button("Sign Out", role: .destructive) { Task { await appState.signOut() } }
            }
        }
        .formStyle(.grouped)
    }

    private var agentTab: some View {
        Form {
            Section("Claude CLI") {
                LabeledContent("Detected") {
                    Text(resolvedBinary ?? "Not found")
                        .foregroundStyle(resolvedBinary == nil ? .red : .secondary)
                        .font(.callout.monospaced()).lineLimit(1).truncationMode(.middle)
                }
                TextField("Custom path (optional)", text: $claudeBinaryPath)
                    .font(.callout.monospaced())
                Text("The agent runs `claude -p` in stream-json mode inside the linked folder. Leave the path empty to auto-detect.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    private var advancedTab: some View {
        Form {
            Section("API") {
                TextField("API base URL", text: $apiBaseURL, prompt: Text(AppConfig.defaultAPIBaseURL.absoluteString))
                    .font(.callout.monospaced())
                Text("Override the PlanFlow API endpoint. Leave empty for production (\(AppConfig.defaultAPIBaseURL.host ?? "")). Sign out and back in after changing.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section {
                LabeledContent("Version", value: AppConfig.version)
                LabeledContent("WebSocket", value: AppConfig.webSocketURL.absoluteString)
            }
        }
        .formStyle(.grouped)
    }
}
