import SwiftUI

/// Container that hosts the active chat session plus a right-hand list of the
/// project's sessions. Sessions live in the store, so they keep running across
/// navigation and can run in parallel.
struct ChatView: View {
    let context: ChatContext
    var onLinkFolder: (() -> Void)?
    @Environment(ChatSessionStore.self) private var sessions
    @State private var showSessions = true

    var body: some View {
        let active = sessions.selected(for: context)
        HStack(spacing: 0) {
            ChatSessionView(vm: active, onLinkFolder: onLinkFolder) {
                showSessions.toggle()
            }
            .id(active.sessionKey)

            if showSessions {
                SessionListPanel(context: context)
                    .frame(width: 260)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: showSessions)
    }
}

struct ChatSessionView: View {
    @Bindable var vm: ChatViewModel
    var onLinkFolder: (() -> Void)?
    var toggleSessions: () -> Void = {}
    static let columnWidth: CGFloat = 720

    var body: some View {
        VStack(spacing: 0) {
            transcript
            if let permission = vm.pendingPermission {
                PermissionRequestView(request: permission) { decision in
                    vm.respondToPermission(decision)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            sessionBar
            inputBar
        }
        .background(Color.canvas)
        .animation(.snappy, value: vm.pendingPermission?.id)
    }

    // MARK: Session bar

    private var sessionBar: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Circle().fill(vm.isBusy ? Color.green : Color.secondary.opacity(0.5))
                .frame(width: 7, height: 7)
            Text(vm.sessionInfo ?? "Ready")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            Spacer()
            if vm.isBusy {
                Button(role: .destructive) { vm.stop() } label: {
                    Label("Stop", systemImage: "stop.fill").labelStyle(.titleAndIcon)
                }
                .buttonStyle(.borderless).controlSize(.small)
            }
            if !vm.messages.isEmpty {
                Button { vm.clearHistory() } label: {
                    Image(systemName: "square.and.pencil")
                }
                .buttonStyle(.borderless)
                .help("New chat (clears this conversation)")
            }
            ModelPicker(model: $vm.selectedModel)
            Button(action: toggleSessions) {
                Image(systemName: "sidebar.right")
            }
            .buttonStyle(.borderless)
            .help("Toggle sessions panel")
        }
        .frame(maxWidth: Self.columnWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, Theme.Spacing.sm)
    }

    // MARK: Transcript

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    if vm.messages.isEmpty { emptyState }
                    ForEach(vm.messages) { message in
                        ChatMessageView(message: message).id(message.id)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .frame(maxWidth: Self.columnWidth)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.lg)
            }
            .onChange(of: vm.messages.count) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: vm.messages.last?.text) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.md) {
            Image(systemName: "sparkle")
                .font(.system(size: 22)).foregroundStyle(.tertiary)
            Text("Ask Claude about \(vm.context.displayName)")
                .font(.headline)
            Text(vm.context.isFolderLinked ? "Runs in your linked folder" : "Linked via planflow-mcp")
                .font(.caption).foregroundStyle(.tertiary)
            VStack(spacing: Theme.Spacing.sm) {
                SuggestionChip("Scaffold a plan and create the tasks") { vm.inputText = $0 }
                SuggestionChip("What are the open tasks? Start the next one.") { vm.inputText = $0 }
                SuggestionChip("Explain how authentication works here") { vm.inputText = $0 }
            }
            .padding(.top, Theme.Spacing.sm)
        }
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity)
        .padding(.top, 100)
    }

    // MARK: Input

    private var inputBar: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.sm) {
            TextField("Message the agent…", text: $vm.inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.callout)
                .lineLimit(1...8)
                .padding(.vertical, 6)
                .onSubmit { vm.send() }

            Button(action: vm.send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(vm.canSend ? Color.white : Color.secondary)
                    .frame(width: 26, height: 26)
                    .background(vm.canSend ? Color.accent : Color.surfaceHover, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!vm.canSend)
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(.vertical, Theme.Spacing.xs)
        .padding(.leading, Theme.Spacing.md)
        .padding(.trailing, Theme.Spacing.xs)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
        .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
        .frame(maxWidth: Self.columnWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, Theme.Spacing.md)
    }
}

/// A minimal ghost suggestion chip for the chat empty state.
private struct SuggestionChip: View {
    let text: String
    let onTap: (String) -> Void
    @State private var hovering = false

    init(_ text: String, onTap: @escaping (String) -> Void) {
        self.text = text
        self.onTap = onTap
    }

    var body: some View {
        Button { onTap(text) } label: {
            Text(text)
                .font(.callout)
                .foregroundStyle(hovering ? Color.primary : Color.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                .background(hovering ? Color.surfaceHover : Color.clear,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .strokeBorder(Color.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

struct ModelPicker: View {
    @Binding var model: AgentModel

    var body: some View {
        Menu {
            ForEach(AgentModel.allCases) { option in
                Button {
                    model = option
                } label: {
                    if model == option { Label(option.rawValue, systemImage: "checkmark") }
                    else { Text(option.rawValue) }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "cpu").font(.caption2)
                Text(model.rawValue).font(.caption.weight(.medium))
            }
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, 4)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.visible)
        .fixedSize()
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
        .help("Model for the agent. Applies to the next session start.")
    }
}
