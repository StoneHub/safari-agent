# Contributing and dogfooding

Start with a fictional page and one small workflow. Run `npm run check` and `npm test`, then package the affected extension and test the exact changed behavior. Record the revision and whether evidence comes from a harness, build, installed extension, or real browser session.

Use [the dogfood checklist](docs/dogfood.md) for first acceptance. Test ungranted-tab denial and Stop/navigation behavior after changes to transport, grants, or dispatch. Broaden verification when affected boundaries or failures warrant it. Keep Actions manual-only.

Report metadata and fictional reproductions only. Exclude real URLs/titles, page text, account data, tokens, cookies, messages, signing details, and screenshots of private tabs. Keep private receipts and build products out of Git. Use GitHub issues for reproducible failures and the next small improvement. Include a short next-use test and what would show it is broken.

Local installation, browser permission changes, and public binary releases each require their own intended scope. Source publication is not proof of an installed extension. Stop temporary test servers after tests; if a useful runtime remains, record its owner, port and stop command locally.
