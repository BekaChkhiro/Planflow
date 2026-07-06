import SwiftUI
import AppKit

/// Configures the hosting `NSWindow` for a seamless dark top bar. Uses an
/// `NSView` subclass so configuration runs once the view is actually in a
/// window (avoiding the timing race where `window` is still nil).
struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { ConfiguringView() }
    func updateNSView(_ nsView: NSView, context: Context) {
        (nsView as? ConfiguringView)?.apply()
    }
}

private final class ConfiguringView: NSView {
    private static let canvas = NSColor(red: 0x0C / 255, green: 0x0C / 255, blue: 0x0E / 255, alpha: 1)

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        apply()
        // Re-apply shortly after, once the toolbar's own views exist.
        DispatchQueue.main.async { [weak self] in self?.apply() }
    }

    func apply() {
        guard let window else { return }
        window.backgroundColor = Self.canvas
        window.isOpaque = true
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = true

        window.styleMask.insert([.titled, .closable, .miniaturizable, .resizable])
        window.standardWindowButton(.miniaturizeButton)?.isEnabled = true
        window.standardWindowButton(.zoomButton)?.isEnabled = true
    }
}
