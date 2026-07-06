import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case notAuthenticated
    case unauthorized            // 401 after refresh attempt
    case server(status: Int, message: String?)
    case decoding(Error)
    case transport(Error)
    case message(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL."
        case .notAuthenticated: return "You are not signed in."
        case .unauthorized: return "Your session expired. Please sign in again."
        case .server(let status, let message):
            return message ?? "Server error (\(status))."
        case .decoding(let e): return "Failed to read server response: \(e.localizedDescription)"
        case .transport(let e): return e.localizedDescription
        case .message(let m): return m
        }
    }
}
