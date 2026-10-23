import Foundation
import SafariServices
import Darwin

// Package inside the containing app's Contents/MacOS directory and sign with
// that product. An arbitrary standalone CLI is not an established Apple route.
final class WakeResult: @unchecked Sendable {
    private let lock = NSLock()
    private var code: Int32?
    func complete(_ value: Int32) { lock.lock(); code = value; lock.unlock() }
    func value() -> Int32? { lock.lock(); defer { lock.unlock() }; return code }
}

let app = Bundle.main
guard app.bundleIdentifier == "app.stonehub.safari-agent",
      let plugins = app.builtInPlugInsURL,
      let extensionBundle = Bundle(url: plugins.appendingPathComponent("Safari Agent Extension.appex")),
      extensionBundle.bundleIdentifier == "app.stonehub.safari-agent.Extension" else {
    // Never print native errors or local installation paths.
    fputs("Safari Agent wake requires its containing app bundle.\n", stderr)
    exit(4)
}

let action = CommandLine.arguments.dropFirst().first ?? "--wake"
guard CommandLine.arguments.count <= 2 else { exit(4) }
if ["--read-connection", "--publish-connection", "--remove-connection"].contains(action) {
    do {
        let reply: [String: Any]
        if action == "--read-connection" {
            guard let descriptor = NativeConnectionStore.descriptor(bundle: app) else {
                throw NativeConnectionStore.Failure.unavailable
            }
            reply = descriptor
        } else {
            var data = Data()
            while data.count < 4097 {
                let chunk = try FileHandle.standardInput.read(upToCount: 4097 - data.count) ?? Data()
                if chunk.isEmpty { break }
                data.append(chunk)
            }
            guard !data.isEmpty, data.count <= 4096,
                  let value = (try JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                throw NativeConnectionStore.Failure.unavailable
            }
            if action == "--publish-connection" {
                try NativeConnectionStore.publish(value, bundle: app)
                reply = ["ok": true]
            } else {
                guard value.count == 1, let token = value["token"] as? String else {
                    throw NativeConnectionStore.Failure.unavailable
                }
                reply = ["ok": true, "removed": try NativeConnectionStore.remove(token: token, bundle: app)]
            }
        }
        let data = try JSONSerialization.data(withJSONObject: reply, options: [.sortedKeys])
        FileHandle.standardOutput.write(data + Data([10]))
        exit(0)
    } catch {
        fputs("Safari Agent native connection unavailable.\n", stderr)
        exit(3)
    }
}
guard action == "--wake" else { exit(4) }

let result = WakeResult()
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
