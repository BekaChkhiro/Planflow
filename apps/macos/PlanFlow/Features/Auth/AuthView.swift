import SwiftUI

struct AuthView: View {
    @Environment(AppState.self) private var appState

    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""

    var body: some View {
        HStack(spacing: 0) {
            brandPanel
                .frame(maxWidth: 620)
            formPanel
                .frame(minWidth: 340, maxWidth: 440)
        }
        .frame(minHeight: 560)
    }

    private var brandPanel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            Image(systemName: "square.stack.3d.up.fill")
                .font(.system(size: 44))
                .foregroundStyle(Theme.accent)
            Text("PlanFlow")
                .font(.system(size: 36, weight: .bold))
            Text("Plan, build and ship with an embedded Claude agent that works directly in your codebase.")
                .font(.title3)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            featureRow("bubble.left.and.text.bubble.right", "Headless Claude chat in every workspace")
            featureRow("checklist", "Create & track plan tasks from chat")
            featureRow("folder.badge.gearshape", "Link any local folder as a project")
        }
        .padding(Theme.Spacing.xl * 1.5)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(LinearGradient(colors: [Theme.accent.opacity(0.18), Color.subtleBackground],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    private func featureRow(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: symbol).foregroundStyle(Theme.accent).frame(width: 24)
            Text(text).foregroundStyle(.secondary)
        }
    }

    private var formPanel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            Text(isRegistering ? "Create your account" : "Welcome back")
                .font(.title.weight(.semibold))

            VStack(spacing: Theme.Spacing.md) {
                if isRegistering {
                    LabeledField(title: "Name", text: $name, prompt: "Ada Lovelace")
                }
                LabeledField(title: "Email", text: $email, prompt: "you@example.com")
                LabeledField(title: "Password", text: $password, prompt: "••••••••", isSecure: true)
            }

            if let error = appState.authError {
                Text(error).font(.callout).foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button(action: submit) {
                HStack {
                    if appState.isAuthenticating { ProgressView().controlSize(.small) }
                    Text(isRegistering ? "Sign Up" : "Sign In")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(appState.isAuthenticating || email.isEmpty || password.isEmpty)

            Button(isRegistering ? "Have an account? Sign in" : "New here? Create an account") {
                appState.authError = nil
                isRegistering.toggle()
            }
            .buttonStyle(.link)

            Spacer()
            Text("API: \(AppConfig.apiBaseURL.host ?? "—")")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(Theme.Spacing.xl)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.cardBackground)
        .onSubmit(submit)
    }

    private func submit() {
        Task {
            if isRegistering {
                await appState.register(email: email, password: password, name: name.isEmpty ? nil : name)
            } else {
                await appState.login(email: email, password: password)
            }
        }
    }
}

struct LabeledField: View {
    let title: String
    @Binding var text: String
    var prompt: String = ""
    var isSecure = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Group {
                if isSecure {
                    SecureField(prompt, text: $text)
                } else {
                    TextField(prompt, text: $text)
                }
            }
            .textFieldStyle(.roundedBorder)
            .controlSize(.large)
            .accessibilityLabel(title)
        }
    }
}
