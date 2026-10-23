# Native bootstrap and lifecycle

Safari native messaging supplies connection details to the extension background without manual token copying. The shared native store and signed helper use a team-prefixed macOS App Group; writing directly into the Safari extension sandbox from Node failed with container-protection EPERM and is not a supported fallback.

## Packaging contract

Both the containing app and native extension Info.plist set `SafariAgentGroupIdentifier` to expanded `$(DEVELOPMENT_TEAM).app.stonehub.safari-agent`. The containing app, native extension and embedded helper require matching `com.apple.security.application-groups` entitlements. No team identifier is committed here. Apple documents team-prefixed macOS groups that do not need provisioning; actual signed access still needs local verification. See [accessing app-group containers](https://developer.apple.com/documentation/xcode/accessing-app-group-containers) and [configuring groups](https://developer.apple.com/documentation/xcode/configuring-app-groups).

`ConnectionStore.swift` uses `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`, then `SafariAgent/connection.json`. The group identifier comes only from the executing bundle's Info.plist; the native extension uses `Bundle(for: SafariWebExtensionHandler.self)`. The directory is0700, descriptor0600, current-user-owned regular file with one hard link. The store rejects symlinks, non-private modes, oversize files and malformed values. Writes use exclusive private temp files, fsync and atomic rename; mutations use a nonblocking private file lock. Remove requires the current matching session token.

After generating the Safari project, run `python3 scripts/stage-native-handler.py`. It concatenates `ConnectionStore.swift` and `SafariWebExtensionHandler.swift` into the converter's one generated handler file, requiring no extra Xcode source references. Compile `ConnectionStore.swift` alongside `Wake/main.swift` to produce embedded `Contents/MacOS/safari-agent-native`; signing/build ownership remains with the integrating agent. The helper requires its actual containing-app bundle identity and expected embedded extension. Merely passing that local check does not establish Safari accepts its dispatch identity.

## Helper protocol

Invoke only the absolute installed helper path. Credentials never belong in argv, environment diagnostics or logs.

| Action | Input | Successful stdout |
| --- | --- | --- |
| `--read-connection` | none | private descriptor JSON |
| `--publish-connection` | descriptor JSON on stdin, EOF, at most4096bytes | `{"ok":true}` |
| `--remove-connection` | `{"token":"<current session token>"}` on stdin, EOF | `{"ok":true,"removed":true}` or false for absent/different session |
| `--wake` (default) | none | none |

Descriptor exact shape: `{"version":1,"port":19447,"token":"<private64hex>","pid":12345}`. Port is an integer1024–65535; pid is a positive32-bit integer. Node must use this signed helper for read/publish/remove, not directly access another app's protected container. Broker process identity and liveness are separate checks; the native store does not assert that the pid is alive. Independent MCP clients share the broker lifecycle rather than overwrite descriptors.

Connection actions exit0 on success,3 with generic private-store-unavailable stderr on failure,4 for invalid command/bundle identity. The root adapter bounds helper processes, including a producer that never closes stdin. Only read-connection prints credentials; its stdout is private IPC and must never be relayed to user-visible logs.

## Extension protocol

Manifest permission `nativeMessaging` enables `browser.runtime.sendNativeMessage('app.stonehub.safari-agent',{kind:'connection',version:1})`. The response is `{ok:true,version:1,port,token}` or `{ok:false,version:1,error:'bridge-unavailable'|'invalid-request'}`. The native handler returns neither pid nor paths. Safari ignores the application-id routing argument and targets its containing native extension. Content scripts cannot use this native API. Keep the token only in extension background memory; build only a127.0.0.1 endpoint from the port. No descriptor or native message authorizes page actions independently of the user's task.

## Wake and suspension

The normal wake route is the containing app's actual `CFBundleExecutable` invoked with `--bridge-wake`. `AppDelegate.swift` installs an explicit `AppEntry` that handles this argument before calling `NSApplicationMain`, so that path creates no setup window or NSApplication instance. Normal launch still enters AppKit and preserves the converter storyboard's `AppDelegate` class. The staging script copies this source into the generated app target. The same-bundle secondary helper passed its local bundle guard but returned `SFErrorDomain` code1 in the installed trial; it is therefore not the normal wake route. Keep that helper for private App Group IPC; its `--wake` mode is diagnostic only.

The helper dispatches `bridge-wake` with userInfo `{kind:'wake',version:1}` using `SFSafariApplication.dispatchMessage`. The background establishes `runtime.connectNative` and treats a matching notification solely as a resync trigger. Native messages never change Stop or document checks. Safari may unload MV3 backgrounds; restore native bootstrap on supported browser events/alarms. No popup keepalive, indefinite native request, login item or foreground automation is implemented.

Wake exit0 means dispatch accepted,1 NSError,2 three-second callback deadline,4 wrong caller bundle. Failure prints only an allowlisted domain (`SFErrorDomain`, `NSCocoaErrorDomain`, `NSPOSIXErrorDomain`, otherwise `other`) and numericcode. Never print localizedDescription or userInfo. Exit1 is not the same as SFErrorDomain code1, which denotes not-found/not-owned extension. Actual dispatch envelope and suspended-background delivery must be checked in Safari.

Complete native requests normally. [WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPIRuntimeCocoa.mm) separates native-port registration from per-message request completion. Holding NSExtensionContext open is not a supported keepalive and can exhaust active requests. Apple's [native messaging architecture](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension) and [background guidance](https://developer.apple.com/documentation/safariservices/optimizing-your-web-extension-for-safari) establish the route, not successful local acceptance.

Required integrating checks: real target compilation/signature entitlements, helper group access and bounded private IPC, native reply then authenticated sync, closed-popup behavior after background suspension, navigation/document identity, broker restart, Safari relaunch and persistent Stop. This worker did not build, install or control Safari.
