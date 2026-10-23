# First dogfood acceptance

## Current checkpoint

The initial source provides a stdio MCP bridge, authenticated loopback transport, explicit grants, document-bound element handles and a fictional fixture. Source/harness checks do not establish a working Safari installation. Apple FM client verification is recorded in its own README. Public binaries and App Store distribution are not part of this checkpoint.

## Verified in this source checkpoint

Nine Node tests and JavaScript syntax checks passed, including authenticated transport, ungranted-tab denial, navigation/Stop revocation, stale document handles, and rejection of commands from a previous grant after Stop/regrant. The Apple FM client compiled and an actual on-device request invoked MCP list_tabs once against an empty broker; generated content and pairing token were suppressed.

Apple's converter flags were verified, but actual packaging failed on sandbox path access. The elevated conversion retry was aborted; no Xcode project, unsigned app, installed extension, or live tab-control result was established. Next action is authorizing the documented converter command, then building/loading under the intended development identity and verifying the fictional fixture. No Safari permission settings were changed.

## First real Safari session

1. Build the containing app with the intended development identity; enable the extension and approve access only for the fictional local test page. Pair its popup with the bridge's private session token.
2. Serve `fixtures/` locally using an owned temporary HTTP server. Open `form.html`; grant that tab. Verify an ungranted tab is absent from `list_tabs` and rejects operations.
3. Have the agent read the page, type fictional text, click the fixture button, and read back the result. Keep another Safari tab usable during the trial.
4. Press Stop. Verify both old queued commands and new calls cannot act. Regrant and verify stale commands cannot acquire the fresh permission.
5. Navigate/reload the page. Verify old handles and access fail until a fresh grant. Stop/restart the extension background and verify it requires pairing again.
6. Repeat with the explicit Apple FM client. Record actual model tool calls separately from deterministic test calls.

Retain only revision, app/browser versions, tool names and pass/fail metadata. Never record the session token or real page content. Stop the temporary fixture server afterward.

## Next frontier

Owner: this repository for implementation and packaging; maintainer for initial browser permission consent and real-use acceptance. Track the first live round trip in issue #1. Subsequent improvements should come from a measured failure or a concrete workflow: persistent transport, screenshots, richer page controls, then multi-agent ownership. Apple's own Safari MCP may complement developer debugging, but ordinary signed-in-tab access must be verified independently.
