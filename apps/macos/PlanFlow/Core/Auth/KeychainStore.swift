import Foundation
import Security

/// Minimal Keychain wrapper for storing string secrets (tokens) keyed by account.
enum KeychainStore {
    private static let service = AppConfig.keychainService

    static func set(_ value: String, account: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        // Remove any existing item first, then add fresh.
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func get(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// Persists auth tokens. Tokens live in the Keychain; the cached user lives in
/// UserDefaults (non-sensitive) for fast startup.
enum TokenStore {
    private static let accessAccount = "accessToken"
    private static let refreshAccount = "refreshToken"
    private static let userKey = "cachedUser"

    static var accessToken: String? {
        get { KeychainStore.get(accessAccount) }
        set {
            if let v = newValue { KeychainStore.set(v, account: accessAccount) }
            else { KeychainStore.delete(accessAccount) }
        }
    }

    static var refreshToken: String? {
        get { KeychainStore.get(refreshAccount) }
        set {
            if let v = newValue { KeychainStore.set(v, account: refreshAccount) }
            else { KeychainStore.delete(refreshAccount) }
        }
    }

    static var cachedUser: User? {
        get {
            guard let data = UserDefaults.standard.data(forKey: userKey) else { return nil }
            return try? JSONDecoder.planflow.decode(User.self, from: data)
        }
        set {
            if let v = newValue, let data = try? JSONEncoder().encode(v) {
                UserDefaults.standard.set(data, forKey: userKey)
            } else {
                UserDefaults.standard.removeObject(forKey: userKey)
            }
        }
    }

    static func save(_ session: AuthSession) {
        accessToken = session.token
        refreshToken = session.refreshToken
        cachedUser = session.user
    }

    static func clear() {
        accessToken = nil
        refreshToken = nil
        cachedUser = nil
    }
}
