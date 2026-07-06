import Foundation

/// High-level typed endpoints built on top of `APIClient`.
enum PlanFlowAPI {
    private static var client: APIClient { .shared }

    // MARK: Auth
    struct Credentials: Encodable { let email: String; let password: String }
    struct RegisterBody: Encodable { let email: String; let password: String; let name: String? }

    static func login(email: String, password: String) async throws -> AuthSession {
        try await client.request("auth/login", method: .POST,
                                 body: Credentials(email: email, password: password),
                                 authenticated: false, as: AuthSession.self)
    }

    static func register(email: String, password: String, name: String?) async throws -> AuthSession {
        try await client.request("auth/register", method: .POST,
                                 body: RegisterBody(email: email, password: password, name: name),
                                 authenticated: false, as: AuthSession.self)
    }

    static func me() async throws -> CurrentUser {
        try await client.request("auth/me", as: CurrentUser.self)
    }

    static func logout() async {
        _ = try? await client.status("auth/logout", method: .POST, authenticated: true)
    }

    // MARK: Organizations
    static func organizations() async throws -> [Organization] {
        // The API wraps the array: `data: { organizations: [...] }`.
        struct Wrapper: Decodable { let organizations: [Organization] }
        if let wrapped = try? await client.request("organizations", as: Wrapper.self) {
            return wrapped.organizations
        }
        return (try? await client.request("organizations", as: [Organization].self)) ?? []
    }

    // MARK: Projects
    static func projects(organizationId: String, includeArchived: Bool = false) async throws -> [Project] {
        var query = ["organizationId": organizationId]
        if includeArchived { query["includeArchived"] = "true" }
        return try await fetchList("projects", query: query, key: "projects", as: Project.self)
    }

    static func project(_ id: String) async throws -> Project {
        try await client.request("projects/\(id)", as: Project.self)
    }

    static func createProject(organizationId: String, name: String, description: String?) async throws -> Project {
        struct Body: Encodable { let organizationId: String; let name: String; let description: String? }
        return try await client.request("projects", method: .POST,
                                        body: Body(organizationId: organizationId, name: name, description: description),
                                        as: Project.self)
    }

    // MARK: Tasks
    static func tasks(projectId: String) async throws -> [PlanTask] {
        try await fetchList("projects/\(projectId)/tasks", key: "tasks", as: PlanTask.self)
    }

    static func updateTaskStatus(projectId: String, taskId: String, status: TaskStatus) async throws {
        struct Body: Encodable { let status: String }
        _ = try await client.status("projects/\(projectId)/tasks/\(taskId)", method: .PATCH,
                                    body: Body(status: status.rawValue))
    }

    static func updateTaskDetails(projectId: String, taskId: String, details: String) async throws {
        struct Body: Encodable { let details: String }
        _ = try await client.status("projects/\(projectId)/tasks/\(taskId)", method: .PATCH,
                                    body: Body(details: details))
    }

    // MARK: Attachments
    static func attachments(projectId: String, taskId: String) async throws -> [TaskAttachment] {
        try await fetchList("projects/\(projectId)/tasks/\(taskId)/attachments",
                            key: "attachments", as: TaskAttachment.self)
    }

    static func uploadAttachment(projectId: String, taskId: String,
                                 fileData: Data, filename: String, mimeType: String) async throws -> TaskAttachment {
        try await client.upload("projects/\(projectId)/tasks/\(taskId)/attachments",
                                fileData: fileData, filename: filename, mimeType: mimeType,
                                as: TaskAttachment.self)
    }

    static func deleteAttachment(projectId: String, attachmentId: String) async throws {
        _ = try await client.status("projects/\(projectId)/attachments/\(attachmentId)", method: .DELETE)
    }

    static func comments(projectId: String, taskId: String) async throws -> [Comment] {
        try await fetchList("projects/\(projectId)/tasks/\(taskId)/comments", key: "comments", as: Comment.self)
    }

    static func addComment(projectId: String, taskId: String, content: String) async throws -> Comment {
        struct Body: Encodable { let content: String }
        return try await client.request("projects/\(projectId)/tasks/\(taskId)/comments", method: .POST,
                                        body: Body(content: content), as: Comment.self)
    }

    // MARK: Pipeline (server-side sequential orchestrator)
    static func pipelineStatus(projectId: String) async -> PipelineState? {
        try? await client.request("projects/\(projectId)/pipeline", as: PipelineState.self)
    }

    static func pipelineStart(projectId: String, fireUrl: String, token: String) async throws -> PipelineState {
        struct Body: Encodable { let fireUrl: String; let token: String }
        return try await client.request("projects/\(projectId)/pipeline/start", method: .POST,
                                        body: Body(fireUrl: fireUrl, token: token), as: PipelineState.self)
    }

    static func pipelinePause(projectId: String) async throws -> PipelineState {
        try await client.request("projects/\(projectId)/pipeline/pause", method: .POST, as: PipelineState.self)
    }

    static func pipelineResume(projectId: String) async throws -> PipelineState {
        try await client.request("projects/\(projectId)/pipeline/resume", method: .POST, as: PipelineState.self)
    }

    static func pipelineStop(projectId: String) async {
        _ = try? await client.status("projects/\(projectId)/pipeline", method: .DELETE)
    }

    // MARK: Activity
    static func activity(projectId: String) async throws -> [ActivityEntry] {
        try await fetchList("projects/\(projectId)/activity", key: "items", as: ActivityEntry.self)
    }

    // MARK: Notifications
    static func notifications() async throws -> [AppNotification] {
        try await fetchList("notifications", key: "notifications", as: AppNotification.self)
    }

    static func unreadCount() async throws -> Int {
        struct Count: Decodable { let count: Int? ; let unreadCount: Int? }
        let c = try await client.request("notifications/unread-count", as: Count.self)
        return c.count ?? c.unreadCount ?? 0
    }

    // MARK: Helpers

    /// Fetches a list that may be returned either as a bare array (`data: [...]`)
    /// or wrapped under a named key (`data: { projects: [...] }`).
    private static func fetchList<T: Decodable>(
        _ path: String, query: [String: String] = [:], key: String, as type: T.Type
    ) async throws -> [T] {
        // Try a bare array first.
        if let array = try? await client.request(path, query: query, as: [T].self) {
            return array
        }
        // Fall back to the paginated/keyed wrapper.
        let paginated = try await client.request(path, query: query, as: Paginated<T>.self)
        return paginated.items
    }
}
