import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        content.background(WindowConfigurator())
    }

    @ViewBuilder
    private var content: some View {
        switch appState.authStatus {
        case .unknown:
            ProgressView("Loading…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .signedOut:
            AuthView()
        case .signedIn:
            MainView()
        }
    }
}
