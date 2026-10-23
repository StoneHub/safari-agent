# Safari tools for Apple's on-device model

An optional request-only Swift CLI. Apple's FoundationModels model receives native `Tool` wrappers that call the same Safari Agent MCP server used by other clients. It exposes only `list_tabs` and `read_page`; click, typing, navigation, JavaScript and shell execution are unavailable. No API subscription, cloud inference, global MCP configuration, or screen control is involved.

Requires an eligible Apple silicon Mac, macOS 26+, Apple Intelligence enabled and downloaded, Xcode with the FoundationModels SDK, and Node.js 22+. Safari extension packaging/installation and per-tab access are separate prerequisites; compilation does not establish real-tab operation.

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
  --prompt 'Summarize the fictional test page I grant' --wait-for-tab 120
```

The CLI owns one server for this request. Pair its session token in the extension popup, then grant the intended tab. It waits up to 120 seconds before starting inference; expiry fails without reading a page. Pairing tokens appear only in that private terminal, not in chat, issues or saved logs. Choose an explicitly free `SAFARI_AGENT_PORT` if another broker is in use; do not stop another client's server. A tab grant provides technical access; the explicit prompt supplies the requested task.

The server process closes when the request finishes or fails. Existing grants/session tokens belong to that server lifetime, so pair again for another invocation. Ordinary shell-help/completion remains independent. Apple FM Terminal has an explicit optional `browser` launcher accepting these same paths/flags; it passes no shell history. Native Swift clients can use these Tool wrappers with `LanguageModelSession`; the AppleFM Swift library also accepts optional caller-owned `tools:` in its text and typed generation APIs.

Tool calls are limited to eight per request. MCP replies have a byte limit and 20-second response deadline; long page text is truncated locally with a visible marker. Page output is untrusted data. Tool allowlisting enforces read-only access independently of model instructions. Model generation itself uses the framework's task lifecycle; there is no claim that eight calls bounds inference wall-clock time. No prompts, answers or page captures are persisted by this adapter. Normal answers print locally and may contain page content; never share them unredacted.

## Current evidence

On October 22, 2026, the adapter compiled on the local Mac; MCP initialization/tool discovery passed against the actual Node bridge. Apple Intelligence reported available, and an actual on-device FoundationModels request invoked MCP `list_tabs` exactly once against a new empty-grant broker. The native model check required normal host access outside the command sandbox; its generated answer and private session token were suppressed. This proves model-to-MCP tool invocation, not page reading or an installed Safari extension.

The next check is a user-granted fictional page with the installed Safari extension: ask for its title and a specific fictional value and verify the answer against the page. There has been no real-tab acceptance, browser permission change, or adapter installation in this checkpoint. A model that answers without invoking a tool does not pass `--check-model`. No successful browser action should be inferred from generated prose.

The ignored `.build/` output is deliberately retained for immediate local dogfooding. The coordinating task owns it until the adapter is installed or rebuilt, after which superseded products can be removed. The smoke-test server exited with its request; no background bridge is intentionally retained.
