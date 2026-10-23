# Safari Agent

![Safari Agent — local tools for Safari](docs/assets/banner.svg)

[![License: MIT](https://img.shields.io/badge/license-MIT-73dcc1)](LICENSE) [![Status: development preview](https://img.shields.io/badge/status-development_preview-193d49)](docs/dogfood.md)

Let local agents work in ordinary open Safari tabs, using the sessions already in those tabs. The intended workflow is automatic connection and tab discovery after Safari website permission is enabled: no token copying, per-tab Allow button or popup that must stay open. An early MIT development preview for Codex, Claude Code, and Apple Foundation Models.

**Current status:** signed preview **0.2.1** is installed; all **37 bundle files** match and strict signature verification passed. Twenty-one Node tests passed, the Apple FM client recompiled, the signed native helper's private storage roundtrip passed, and Safari accepted the window-free containing-app wake dispatch. Automatic Safari tab operations and closed-popup recovery remain unverified while initial website permission is pending. Public installer distribution is separate. See [the dogfood record](docs/dogfood.md).

## How it fits together

An agent connects to the local Node.js MCP entry point over stdio; its facade leases a shared local bridge daemon, starting it when needed. Node exchanges private descriptor data over stdio with its signed embedded helper, which accesses a Team-prefixed macOS App Group. The Safari native extension reads that same store and supplies connection details to background JavaScript, which uses authenticated loopback transport. Node never accesses protected group storage directly. Ordinary HTTP(S) tabs with Safari-granted website access become available automatically; private windows and unsupported pages are excluded. The popup shows status and Stop/Resume controls. [Architecture and lifecycle](docs/architecture.md) describes the current design and its verification boundaries.

Tools: `list_tabs`, `read_page`, `click`, `type`, and `navigate`. Page reads return text and opaque handles for visible controls. Actions target those handles instead of replaying CSS selectors. Navigation invalidates old document identities and element handles; an eligible new document is discovered automatically. Password/file fields cannot be typed through this preview. Page text is untrusted content, never authorization.

## Develop

Requires Node.js 22+; Apple packaging requires Xcode and macOS. No npm dependencies are needed for the bridge.

```sh
npm run check
npm test
node src/server.mjs
```

The bridge uses loopback transport. Connection credentials belong to local infrastructure and are delivered through the native extension channel; they are not a setup step for the user. Tokens, page text, URLs and titles must stay out of shared logs. Safari website access remains an operating-system permission that this repository cannot grant for you.

The current extension scans at most the first 500 browser-query results before eligibility filtering, with a five-second discovery cache and immediate event invalidation. Multiple simultaneous MCP clients and ownership of mutable browser work must be verified before treating this preview as a shared agent service. Technical access to tabs does not arbitrate competing agents or approve their actions.

## Package for local development

The icon assets are committed. Regenerate them only when changing the artwork:

```sh
swift scripts/generate-icons.swift
```

Build with an existing private local signing configuration:

```sh
python3 scripts/build-preview.py --xcconfig /absolute/path/to/private-signing.xcconfig
```

This helper generates the project, stages the reviewed native connection handler and expanded group metadata, builds the extension, embeds/signs the native storage helper and verifies group/version metadata and the app signature. The containing-app wake entry is a separate lifecycle path whose Safari delivery still needs acceptance. It saves settings resolved from that exact build to `.build/safari-agent-build-settings.json`. Signing configuration and generated outputs remain local and ignored; never commit account or development-signing details.

For packaging inspection without a build, use `python3 scripts/generate-safari-project.py`; generation also runs `scripts/stage-native-handler.py`. If the native handler changes after generation, rerun the stage script before an independent Xcode build. The generator corrects the containing-app identifier normalization in Safari 27's converter. Generated sources are task-owned and regenerated; keep durable changes in repository sources.

Install from the helper's current-build settings:

```sh
python3 scripts/install-preview.py --build-settings .build/safari-agent-build-settings.json
```

The installer validates identity/signatures, compares every installed file, preserves rollback until verification and registers only this product. It refuses a running setup app. For a custom Xcode invocation, resolve `-showBuildSettings -json` with the same project, scheme, configuration, destination, DerivedData and signing arguments; never substitute an old product. Safari extension enablement and website permissions are separate user-controlled steps. This repository does not enable them or bypass system security controls.

Once the new build is loaded and Safari website permission is approved, open the fixture and connect an agent. Connection and eligible-tab discovery should happen automatically. The toolbar popup is optional status/control UI; it must not be required to keep the connection alive. **Stop** should persist until **Resume**, including across extension background restarts. Live acceptance of those behaviors is tracked in [issue #1](https://github.com/StoneHub/safari-agent/issues/1).

## Agent clients

Configure any stdio MCP client to launch `node` with the absolute path to `src/server.mjs`. Keep credentials out of committed client configuration. This source does not modify your Codex or Claude configuration.

Apple Foundation Models integration lives in [clients/apple-fm](clients/apple-fm). It is an explicit local request path; ordinary shell suggestions should remain separate from browser actions. Client availability, compilation, actual model tool calls, and real Safari acceptance are recorded separately.

## Scope and privacy

Eligible ordinary tabs may expose their URLs and titles to connected clients automatically. Page bodies are retrieved through page-reading tools. Private windows are excluded; Safari site permission, Stop and extension disablement remain access boundaries. Page content stays in memory in this implementation and is returned to the connected agent; the agent/model's own processing and retention rules still apply. Codex or Claude may process it remotely; using the Apple FM client keeps inference on-device. Existing website traffic remains unchanged. Local connection credentials, URLs/titles and page content are sensitive.

Screenshots, scrolling tools, iframe/shadow-DOM coverage, trusted native input, file pickers, downloads/uploads, network interception, a guarantee of continuous background execution, and multi-agent ownership are outside the current verified capability. DOM clicks can cause external side effects; automatic technical access does not approve a purchase, message or account change. A timed-out action may already have happened: inspect before retrying.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT License](LICENSE) · [Issues](https://github.com/StoneHub/safari-agent/issues)

## Apple FM projects

| Project | Purpose |
| --- | --- |
| [Apple FM Swift](https://github.com/StoneHub/apple-fm-swift) | Native model APIs and caller-owned tools |
| [Apple FM Terminal](https://github.com/StoneHub/apple-fm-terminal) | Request-only shell assistance and explicit Safari questions |
| [Apple FM VS Code](https://github.com/StoneHub/apple-fm-vscode) | Local model support in the editor |
| [Android OTP for Safari](https://github.com/StoneHub/android-otp-for-safari) | On-device code extraction from Google Messages previews |
| Safari Agent | Safari tab tools shared by model clients |

Each project remains independently usable. See each repo’s Releases and current installation status; a public source repository does not imply a notarized binary.

## Public project directory concept

[The showcase proposal](docs/showcase-concept.md) sketches one small static directory for the repositories, actual releases, install status and feedback links. It was brainstormed in a visible T3 Claude Code conversation and reviewed against current project boundaries. No site or new binaries have been published.
