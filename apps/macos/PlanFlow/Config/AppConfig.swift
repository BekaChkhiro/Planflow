import Foundation

/// Central app configuration. Defaults point at the PlanFlow production API.
/// The API base can be overridden at runtime (Settings → Advanced) and is
/// persisted in UserDefaults so developers can target a local server.
enum AppConfig {
    /// Production REST API base. Overridable via UserDefaults key `apiBaseURL`.
    static let defaultAPIBaseURL = URL(string: "https://api.planflow.tools")!

    /// UserDefaults key holding a custom API base URL override.
    static let apiBaseURLKey = "apiBaseURL"

    static var apiBaseURL: URL {
        if let raw = UserDefaults.standard.string(forKey: apiBaseURLKey),
           let url = URL(string: raw), url.scheme != nil {
            return url
        }
        return defaultAPIBaseURL
    }

    /// WebSocket endpoint derived from the API base (`/ws`, http→ws).
    static var webSocketURL: URL {
        var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false)!
        components.scheme = (components.scheme == "https") ? "wss" : "ws"
        components.path = "/ws"
        return components.url!
    }

    /// Keychain service identifier for stored credentials.
    static let keychainService = "tools.planflow.mac"

    /// Marketing version string.
    static var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }
}
