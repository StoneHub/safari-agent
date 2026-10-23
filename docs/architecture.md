# Automatic Safari access

## User workflow

Enable the installed extension and grant Safari's website access once for the sites intended for agent use. Start a compatible local agent client. Ordinary open HTTP(S) tabs become available automatically. There is no per-tab Allow step, token to copy, or popup that must remain open. Opening the popup is optional for status, Stop and Resume.

The current extension scans only the first 500 browser-query results, then applies eligibility checks; the discovery snapshot is cached for at most five seconds and invalidated immediately by relevant browser events. This limit is not a promise that every tab beyond the cap is visible. Safari still owns website permissions. Private windows and unsupported URLs are excluded. Technical availability does not authorize an agent to purchase, send messages or make unrelated account changes; the human's task supplies that scope. Page data is untrusted input.

The current signed 0.2.1 preview is installed, with 37 matching bundle files and strict signature verification. Signed native descriptor publish/read-match/remove passed. Those checks establish build, installation and private storage access; automatic Safari tab operations and closed-popup recovery remain unverified. See [the dogfood record](dogfood.md).

## Connection path

1. A client launches the Node MCP entry point over stdio. Its facade acquires a lease on one local bridge daemon on the first browser tool call, starting it when needed. Existing MCP tool names and arguments stay stable.
2. Node invokes the absolute installed `safari-agent-native` helper. Descriptor publish/read/remove requests travel through bounded private stdin/stdout, never command-line credentials. The signed helper accesses the shared native store; Node does not open the protected App Group or extension container.
3. The containing app, native extension and helper share a Team-prefixed macOS App Group entitlement. `SafariAgentGroupIdentifier` is expanded in bundle metadata; native code obtains the group container through Apple's FileManager API, then uses a private `SafariAgent/connection.json` descriptor. No developer Team identifier or signing details belong in this public repository.
4. Background JavaScript requests connection details through Safari native messaging. The native handler validates the private store and returns only version/port/session credentials. Background JavaScript then authenticates to the loopback endpoint and discovers eligible tabs. Credentials stay out of page data, extension storage, user setup and shared logs.
5. Document identities bind handles and queued commands to the actual document. Navigation invalidates old references; automatic discovery establishes a new identity after eligibility checks.

The initial direct Node write into the extension sandbox failed with macOS container-protection `EPERM`, including outside the command sandbox. That route is not a supported fallback. Team-prefixed macOS groups need neither Developer website registration nor a provisioning profile; they require correct signing/membership and are specific to macOS. This follows [Apple's unprovisioned App Group guidance](https://developer.apple.com/documentation/xcode/accessing-app-group-containers). The real signed helper's storage round trip passed locally.

The daemon's default private diagnostic directory is `~/.local/state/safari-agent`, separate from group storage. Direct filesystem descriptors exist only behind the explicit isolated-test override. Test configuration must not be used to bypass native container protection in ordinary operation. The local boundary trusts the current user and installed clients; it is not isolation from malicious same-user software.

Stop must persist across background restart and suppress discovery/execution until Resume. Resume rediscovery uses current Safari permissions and fresh document identities. Commands from a previous document or access epoch must never acquire new access accidentally.

## Safari lifecycle

Manifest V3 does not provide a permanently resident background page. Apple's guidance recommends top-level event listeners, saved state and the Alarms API for recovery. Reconnect on browser/runtime/document events and alarms; treat suspension as normal. A timer or an open native port is not proof that Safari will keep JavaScript running. The standalone native dispatch attempt returned `SFErrorDomain` code 1. The corrected containing-app headless `--bridge-wake` entry built, installed and returned success without starting AppKit or creating a window. Actual JavaScript delivery and closed-popup recovery still need Safari acceptance after website permission; a dispatch acknowledgment alone does not establish them. [Apple background guidance](https://developer.apple.com/documentation/safariservices/optimizing-your-web-extension-for-safari), [manifest compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)

Safari native messaging is scoped to the containing extension. Background/extension pages can send native messages; content scripts must relay through the background. macOS also supports app-to-JavaScript messages through the native connection API. This establishes the available API, not successful wakeup in this build. [Apple native messaging](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)

## Client compatibility

`list_tabs` returns a JSON array of tab metadata in MCP text content. `read_page` takes the exact returned integer `tabId`. `click`, `type` and `navigate` retain their existing argument contracts. Availability policy changes from an explicit per-tab grant to automatic ordinary-tab discovery; stale document handles still fail.

The Apple FM client owns one stdio facade per explicit request, exposes only `list_tabs` and `read_page`, and closes that process afterward. The facade releases its shared-daemon lease; it does not stop another client's bridge. The current design expires inactive client leases and lets an unused daemon exit after approximately 45 seconds without client leases or pending commands (with a periodic cleanup check). Its bounded waiting loop can wait for automatic discovery without copying a credential. Model answers do not prove that a tool ran. Its `--check-model` permits only `list_tabs`, which can now return permitted ordinary-tab metadata; it must not be described as an inherently empty-tab check.

Multiple overlapping client leases, daemon startup/idle cleanup, reconnect latency, profile isolation and competing agents need real acceptance evidence. This preview does not promise shared mutable-tab arbitration or uninterrupted background execution.
