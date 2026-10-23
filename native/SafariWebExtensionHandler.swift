import Foundation
import CoreFoundation
import SafariServices
import Darwin

// This file replaces the converter's generated echo handler. Never log native
// requests, descriptor contents, tokens, profiles or browsing data.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let reply: [String: Any]
        if message?.count == 2,
           message?["kind"] as? String == "connection",
           let version = message?["version"] as? NSNumber,
           CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 1 {
            reply = NativeConnectionStore.read(bundle: Bundle(for: SafariWebExtensionHandler.self)) ?? ["ok": false, "version": 1, "error": "bridge-unavailable"]
        } else {
            reply = ["ok": false, "version": 1, "error": "invalid-request"]
        }
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
