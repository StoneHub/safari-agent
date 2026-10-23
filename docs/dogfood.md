# First dogfood acceptance

## Current checkpoint

The initial source provides a stdio MCP bridge, authenticated loopback transport, explicit grants, document-bound element handles and a fictional fixture. Source/harness checks do not establish a working Safari installation. Apple FM client verification is recorded in its own README. Public binaries and App Store distribution are not part of this checkpoint.

## Verified in this source checkpoint

Nine Node tests and JavaScript syntax checks passed, including authenticated transport, ungranted-tab denial, navigation/Stop revocation, stale document handles, and rejection of commands from a previous grant after Stop/regrant. The Apple FM client compiled and an actual on-device request invoked MCP list_tabs once against an empty broker; generated content and pairing token were suppressed.

The initial converter attempt was blocked by sandbox path access. On October 23, normal host access and an absolute extension path generated the project. The generated containing-app identifier used different capitalization from the extension prefix, causing the first signed build to fail; `scripts/generate-safari-project.py` corrects that reproducibly. The corrected development-signed Debug build passed.

The exact current-build product was installed in Applications. All 24 bundle files match, strict signature verification passed, and the launched executable path and hash matched the installed product. Browser permissions were unchanged. First live tab control remains pending explicit enablement and fixture grant; installation alone does not establish it.

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
