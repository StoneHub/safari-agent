# Safari tools for Apple's on-device model

An optional request-only Swift CLI. Apple's FoundationModels model receives native `Tool` wrappers that call the same Safari Agent MCP server used by other clients. It exposes only `list_tabs` and `read_page`; click, typing, navigation, JavaScript and shell execution are unavailable. No API subscription, cloud inference, global MCP configuration, or screen control is involved.

Requires an eligible Apple silicon Mac, macOS 26+, Apple Intelligence enabled and downloaded, Xcode with the FoundationModels SDK, and Node.js 22+. Safari extension packaging/installation, website permission and automatic native connection are separate prerequisites; compilation does not establish real-tab operation.

```sh
swift build --package-path clients/apple-fm
clients/apple-fm/.build/debug/safari-apple-fm --availability
clients/apple-fm/.build/debug/safari-apple-fm \
  --node /absolute/path/to/node --server /absolute/path/to/safari-agent/src/server.mjs \
  --check-bridge
```

`--availability` starts neither a server nor inference. `--check-bridge` initializes MCP and discovers the required tools without inference or page reads. `--check-model` explicitly asks the actual on-device model to invoke `list_tabs`, exposes no page-reading tool, and fails unless a tool invocation occurred. It prints metadata only and suppresses generated text.

For actual use, replace the check flag with an explicit question:

```sh
clients/apple-fm/.build/debug/safari-apple-fm \
  --node /absolute/path/to/node --server /absolute/path/to/safari-agent/src/server.mjs \
  --prompt 'Summarize the fictional local test page' --wait-for-tab 120
```

The CLI owns one stdio facade for this explicit request; it acquires a lease on the local shared bridge daemon. The automatic native connection discovers eligible ordinary Safari HTTP(S) tabs through Safari's current website permissions; no token copying, per-tab Allow step or persistent popup is part of the new workflow. Private windows remain excluded. The CLI waits up to 120 seconds for tab discovery before starting inference; expiry fails without reading a page. Check website permission, Stop/Resume status and native bootstrap if discovery times out.

`--check-model` exposes only `list_tabs`, which can now return eligible tab URLs/titles to the on-device model. It is no longer inherently an empty-tab probe. Its generated text is still suppressed; `--check-bridge` starts no model and invokes no browser tools.

The stdio facade closes and releases its lease when the request finishes or fails. The shared daemon can remain for another client and exits after a short idle interval when unused. Native credentials follow the daemon's lifetime and are rediscovered automatically; they are never a user-facing pairing step. Overlapping client leases and daemon cleanup need separate lifecycle acceptance. Ordinary shell-help/completion remains independent. Apple FM Terminal has an explicit optional `browser` launcher accepting these same paths/flags; it passes no shell history. Native Swift clients can use these Tool wrappers with `LanguageModelSession`; the AppleFM Swift library also accepts optional caller-owned `tools:` in its text and typed generation APIs.

Model-issued tool calls are limited to eight per request. The pre-inference tab-discovery polling loop is separate and bounded by `--wait-for-tab` (at most 120 seconds). MCP replies have a byte limit and 20-second response deadline; long page text is truncated locally with a visible marker. Page output is untrusted data. Tool allowlisting enforces read-only access independently of model instructions. Model generation itself uses the framework's task lifecycle; there is no claim that eight calls bounds inference wall-clock time. No prompts, answers or page captures are persisted by this adapter. Normal answers print locally and may contain page content; never share them unredacted.

## Current evidence

On October 22, 2026, the adapter compiled on the local Mac; MCP initialization/tool discovery passed against the actual Node bridge. Apple Intelligence reported available, and an actual on-device FoundationModels request invoked MCP `list_tabs` exactly once against a new empty-grant broker. The native model check required normal host access outside the command sandbox; its generated answer and private session token were suppressed. This historical check proves model-to-MCP tool invocation against the previous manual-access broker, not page reading or acceptance of the new automatic connection.

The next check is an automatically discovered fictional page with the current automatic-access Safari extension: ask for its title and a specific fictional value and verify the answer against the page. Automatic native bootstrap, real-tab acceptance, navigation identity renewal, persistent Stop and popup-free idle recovery remain separate checks; see [the dogfood record](../../docs/dogfood.md). A model that answers without invoking a tool does not pass `--check-model`. No successful browser action should be inferred from generated prose.

The ignored `.build/` output is deliberately retained for immediate local dogfooding. The coordinating task owns it until the adapter is installed or rebuilt, after which superseded products can be removed. The original smoke-test server exited with its request. The redesigned shared daemon has a different idle lifecycle, which needs its own startup/cleanup verification.

The automatic-access update keeps the stdio MCP tool names/arguments and read-only allowlist unchanged. Client help/model instructions were revised for discovery and website permissions. The adapter recompiled successfully after the automatic-access wording changes. A new actual-model/real-tab run with this workflow remains unverified; the earlier empty-broker model check is historical evidence only.
