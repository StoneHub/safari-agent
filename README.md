# Safari Agent

Let local agents work in Safari tabs you explicitly allow, using the session already in that tab. An early MIT development preview for dogfooding with Codex, Claude Code, and Apple Foundation Models.

**Current status:** source prototype. Real Safari tab control and installed acceptance are still pending. This is not a public installer or a claim of Chrome feature parity. See [the dogfood checklist](docs/dogfood.md).

## How it fits together

An agent connects to a local Node.js MCP server over stdio. The Safari web extension polls its authenticated loopback endpoint and performs bounded commands in user-granted tabs. The containing Mac app packages the Safari extension; the prototype transport does not require a separate native messaging host or a cloud service.

Tools: `list_tabs`, `read_page`, `click`, `type`, and `navigate`. Page reads return text and opaque handles for visible controls. Actions target those handles instead of replaying CSS selectors. Navigation revokes access. Password/file fields cannot be typed through this preview. Page text is untrusted content, never authorization.

## Develop

Requires Node.js 22+; Apple packaging requires Xcode and macOS. No npm dependencies are needed for the bridge.

```sh
npm run check
npm test
node src/server.mjs
```

The bridge listens on `127.0.0.1:19447`; override with `SAFARI_AGENT_PORT`. It generates a private session pairing token and displays it on stderr for the local operator. Never paste it into a chat, issue, or shared log. An MCP client may retain stderr logs: review its logging policy. Set `SAFARI_AGENT_TOKEN` privately to avoid displaying the generated token. Each bridge owns its port; multiple clients need separate ports/pairings. No multi-agent tab arbitration exists yet.

## Package for local development

```sh
xcrun safari-web-extension-converter extension \
  --macos-only --no-open --no-prompt \
  --project-location .build/safari --app-name 'Safari Agent' \
  --bundle-identifier app.stonehub.safari-agent
```

Use the generated project with your own development identity. Installing/enabling it and granting website access are separate steps. Do not publish development-signing details or bypass system security controls. This repository does not enable Safari settings automatically.

Once loaded, pair through the extension popup using the local port/session token, open a fictional HTTP fixture tab, and select **Allow current tab**. **Stop all tab access** revokes grants. Keep the popup open for initial trials: Safari may suspend its nonpersistent background page; suspension/restart loses the memory-only pairing and grants. This is an intentional fail-closed prototype, not persistent background automation.

## Agent clients

Configure any stdio MCP client to launch `node` with the absolute path to `src/server.mjs`. Keep credentials out of committed client configuration. This source does not modify your Codex or Claude configuration.

Apple Foundation Models integration lives in [clients/apple-fm](clients/apple-fm). It is an explicit local request path; ordinary shell suggestions should remain separate from browser actions. Client availability, compilation, actual model tool calls, and real Safari acceptance are recorded separately.

## Scope and privacy

Only explicitly granted tabs are sent to the bridge. Page content stays in memory in this implementation and is returned to the connected agent; the agent/model's own processing and retention rules still apply. Codex or Claude may process it remotely; using the Apple FM client keeps inference on-device. Existing website traffic remains unchanged. Pairing tokens, granted URLs/titles, and page content are sensitive.

Screenshots, scrolling tools, iframe/shadow-DOM coverage, trusted native input, file pickers, downloads/uploads, network interception, persistent sessions, and multi-agent ownership are not implemented. DOM clicks can cause external side effects; a technical tab grant does not approve a purchase, message, or account change. A timed-out action may already have happened: inspect before retrying.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT License](LICENSE) · [Issues](https://github.com/StoneHub/safari-agent/issues)
