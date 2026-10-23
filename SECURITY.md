# Security

This early preview grants an agent access to selected Safari tabs, including signed-in content. Use GitHub Security → Report a vulnerability for private reports. Ordinary issues should contain fictional reproductions and status metadata only.

Include the version, trust boundary and impact. Exclude pairing tokens, cookies, account details, page captures and private logs. Page instructions are untrusted input. Never demonstrate a report using someone else's account or data.

Stop tab access from the popup or stop the local MCP process. Disable the extension in Safari to stop it entirely. Pairing/grants are memory-only and expire on background restart; navigation revokes the tab grant. Already completed actions cannot be undone by Stop. The local bridge requires a bearer token and rejects ordinary website origins; it is not designed to defend against a compromised local account or a malicious authorized agent.
