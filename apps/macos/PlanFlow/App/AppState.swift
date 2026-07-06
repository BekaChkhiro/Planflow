import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    enum AuthStatus: Equatable {
        case unknown        // checking stored credentials
        case signedOut
        case signedIn
    }

    var authStatus: AuthStatus = .unknown
    var currentUser: User?
    var subscription: Subscription?

    var organizations: [Organization] = []
    var selectedOrganization: Organization?

    var authError: String?
    var isAuthenticating = false

    init() {
        // Optimistically restore a cached session; validated by `bootstrap()`.
        if TokenStore.accessToken != nil, let user = TokenStore.cachedUser {
            currentUser = user
            authStatus = .signedIn
        } else {
            authStatus = .signedOut
        }
        observeAuthLoss()
    }

    // MARK: - Lifecycle

    /// Validates the restored session against the server and loads orgs.
    func bootstrap() async {
        guard TokenStore.accessToken != nil else {
            authStatus = .signedOut
            return
        }
        do {
            let me = try await PlanFlowAPI.me()
            currentUser = me.user
            subscription = me.subscription
            TokenStore.cachedUser = me.user
            authStatus = .signedIn
            await loadOrganizations()
        } catch APIError.unauthorized, APIError.notAuthenticated {
            await signOutLocally()
        } catch {
            // Network hiccup: keep optimistic signed-in state if we had a cached user.
            if currentUser == nil { await signOutLocally() }
            else { authStatus = .signedIn; await loadOrganizations() }
        }
    }

    func loadOrganizations() async {
        do {
            organizations = try await PlanFlowAPI.organizations()
            if selectedOrganization == nil { selectedOrganization = organizations.first }
        } catch {
            // Non-fatal.
        }
    }

    // MARK: - Auth actions

    func login(email: String, password: String) async {
        await authenticate { try await PlanFlowAPI.login(email: email, password: password) }
    }

    func register(email: String, password: String, name: String?) async {
        await authenticate { try await PlanFlowAPI.register(email: email, password: password, name: name) }
    }

    private func authenticate(_ action: () async throws -> AuthSession) async {
        isAuthenticating = true
        authError = nil
        defer { isAuthenticating = false }
        do {
            let session = try await action()
            TokenStore.save(session)
            currentUser = session.user
            authStatus = .signedIn
            await loadOrganizations()
        } catch {
            authError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func signOut() async {
        await PlanFlowAPI.logout()
        await signOutLocally()
    }

    private func signOutLocally() async {
        TokenStore.clear()
        currentUser = nil
        subscription = nil
        organizations = []
        selectedOrganization = nil
        authStatus = .signedOut
    }

    private func observeAuthLoss() {
        Task { [weak self] in
            for await _ in APIClient.shared.authLost.stream {
                await self?.signOutLocally()
            }
        }
    }
}
