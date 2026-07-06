import Foundation

/// A file or image attached to a task. Bytes live in R2; this is the metadata
/// plus a short-lived presigned `downloadUrl`.
struct TaskAttachment: Codable, Identifiable, Hashable {
    let id: String
    var filename: String
    var mimeType: String
    var sizeBytes: Int
    var isImage: Bool
    var downloadUrl: String?
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, filename, mimeType, sizeBytes, isImage, downloadUrl, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        filename = (try? c.decode(String.self, forKey: .filename)) ?? "file"
        mimeType = (try? c.decode(String.self, forKey: .mimeType)) ?? "application/octet-stream"
        sizeBytes = (try? c.decode(Int.self, forKey: .sizeBytes)) ?? 0
        isImage = (try? c.decode(Bool.self, forKey: .isImage)) ?? mimeType.hasPrefix("image/")
        downloadUrl = try? c.decode(String.self, forKey: .downloadUrl)
        createdAt = try? c.decode(Date.self, forKey: .createdAt)
    }

    var sizeLabel: String {
        if sizeBytes < 1024 { return "\(sizeBytes) B" }
        if sizeBytes < 1024 * 1024 { return "\(sizeBytes / 1024) KB" }
        return String(format: "%.1f MB", Double(sizeBytes) / 1024 / 1024)
    }
}
