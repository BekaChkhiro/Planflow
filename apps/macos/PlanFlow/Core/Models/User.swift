import Foundation

struct User: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let name: String?
    var createdAt: Date?
    var updatedAt: Date?

    var displayName: String {
        if let name, !name.isEmpty { return name }
        return email
    }

    var initials: String {
        let source = (name?.isEmpty == false ? name! : email)
        let parts = source.split(whereSeparator: { $0 == " " || $0 == "." || $0 == "@" })
        let letters = parts.prefix(2).compactMap { $0.first }
        return String(letters).uppercased()
    }
}

/// Auth payload returned by `/auth/login` and `/auth/register`.
struct AuthSession: Codable {
    let user: User
    let token: String
    let refreshToken: String
    let expiresIn: Int?
    let refreshExpiresIn: Int?
}

struct Subscription: Codable, Hashable {
    let tier: String?
    let status: String?
    var currentPeriodEnd: Date?
}

/// Payload of `/auth/me`.
struct CurrentUser: Codable {
    let user: User
    let subscription: Subscription?
}
