# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A version's section is lifted verbatim into its GitHub release, so keep the heading in the
`## [1.2.3]` form the release job matches on.

## [0.1.1]

### Changed

- **Kept out of search engines** — every page now carries `<meta name="robots"
  content="noindex, nofollow">`, and every response (API and exports included) sends
  `X-Robots-Tag: noindex, nofollow`, so a publicly reachable instance is not indexed.

## [0.1.0]

First release. Everything is new, so there is nothing to compare against; later entries
will use the usual Added / Changed / Fixed sections.

### The crawler

- **Crawl engine** — robots.txt, sitemaps including nested indexes, redirect chains,
  status checks on external links and assets, configurable depth/URL caps, concurrency and
  politeness delay.
- **Audit** — titles, meta descriptions, H1–H6, canonicals and robots directives, image
  alt text, broken assets, orphan pages, publication dates.
- **13 result tabs** with server-side pagination, filter presets, sorting, URL search and
  CSV / Excel export.
- **Live progress** over Server-Sent Events — the dashboard updates as pages land.
- **Bot-protection bypass** — run the whole crawl through a remote browser, over a
  Playwright server (`ws`) or any Chrome DevTools endpoint (`cdp`), with optional Bearer
  auth and a per-context proxy. Every setting comes from the crawl's own fields, never
  from the environment, so a crawl is stored with exactly what it ran with and **Redo
  crawl** reproduces it.
- **Wait for the bot check** (`waitForBotCheck`) — give a Cloudflare-style interstitial up
  to 60 seconds to clear at full browser fidelity, then pull the rest of the crawl over
  plain HTTP through the same session.
- Mid-crawl remote-browser disconnect detection: the crawl fails with an explanation
  rather than finishing with a silent hole in the results.

### Ways in

- **Web UI** — credentials auth, member/admin roles, per-user crawls and API keys, dark
  mode with a Light / System / Dark switcher applied before first paint.
- **REST API** (`/api/v1`) with key authentication, completion webhooks, and a
  **playground** at `/playground` for sending real requests from the browser.
- **MCP server** at `POST /api/mcp` — Streamable HTTP transport, stateless, authenticated
  with the same API keys. Seven tools: `list_crawls`, `get_crawl`, `get_crawl_results`,
  `list_result_tabs`, `start_crawl`, `stop_crawl`, `delete_crawl`. Guide at `/docs/mcp`.
- **Claude Code skill** (`.claude/skills/krawlify-audit/`) for driving the crawler through
  the MCP server.

### Deployment

- **Docker image** — `kamenarov/krawlify-app`, built for `linux/amd64` and `linux/arm64`.
  `:edge` follows `main`; `v*` git tags publish semver tags. Set `IMAGE=` to run it from
  `docker-compose.yml` instead of building locally.
- `docker compose up --build` brings up Postgres, Redis, migrations, the web app and the
  worker together.

[Unreleased]: https://github.com/kamenarov/krawlify-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kamenarov/krawlify-app/releases/tag/v0.1.0
