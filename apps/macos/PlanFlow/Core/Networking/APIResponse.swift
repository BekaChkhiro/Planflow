import Foundation

/// Standard PlanFlow API envelope: `{ success, data, error }`.
struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
    let message: String?
}

/// Envelope for endpoints that return no `data` payload.
struct APIStatus: Decodable {
    let success: Bool
    let error: String?
    let message: String?
}

/// A decodable that ignores its contents — useful for "fire and forget" calls.
struct EmptyPayload: Decodable {}

/// Pagination wrapper used by list endpoints (`{ items, total, page, ... }`).
struct Paginated<T: Decodable>: Decodable {
    let items: [T]
    let total: Int?
    let page: Int?
    let pageSize: Int?

    enum CodingKeys: String, CodingKey {
        case items, total, page, pageSize
        case projects, tasks, notifications, results, data
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // The API uses different array keys per resource; try the common ones.
        if let v = try? c.decode([T].self, forKey: .items) { items = v }
        else if let v = try? c.decode([T].self, forKey: .projects) { items = v }
        else if let v = try? c.decode([T].self, forKey: .tasks) { items = v }
        else if let v = try? c.decode([T].self, forKey: .notifications) { items = v }
        else if let v = try? c.decode([T].self, forKey: .results) { items = v }
        else if let v = try? c.decode([T].self, forKey: .data) { items = v }
        else { items = [] }
        total = try? c.decode(Int.self, forKey: .total)
        page = try? c.decode(Int.self, forKey: .page)
        pageSize = try? c.decode(Int.self, forKey: .pageSize)
    }
}
