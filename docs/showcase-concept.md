# A small public directory for local tools

Concept only. No site has been built or published, and this document does not authorize a release, signing change or account action.

The useful first page is a simple directory: what each tool does, where its source lives, what can actually be downloaded, and how to report something that broke. It can be a static page backed by reviewed repository data; it needs no login, database, agent service or new product brand. Hosting is a later decision.

## Projects

| Project | Role | Source and release history |
| --- | --- | --- |
| Apple FM Swift | Native on-device FoundationModels library and helper | [Repository](https://github.com/StoneHub/apple-fm-swift) · [Releases](https://github.com/StoneHub/apple-fm-swift/releases) |
| Apple FM Terminal | Request-only shell assistance; Tab inserts and a separate Enter executes | [Repository](https://github.com/StoneHub/apple-fm-terminal) · [Releases](https://github.com/StoneHub/apple-fm-terminal/releases) |
| Apple FM VS Code | Local inline suggestions, refactors and explicit image questions | [Repository](https://github.com/StoneHub/apple-fm-vscode) · [Releases](https://github.com/StoneHub/apple-fm-vscode/releases) |
| Safari Agent | MCP access to explicitly granted Safari tabs, with an optional read-only Apple FM client | [Repository](https://github.com/StoneHub/safari-agent) · [Releases](https://github.com/StoneHub/safari-agent/releases) |
| Android OTP for Safari | On-device Foundation Models extraction for Google Messages previews | [Repository](https://github.com/StoneHub/android-otp-for-safari) · [Releases](https://github.com/StoneHub/android-otp-for-safari/releases) |

Swift supplies reusable local generation. Terminal and VS Code are independently usable interfaces; Safari Agent offers a separately authorized browser integration. Android OTP independently invokes Apple Foundation Models for code extraction. Sharing a directory does not combine their permissions or update paths.

## Page content

- Lead with a one-line purpose and five project cards, each with source, issue tracker and release-history links.
- Show a download button only for a real reviewed artifact. Display its version, filename and checksum; otherwise say “Build from source.” Avoid a floating latest-release button that can silently take a reader to an older prototype with different behavior.
- Give each project explicit compatibility requirements from its current README. Separate minimum requirements from versions actually tested, and date observations.
- State source, downloadable release, signing/notarization and installed acceptance independently. An unresolved Apple distribution account does not prevent linking public source or existing artifacts; it also does not justify claiming that a new build is signed, notarized or easy to install.
- Keep a short dogfood changelog: task attempted, observed result, linked issue, fixed revision and next human check. Use synthetic or summarized examples, without private pages, browsing history, verification codes, credentials or local paths.
- Keep feedback in each existing repository's issues. Include a direct “Report a problem” link and the minimum useful facts: project/release, OS, expected behavior and observed behavior. Never request secrets or verification codes.

## Fast iteration

Use the repositories as the source of truth. Source documentation can move quickly; release cards should change only after the named artifact and install path are verified. Prefer one tiny reviewed data file for the eventual static directory over scraping local worktrees or embedding private development state. Link back to canonical requirements rather than copying installation instructions into a second place.

First useful dogfood check: a reader can choose the right project, distinguish the current public release from newer unreleased work, and reach its actual installation instructions and issue tracker without asking which repository is canonical.

This concept incorporates a bounded Claude Sonnet brainstorm run through T3 Code, followed by human-agent review. The brainstorm used supplied public project descriptions only. Suggestions were corrected to keep Android OTP separate from Apple FM and to avoid unsupported blanket claims about every project's signing or distribution status.
