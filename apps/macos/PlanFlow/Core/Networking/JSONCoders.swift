import Foundation

extension JSONDecoder {
    /// Decoder configured for PlanFlow API responses with flexible ISO8601 dates.
    static let planflow: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            // Some endpoints send epoch millis; most send ISO8601 strings.
            if let millis = try? container.decode(Double.self) {
                return Date(timeIntervalSince1970: millis / 1000)
            }
            let string = try container.decode(String.self)
            if let date = ISO8601DateParser.parse(string) { return date }
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "Unrecognized date: \(string)")
        }
        return decoder
    }()
}

/// Parses ISO8601 with or without fractional seconds.
enum ISO8601DateParser {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }
}
