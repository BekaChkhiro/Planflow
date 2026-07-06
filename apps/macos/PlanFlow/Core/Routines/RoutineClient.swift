import Foundation

struct RoutineFireResult {
    let sessionId: String
    let sessionURL: String
}

enum RoutineError: LocalizedError {
    case invalidConfig
    case http(status: Int, body: String?)
    case transport(Error)
    case decoding

    var errorDescription: String? {
        switch self {
        case .invalidConfig: return "The routine URL or token is missing or invalid."
        case .http(let status, let body): return "Routine API error (\(status)): \(body ?? "")"
        case .transport(let e): return e.localizedDescription
        case .decoding: return "Unexpected response from the routine API."
        }
    }
}

/// Calls a routine's `/fire` endpoint to start an autonomous cloud Claude Code
/// session. See https://code.claude.com/docs/en/routines.
enum RoutineClient {
    static let betaHeader = "experimental-cc-routine-2026-04-01"

    static func fire(_ config: RoutineConfig, text: String) async throws -> RoutineFireResult {
        guard config.isValid, let url = URL(string: config.fireURL) else {
            throw RoutineError.invalidConfig
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        request.setValue(betaHeader, forHTTPHeaderField: "anthropic-beta")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text])

        let data: Data, response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw RoutineError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else { throw RoutineError.decoding }
        guard (200..<300).contains(http.statusCode) else {
            throw RoutineError.http(status: http.statusCode, body: String(data: data, encoding: .utf8))
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sessionId = json["claude_code_session_id"] as? String else {
            throw RoutineError.decoding
        }
        let sessionURL = json["claude_code_session_url"] as? String
            ?? "https://claude.ai/code/\(sessionId)"
        return RoutineFireResult(sessionId: sessionId, sessionURL: sessionURL)
    }
}
