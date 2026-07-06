import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Editable full-spec (`details`) section for a task, rendering markdown and
/// toggling to a text editor that PATCHes `details` back to the API.
struct TaskDetailsSection: View {
    let projectId: String
    let taskId: String
    @State private var details: String
    @State private var editing = false
    @State private var draft = ""
    @State private var saving = false
    @State private var error: String?

    init(projectId: String, taskId: String, initialDetails: String?) {
        self.projectId = projectId
        self.taskId = taskId
        _details = State(initialValue: initialDetails ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text("DETAILS").font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
                Spacer()
                if !editing {
                    Button(details.isEmpty ? "Add" : "Edit") {
                        draft = details
                        editing = true
                    }
                    .buttonStyle(.plain).font(.caption.weight(.medium)).foregroundStyle(Color.accent)
                }
            }

            if editing {
                TextEditor(text: $draft)
                    .font(.callout.monospaced())
                    .frame(minHeight: 160)
                    .padding(6)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .strokeBorder(Color.hairline, lineWidth: 1))
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
                HStack {
                    Spacer()
                    Button("Cancel") { editing = false; error = nil }
                        .buttonStyle(.plain).controlSize(.small)
                    Button("Save") { Task { await save() } }
                        .controlSize(.small).disabled(saving)
                }
            } else if details.isEmpty {
                Text("No detailed spec yet. Add one so the agent has the task's full context.")
                    .font(.callout).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                MarkdownView(markdown: details)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func save() async {
        saving = true; error = nil
        do {
            try await PlanFlowAPI.updateTaskDetails(projectId: projectId, taskId: taskId, details: draft)
            details = draft
            editing = false
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

/// Files & images attached to a task: upload via a file picker, preview images,
/// and delete. Images use the presigned `downloadUrl` directly.
struct TaskAttachmentsSection: View {
    let projectId: String
    let taskId: String
    @State private var items: [TaskAttachment] = []
    @State private var loading = true
    @State private var uploading = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text("ATTACHMENTS").font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
                if !items.isEmpty {
                    Text("\(items.count)").font(.caption2).foregroundStyle(.tertiary)
                }
                Spacer()
                Button {
                    pickAndUpload()
                } label: {
                    if uploading {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Add", systemImage: "paperclip").font(.caption.weight(.medium))
                    }
                }
                .buttonStyle(.plain).foregroundStyle(Color.accent).disabled(uploading)
            }

            if let error { Text(error).font(.caption).foregroundStyle(.red) }

            if loading {
                Text("Loading…").font(.callout).foregroundStyle(.secondary)
            } else if items.isEmpty {
                Text("No files yet. Add mockups, screenshots, or references — the agent can see images.")
                    .font(.callout).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: Theme.Spacing.sm) {
                    ForEach(items) { item in row(item) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await load() }
    }

    private func row(_ item: TaskAttachment) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Group {
                if item.isImage, let s = item.downloadUrl, let url = URL(string: s) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            Color.surface
                        }
                    }
                } else {
                    Image(systemName: item.isImage ? "photo" : "doc")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.surface)
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))

            VStack(alignment: .leading, spacing: 2) {
                if let s = item.downloadUrl, let url = URL(string: s) {
                    Link(item.filename, destination: url).font(.callout).lineLimit(1)
                } else {
                    Text(item.filename).font(.callout).lineLimit(1)
                }
                Text(item.sizeLabel).font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Button { Task { await delete(item) } } label: {
                Image(systemName: "trash").foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(Theme.Spacing.sm)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).strokeBorder(Color.hairline, lineWidth: 1))
    }

    private func load() async {
        loading = true
        do {
            items = try await PlanFlowAPI.attachments(projectId: projectId, taskId: taskId)
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func pickAndUpload() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        guard panel.runModal() == .OK else { return }
        let urls = panel.urls
        Task { await upload(urls) }
    }

    private func upload(_ urls: [URL]) async {
        uploading = true; error = nil
        for url in urls {
            do {
                let data = try Data(contentsOf: url)
                let mime = (UTType(filenameExtension: url.pathExtension)?.preferredMIMEType)
                    ?? "application/octet-stream"
                _ = try await PlanFlowAPI.uploadAttachment(
                    projectId: projectId, taskId: taskId,
                    fileData: data, filename: url.lastPathComponent, mimeType: mime)
            } catch {
                self.error = error.localizedDescription
                break
            }
        }
        await load()
        uploading = false
    }

    private func delete(_ item: TaskAttachment) async {
        items.removeAll { $0.id == item.id }
        try? await PlanFlowAPI.deleteAttachment(projectId: projectId, attachmentId: item.id)
    }
}
