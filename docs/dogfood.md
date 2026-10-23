# Automatic-access dogfood acceptance

## Current checkpoint

The requested workflow is now automatic connection and discovery of ordinary open HTTP(S) tabs, using Safari's website permissions. No session token copying, per-tab Allow button or persistent popup is part of the intended flow. Private windows stay excluded; Stop persists until Resume. [Architecture](architecture.md) records the selected native connection path.

The corrected native implementation is built and installed, and the first real Safari form round trip passed with the popup closed. Long idle/sleep and Safari relaunch remain separate checks. Public binaries and App Store distribution remain separate.

## Real Safari acceptance — 0.2.2

After the operator approved Safari website access and closed the popup, the bridge connected automatically. The first real trial exposed a custom-port bug: permission checks used URL origins containing a port, which Safari rejects as an invalid match-pattern host. A direct check using the installed WebKit API rejected the port-containing pattern and accepted the host-only pattern. Preview 0.2.2 checks scheme/hostname permissions while preserving the full tab URL and document identity. A regression check covers the localhost case; 22 Node tests pass.

The signed preview 0.2.2/build 202 installed with 37 matching bundle files and strict signature verification. With the popup still closed, the fictional form appeared automatically. The test read it, typed Ada, clicked Preview greeting, and verified Hello Ada. Navigation automatically established fresh document access without an Allow step; a control handle from the old document was rejected, and reading the new document succeeded. Only the fictional localhost form was operated.

An actual on-device Foundation Models request then called `list_tabs` and `read_page` and correctly identified the fixture title and Name input label. A temporary read-only MCP wrapper exposed only the fictional form and blocked every other tab and mutation tool. Its receipt recorded two listing calls (including pre-inference discovery) and one page read; generated prose alone was not used as proof.

After both test clients disconnected, the unused daemon exited and its private descriptor disappeared. A fresh client automatically started a new daemon, rediscovered the same fictional tab and read it with the popup still closed. That startup/discovery/read sequence took 2,065 ms in this trial. This establishes one idle-daemon reconnect, not a guarantee about recovery after system sleep or Safari relaunch.

Persistent Stop/Resume, denied/private tab boundaries and in-flight fencing have source regression coverage; their full real-browser restart checks remain open. Popup closure in this trial does not establish overnight sleep or Safari relaunch recovery.

## Current verified checkpoint — 0.2.1

The integrating agent reports 21 Node tests passed and the Apple FM adapter recompiled. The signed app/native-extension/helper build passed. Version 0.2.1/build 201 is installed with all 37 bundle files matching the exact product and strict signature verification passing. Version/build were also read directly from the installed app metadata for this record. The build requires expanded group metadata and signing membership rather than silently packaging an incomplete native connection.

An actual signed helper publish/read-match/remove round trip passed using the Team-prefixed macOS App Group. Descriptor data traveled through private stdio and was not printed. This establishes native group storage and helper IPC, not Safari background delivery or real-tab control.

The initial proposal to let Node write into the extension's own container failed with macOS-protected-container EPERM, even with normal host access. It was replaced with the signed storage helper; direct Node group/container access is not the fallback. The daemon's private log directory is `~/.local/state/safari-agent`; direct filesystem descriptor access is reserved for the explicit isolated-test override.

The standalone native wake dispatcher returned `SFErrorDomain` code 1. The corrected containing-app headless `--bridge-wake` entry built, installed and returned success before creating any setup window. Safari accepted that dispatch. Website permission, actual background delivery and closed-popup tab operations still need their own acceptance checks; a dispatch acknowledgment alone does not establish them.

Discovery currently considers the first 500 browser-query results before eligibility filtering, with a five-second snapshot cache invalidated immediately by relevant browser events. This is a bounded scan, not a guarantee of unlimited open-tab coverage.

## Earlier verified checkpoint

Nine Node tests and JavaScript syntax checks passed for the original bridge, including authenticated transport, ungranted-tab denial, navigation/Stop revocation, stale document handles and rejection of commands from a previous grant after Stop/regrant. The Apple FM client compiled and an actual on-device request invoked MCP `list_tabs` once against an empty original broker; generated content and pairing token were suppressed. New automatic-tab code requires its own current checks.

On October 23, an absolute extension path generated the project. The initial signed build exposed a generated containing-app identifier capitalization mismatch; the generator corrected it reproducibly. The corrected development-signed Debug product was installed. All 24 bundle files matched, strict signature verification passed, and the launched executable path/hash matched the installed app. Browser permissions were unchanged. Those are historical installation checks, not verification of the automatic redesign.

## First automatic Safari session

The popup opens from the compass-shaped Safari Agent button beside Safari's address field. Enable the extension in Safari → Settings → Extensions, including for the intended Safari profile. If the button is hidden, use View → Customize Toolbar; a narrow window may put it under overflow chevrons. It is optional status/control UI, not a connection prerequisite.

1. Use the exact current installed build; rebuild/install again after any remaining wake-entry changes. Enable its normal Safari website permissions. Start a compatible local MCP client without a token or pairing step.
2. Serve the synthetic `fixtures/form.html` using a task-owned HTTP server. Open it in an ordinary window and close the extension popup. Verify it appears in `list_tabs` automatically. Keep other tabs usable.
3. Read the fixture, type fictional text, click its preview button and verify the greeting. Retain only pass/fail metadata, never page bodies from actual accounts.
4. Navigate/reload. Verify old document handles and queued commands fail, then verify the new eligible document appears automatically without Allow/regrant.
5. Stop access. Verify metadata/action access stops and stale queued commands stay rejected. Restart the background context and verify Stop remains in effect. Resume and verify automatic rediscovery with fresh identities.
6. Test denied website permission, unsupported pages and private windows. They must stay unavailable. Restore only the website permission the operator intends.
7. Leave the popup closed and Safari idle long enough for background suspension. Trigger a new explicit agent request; measure recovery latency and document the result. Repeat after bridge restart. Do not infer wakeup reliability from a timer or successful startup alone.
8. Repeat a read-only question through the Apple FM client. Record actual model tool calls separately from deterministic client checks. `--check-model` may receive eligible tab metadata under the new policy; it exposes no page-reading tool.

Retain revision, app/browser versions, tool names, measured recovery timing and pass/fail only. Stop the synthetic HTTP server afterward. Do not copy connection descriptors, session credentials, real tab lists or page content into issues or shared logs.

## Finish line and remaining frontier

Owner: this repository for implementation, packaging and fixes; maintainer for Safari website permission and real-use acceptance. [Issue #1](https://github.com/StoneHub/safari-agent/issues/1) tracks the changed scope and actual checks. Record separately: source/harness checks, signed build, installed bytes, native descriptor bootstrap, real tab operations, persistent Stop and closed-popup idle recovery. A model's generated prose is not browser evidence.

Screenshots, richer controls and multi-agent ownership follow measured needs. Apple's developer MCP may complement this route, but existing signed-in-tab behavior and lifecycle must be proven in this extension independently.
