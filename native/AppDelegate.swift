import Cocoa
import SafariServices
import Darwin

private final class AppWakeResult: @unchecked Sendable {
    private let lock = NSLock()
    private var code: Int32?
    func complete(_ value: Int32) { lock.lock(); code = value; lock.unlock() }
    func value() -> Int32? { lock.lock(); defer { lock.unlock() }; return code }
}

@main
enum AppEntry {
    @MainActor
    static func main() {
        if CommandLine.arguments.contains("--bridge-wake") {
            guard CommandLine.arguments.count == 2,
                  Bundle.main.bundleIdentifier == "app.stonehub.safari-agent" else { exit(4) }
            // This path runs as the actual CFBundleExecutable, before AppKit
            // application startup or storyboard/window creation.
            let result = AppWakeResult()
            SFSafariApplication.dispatchMessage(withName: "bridge-wake",
                toExtensionWithIdentifier: "app.stonehub.safari-agent.Extension",
                userInfo: ["kind": "wake", "version": 1]) { error in
                    if let error = error as NSError? {
                        let allowed = [SFErrorDomain, NSCocoaErrorDomain, NSPOSIXErrorDomain]
                        let domain = allowed.contains(error.domain) ? error.domain : "other"
                        FileHandle.standardError.write(Data("Safari Agent wake error domain=\(domain) code=\(error.code)\n".utf8))
                    }
                    result.complete(error == nil ? 0 : 1)
                }
            let deadline = ProcessInfo.processInfo.systemUptime + 3
            while result.value() == nil && ProcessInfo.processInfo.systemUptime < deadline {
                RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.02))
            }
            exit(result.value() ?? 2)
        }
        exit(NSApplicationMain(CommandLine.argc, CommandLine.unsafeArgv))
    }
}

// Preserve the converter storyboard's delegate class and normal setup window.
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {}
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
