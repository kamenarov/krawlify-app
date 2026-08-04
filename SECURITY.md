# Security Policy

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private reporting —
[**Security → Report a vulnerability**](https://github.com/kamenarov/krawlify-app/security/advisories/new)
— or email the maintainer at <yordan@kamenarov.dev>.

Please include enough to reproduce: the endpoint or crawl setting involved, the request,
and what you were able to reach that you should not have been. You will get an
acknowledgement within a few days. There is no bounty programme; credit in the release
notes is offered unless you would rather stay anonymous.

## Supported versions

This project is pre-1.0. Fixes land on `main`; there are no maintained release branches.
Run a recent commit.

## What this software does by design

Krawlify is a crawler. Several of its normal behaviours look alarming out of context, so
they are documented here rather than reported repeatedly:

- **It fetches URLs a user supplies.** Any authenticated user can point a crawl at any
  address the worker can reach, including private network ranges and cloud metadata
  endpoints. There is no SSRF filter. **Do not expose registration publicly on a deployment
  whose worker sits inside a trusted network** — run it on an isolated network, or keep
  accounts to people you trust.
- **It can be given remote-browser and proxy credentials per crawl.** These are stored in
  the crawl's `config` JSON in plaintext, readable by the crawl's owner through the UI and
  `GET /api/v1/crawls/:id`. They are deliberately excluded from every MCP response. Treat
  them as secrets shared with that account, and rotate them if the account is compromised.
- **It ignores robots.txt when asked to.** That is a user-facing setting, not a bug.

## What is protected

- **Passwords** are hashed with bcrypt. **API keys** are stored as SHA-256 hashes; the
  plaintext is shown once at creation and never again.
- **Crawl data is scoped per user.** Every query filters by owner; admins may additionally
  read any crawl. The MCP server carries no ambient authority — every tool call is scoped
  to the API key that authenticated it.
- **Disabling a user invalidates their active sessions immediately**, not at next login.

## Things worth reporting

- Reading or modifying another user's crawls, results or API keys
- Escalating from `member` to `admin`, or bypassing the last-active-admin guards
- Authentication bypass, session fixation, or a way to recover an API key from its hash
- Injection of any kind, including through crawled page content reaching the UI unescaped
- Credentials or tokens appearing somewhere they should not — logs, error messages, an API
  response, an MCP tool result, or an export file
