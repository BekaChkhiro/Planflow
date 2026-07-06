import Foundation

/// Locates the `claude` CLI executable. GUI apps inherit a minimal PATH, so we
/// probe well-known install locations and, as a fallback, ask a login shell.
enum ClaudeBinaryLocator {
    static let overrideKey = "claudeBinaryPath"

    /// Returns a usable path to the `claude` executable, or nil if not found.
    static func resolve() -> String? {
        // 1. Explicit user override.
        if let override = UserDefaults.standard.string(forKey: overrideKey),
           FileManager.default.isExecutableFile(atPath: override) {
            return override
        }

        // 2. Well-known locations.
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/.local/bin/claude",
            "\(home)/.claude/local/claude",
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            "/run/current-system/sw/bin/claude",
        ]
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return path
        }

        // 3. Ask a login shell to resolve it from the user's full PATH.
        if let viaShell = resolveViaLoginShell() { return viaShell }
        return nil
    }

    private static func resolveViaLoginShell() -> String? {
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        let process = Process()
        process.executableURL = URL(fileURLWithPath: shell)
        process.arguments = ["-lc", "command -v claude"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let path = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if let path, !path.isEmpty, FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        } catch {
            return nil
        }
        return nil
    }

    /// A PATH string augmented with the common bin dirs, for the child process.
    static func augmentedPATH() -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let extras = [
            "\(home)/.local/bin",
            "\(home)/.claude/local",
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
        ]
        let existing = ProcessInfo.processInfo.environment["PATH"] ?? ""
        return (extras + [existing]).joined(separator: ":")
    }
}
