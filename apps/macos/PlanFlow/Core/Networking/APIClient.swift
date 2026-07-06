import Foundation

/// Tokens returned by `/auth/refresh` (user may be omitted).
private struct RefreshResult: Decodable {
    let token: String
    let refreshToken: String?
    let expiresIn: Int?
}

/// Async REST client for the PlanFlow API. Handles the `{success,data,error}`
/// envelope and transparently refreshes the access token on a 401.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var isRefreshing = false

    /// Notified when authentication is irrecoverably lost (refresh failed).
    /// The UI observes this to bounce the user back to the login screen.
    nonisolated let authLost = AsyncStream.makeStream(of: Void.self)

    init(session: URLSession = .shared) {
        self.session = session
    }

    enum Method: String { case GET, POST, PUT, PATCH, DELETE }

    // MARK: - Public request API

    /// Performs a request and decodes `data` from the envelope into `T`.
    func request<T: Decodable>(
        _ path: String,
        method: Method = .GET,
        query: [String: String] = [:],
        body: Encodable? = nil,
        authenticated: Bool = true,
        as type: T.Type = T.self
    ) async throws -> T {
        let data = try await perform(path, method: method, query: query, body: body, authenticated: authenticated)
        do {
            let envelope = try JSONDecoder.planflow.decode(APIResponse<T>.self, from: data)
            if let payload = envelope.data { return payload }
            if envelope.success, let empty = EmptyPayload() as? T { return empty }
            throw APIError.server(status: 200, message: envelope.error ?? envelope.message)
        } catch let error as APIError {
            throw error
        } catch {
            // Fall back to decoding the bare type (some endpoints skip the envelope).
            if let direct = try? JSONDecoder.planflow.decode(T.self, from: data) { return direct }
            throw APIError.decoding(error)
        }
    }

    /// Performs a request expecting only a success/error status (no payload).
    @discardableResult
    func status(
        _ path: String,
        method: Method = .POST,
        query: [String: String] = [:],
        body: Encodable? = nil,
        authenticated: Bool = true
    ) async throws -> Bool {
        let data = try await perform(path, method: method, query: query, body: body, authenticated: authenticated)
        let status = try? JSONDecoder.planflow.decode(APIStatus.self, from: data)
        if let status, !status.success {
            throw APIError.server(status: 200, message: status.error ?? status.message)
        }
        return status?.success ?? true
    }

    /// Uploads a file as `multipart/form-data` under the field name `file` and
    /// decodes `data` from the envelope into `T`. Refreshes the token on 401.
    func upload<T: Decodable>(
        _ path: String,
        fileData: Data,
        filename: String,
        mimeType: String,
        as type: T.Type = T.self,
        isRetry: Bool = false
    ) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = try buildRequest(path, method: .POST, query: [:], body: nil, authenticated: true)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var payload = Data()
        func append(_ s: String) { payload.append(s.data(using: .utf8)!) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        payload.append(fileData)
        append("\r\n--\(boundary)--\r\n")
        req.httpBody = payload

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server(status: -1, message: "No HTTP response")
        }
        if http.statusCode == 401 && !isRetry {
            if try await refreshAccessToken() {
                return try await upload(path, fileData: fileData, filename: filename,
                                        mimeType: mimeType, as: type, isRetry: true)
            }
            authLost.continuation.yield(())
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(status: http.statusCode, message: decodeErrorMessage(from: data))
        }
        let envelope = try JSONDecoder.planflow.decode(APIResponse<T>.self, from: data)
        if let payload = envelope.data { return payload }
        throw APIError.server(status: 200, message: envelope.error ?? envelope.message)
    }

    // MARK: - Core

    private func perform(
        _ path: String,
        method: Method,
        query: [String: String],
        body: Encodable?,
        authenticated: Bool,
        isRetry: Bool = false
    ) async throws -> Data {
        let request = try buildRequest(path, method: method, query: query, body: body, authenticated: authenticated)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.server(status: -1, message: "No HTTP response")
        }

        if http.statusCode == 401 && authenticated && !isRetry {
            // Try a single refresh, then retry once.
            if try await refreshAccessToken() {
                return try await perform(path, method: method, query: query, body: body,
                                         authenticated: authenticated, isRetry: true)
            } else {
                authLost.continuation.yield(())
                throw APIError.unauthorized
            }
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw APIError.server(status: http.statusCode, message: message)
        }
        return data
    }

    private func buildRequest(
        _ path: String,
        method: Method,
        query: [String: String],
        body: Encodable?,
        authenticated: Bool
    ) throws -> URLRequest {
        var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path),
            resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method.rawValue
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let token = TokenStore.accessToken else { throw APIError.notAuthenticated }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        return req
    }

    private func decodeErrorMessage(from data: Data) -> String? {
        if let status = try? JSONDecoder.planflow.decode(APIStatus.self, from: data) {
            return status.error ?? status.message
        }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Token refresh

    private func refreshAccessToken() async throws -> Bool {
        guard let refreshToken = TokenStore.refreshToken else { return false }
        struct Body: Encodable { let refreshToken: String }

        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent("auth/refresh"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(Body(refreshToken: refreshToken))

        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return false
            }
            let envelope = try JSONDecoder.planflow.decode(APIResponse<RefreshResult>.self, from: data)
            guard let result = envelope.data else { return false }
            TokenStore.accessToken = result.token
            if let newRefresh = result.refreshToken { TokenStore.refreshToken = newRefresh }
            return true
        } catch {
            return false
        }
    }
}

/// Type-erasing wrapper so we can encode an `Encodable` existential.
struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
