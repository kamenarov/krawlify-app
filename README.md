# Krawlify — SEO Crawler & Audit Platform

[![CI](https://github.com/kamenarov/krawlify-app/actions/workflows/ci.yml/badge.svg)](https://github.com/kamenarov/krawlify-app/actions/workflows/ci.yml)
[![Docker Hub](https://img.shields.io/docker/v/kamenarov/krawlify-app?label=docker&sort=semver)](https://hub.docker.com/r/kamenarov/krawlify-app)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A self-hosted, multi-user website crawler with Screaming Frog–style data tabs, live
progress streaming, a REST API, and an **MCP server** so an AI assistant can run audits
itself.

Built on **Next.js 15 (App Router) + TypeScript + Tailwind**, a standalone **Node.js crawl
worker**, **PostgreSQL (Prisma)** and **BullMQ + Redis**. Crawl progress reaches the
browser over **Server-Sent Events**.

## What it does

- **Crawls a site** — respecting robots.txt, following sitemaps (including nested indexes),
  capturing redirect chains, and status-checking external links and assets.
- **Audits what it finds** — titles, meta descriptions, H1–H6, canonicals and robots
  directives, image alt text, broken assets, orphan pages, publication dates.
- **13 result tabs** with server-side pagination, filter presets, sorting, URL search and
  CSV / Excel export.
- **Streams progress live** — the dashboard updates as pages land, without polling.
- **Handles bot-protected sites** — drive the whole crawl through a remote browser, with
  an optional 60-second wait for Cloudflare-style interstitials to clear.
- **Multi-user** — credentials auth, member/admin roles, per-user crawls and API keys.
- **Three ways in** — the web UI, a key-authenticated REST API, and an MCP server.

## Requirements

- **Docker** (the one-command path needs nothing else), or
- **Node.js 20+**, **PostgreSQL 16**, **Redis 7** for local development.

No browser binaries are needed unless you use the bot-protection bypass, which connects
to a browser you run separately.

## Quick start

### Everything in Docker

Runs Postgres, Redis, migrations, the web app and the crawl worker together:

```bash
docker compose up --build
```

Open **http://localhost:3000**, register an account, and start a crawl.

- `migrate` applies the Prisma schema once on startup; `web` and `worker` wait for it.
- `web` and `worker` share one image (`./Dockerfile`) and run different commands.
- Override secrets via env: `NEXTAUTH_SECRET=… NEXTAUTH_URL=… docker compose up`.
- Seed a demo user (optional): `docker compose run --rm worker npm run prisma:seed`
  — `demo@krawlify.com` / `demo1234`, with the admin role. Change the password, or skip
  the seed entirely, on anything reachable from outside your machine.
- Stop with `docker compose down` (add `-v` to also wipe the DB/Redis volumes).

To run the published image instead of building locally, pull it and point compose at it:

```bash
docker pull kamenarov/krawlify-app:edge     # or a release tag, e.g. :0.1.0
IMAGE=kamenarov/krawlify-app:edge docker compose up -d
```

`:edge` is built from `main` on every green CI run. Releases come from `v*` git tags and
publish `:1.2.3`, `:1.2`, `:1` and `:latest`, alongside a
[GitHub release](https://github.com/kamenarov/krawlify-app/releases) carrying that
version's changelog — so `:latest` is always something that was deliberately cut, never
just the newest commit. Use `:edge` if you want the newest commit. Both `linux/amd64` and
`linux/arm64` are published. The image carries the web app, the worker and the migration
step — compose runs the same one three times with different commands.

### Local development (hot reload)

```bash
docker compose up -d postgres redis   # infrastructure only
cp .env.example .env                  # then set NEXTAUTH_SECRET
npm install
npx prisma migrate dev --name init
npm run prisma:seed                   # optional: demo@krawlify.com / demo1234
```

Then in two terminals:

```bash
npm run dev       # Next.js on http://localhost:3000
npm run worker    # crawl worker
```

## Configuration

Copy `.env.example` to `.env`. Everything has a working default except the auth secret.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis, used by BullMQ and the progress pub/sub |
| `NEXTAUTH_SECRET` | **Set this.** Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of the app |
| `CRAWL_DEFAULT_USER_AGENT` | Global fallback User-Agent |
| `CRAWL_MAX_REDIRECT_HOPS` | Cap on a redirect chain before giving up (default 10) |
| `WORKER_CONCURRENCY` | How many crawls the worker runs at once (default 3) |

Per-crawl concurrency and request timeout are set on the crawl itself, not here.
(`.env.example` also lists `CRAWL_DEFAULT_CONCURRENCY` and `CRAWL_REQUEST_TIMEOUT_MS`;
nothing reads them — the schema defaults of 8 and 15000 apply instead.)

Under Docker Compose, `DATABASE_URL` and `REDIS_URL` are set to the in-network service
names and override anything in a host `.env`.

**There are deliberately no environment variables for the bot-protection bypass.** The
remote-browser endpoint, its token and any proxy come from each crawl's own fields — see
[Cloudflare / bot protection](#cloudflare--bot-protection).

## Architecture

Two processes share Postgres + Redis:

- **Next.js app** (`src/app`) — UI, NextAuth credentials auth, REST API, MCP server, and
  the SSE relay route.
- **Crawl worker** (`worker/index.ts`) — consumes BullMQ jobs, runs the crawl engine
  (`src/crawler/*`), streams page data into Postgres in batches, and publishes progress to
  a Redis pub/sub channel that the SSE route forwards.

```
Browser ──SSE── Next.js API ──pub/sub── Worker ──Prisma──> Postgres
   │                │  BullMQ ─jobs─> Redis <─progress─┘
   ├── REST (tab data, export) ─────────> Postgres
   └── MCP (tools/call) ────────────────> Postgres + BullMQ
```

### Crawl engine (`src/crawler/`)

| File | Responsibility |
|---|---|
| `url.ts` | URL normalisation / hashing / internal-vs-external classification |
| `frontier.ts` | Dedup work queue with depth and max-URL limits |
| `fetcher.ts` | `undici` fetch with manual redirect-chain capture |
| `browser.ts` | Remote-browser fetching, bot-check detection, the two-mode strategy |
| `robots.ts` | robots.txt cache + sitemap discovery |
| `sitemap.ts` | Recursive sitemap-index + urlset parsing |
| `parse.ts` | Cheerio extraction (titles, meta, headings, canonical, links, assets) |
| `audit/*` | Pure, unit-tested analyzers (titles, meta, headings, directives, images) |
| `persist.ts` | Batched `createMany` writes — never accumulates the crawl in memory |
| `engine.ts` | Orchestration: concurrency pool, progress publishing, finalize pass |

The finalize pass computes inlink counts, orphan pages, duplicate rollups and broken
resources once the frontier drains.

## Project layout

```
src/app/          Next.js routes — pages, REST API (/api/v1), MCP server (/api/mcp)
src/components/   Shared UI (data table, filters, charts, theme toggle, logo)
src/crawler/      The crawl engine (see above)
src/lib/          Services shared by the API, MCP server and worker
src/lib/mcp/      MCP protocol, tool registry and dispatcher
worker/           BullMQ worker entrypoint
prisma/           Schema, migrations, seed
scripts/          Smoke tests and a ws/cdp end-to-end check
.claude/skills/   Claude Code skill for driving the crawler
```

## Crawl controls

Seed URL · max depth · max URLs · concurrency · respect/ignore robots.txt · follow
nofollow · check external links · check assets · custom User-Agent · webhook URL.

**User-Agent** resolves in this order: explicit per-crawl UA → the user's saved default
(**Settings**) → `CRAWL_DEFAULT_USER_AGENT` → a built-in fallback. The new-crawl form
pre-fills with the effective default, and the API uses it when a request omits one.

### Cloudflare / bot protection

Tick *"Site uses Cloudflare / bot protection"* on the new-crawl form (config flag
`bypassBotProtection`) and point it at a remote browser. Pick the **connection type**
(`browserConnection`):

| Mode | Client call | Endpoint (`browserServer`) example |
| --- | --- | --- |
| `ws` (schema default) | `chromium.connect` | `ws://playwright:3001/` |
| `cdp` | `chromium.connectOverCDP` | `http://cloakbrowser:9222` |

**The hosted relay.** Ticking the box on the form pre-fills the endpoint with
`https://alpha.krawlify.com` — the Krawlify **ws_cdp relay** — as `cdp` + `bearer`. The
relay is multi-tenant and drives *your own* Chrome through the Krawlify browser extension,
so the Bearer token there is not a server password but the token from the extension's
options page: it selects whose browser the crawl runs in. That browser has to be open with
the extension connected, otherwise the relay answers `503` (it returns the same `503` for
an unknown token, deliberately, so nobody can probe for which tokens exist). The pre-fill
is a form default only — clear it and point the crawl at any browser you run yourself.

**Every value in this section comes from the crawl's own fields and nowhere else** — there
is no environment fallback for the endpoint, the token or the proxy. A crawl that enables
the bypass without an endpoint (or picks `bearer` with no token, or `useProxy` with no
server) is rejected when it is created rather than failing later in the worker. The upside
is that a crawl is self-contained: it is stored with exactly what it ran with, so **Redo
crawl** reproduces it and changing a `.env` can never silently change how an existing crawl
behaves.

**Authentication** (`browserAuth`) is independent of the mode: `bearer` sends
`Authorization: Bearer <browserAuthToken>` on the connection handshake, `none` sends no
auth header — which is what providers that authenticate with a `?token=` query param on
the URL want.

Use `ws` for a Playwright browser server, `cdp` for an already-running Chrome that exposes
a DevTools endpoint. Hosted providers typically expose **CDP at the bare root URL and the
Playwright protocol under a path** — e.g. browserless takes `wss://host?token=…` for `cdp`
but `wss://host/chromium/playwright?token=…` for `ws`. Pointing `ws` at a CDP root just
times out after 30s (each protocol hangs on the other's socket), and some hosted browsers
ignore the User-Agent override over CDP and serve their own. **A CDP endpoint is addressed
by its `http://` URL** — Playwright reads `webSocketDebuggerUrl` from it; the bare
`ws://host:9222/` root path serves plain HTTP and will fail to upgrade. Proxy settings
apply to `ws` only: over CDP the browser's proxy is fixed when it launches, so a crawl that
asks for one is rejected rather than run from the wrong IP.

Either way the browser runs on a **separate host**; the worker connects to it and
immediately crawls **every page through that browser, one page at a time** (rendered HTML,
so JS-injected content is captured), with asset/status/robots/sitemap requests also going
through the browser context. The crawl starts as soon as the connection is up — there is no
challenge-clearing wait by default, and getting past any interstitial is the remote
browser's job.

#### Waiting out a bot check

**Wait 1 minute for the bot check** (`waitForBotCheck`, a checkbox in the same section)
changes that per page: when a navigation lands on an interstitial — recognised by its title
(*"Just a moment…"*, *"Checking your browser…"*, *"Attention required"*, …) or a challenge
container such as `#challenge-form` / `.cf-browser-verification` — the page is given up to
60 seconds to clear itself, and what it turns into is recorded instead. It only ever waits
when an interstitial is actually detected, so pages that load normally are not slowed down;
and once clearance is granted the cookie is reused for the rest of the crawl, so at most
the first page or two pay the wait. If the minute runs out the page is recorded as served
(status and markup of the interstitial). The worker logs each occurrence
(`[browser] bot check on … — waiting up to 60s…`).

The option also switches the crawl to a **two-mode** strategy, because the two jobs want
opposite things:

| | The tab facing the check | Every page after clearance |
| --- | --- | --- |
| How | `page.goto`, rendered | `context.request.get`, no rendering |
| Resources | **nothing blocked** — scripts, cookies, CSS, images, fonts all load | none fetched at all |
| Why | a check may load subresources and watch that they arrive; blocking them is a way to fail one that would otherwise pass | the parser only needs the HTML |

Normally the crawler blocks images/media/fonts for speed; while a check may be in play
that block is lifted so the tab behaves like a real browser. Once cleared, pages are pulled
over HTTP **through the same browser context** — same cookie jar (including `cf_clearance`),
same IP, same TLS fingerprint — which is as fast as `curl` and skips layout and JS entirely.
Redirects on that path are followed by hand so the Redirects tab still gets every hop. If a
fetch comes back looking like a challenge again, that URL goes back to the tab, re-clears,
and the fast path resumes.

Two consequences worth knowing: pages fetched on the fast path are **not JS-rendered**, so
a site that builds its content client-side wants this option off; and the crawl stays at
one request at a time, since parallel requests from a single browser IP are the quickest
way to get re-challenged — the speed-up here comes from dropping rendering, not from
concurrency.

The whole crawl runs in the browser because a `cf_clearance` cookie is bound to the IP + UA
that solved the challenge — and that's the browser server, not the worker. No device
emulation is applied: the context uses `viewport: null`, i.e. the remote browser's real
window. If the browser is unreachable, or disconnects mid-crawl, the report is flagged
**`failed`** rather than finishing with a silent hole in it. The remote browser is **always
closed** afterwards — on completion, stop, or failure.

#### Anti-detection layers

All client-side, configured per crawl:

- **Residential/mobile proxy (optional)** — enable with the **Use a proxy** checkbox
  (`useProxy`) and fill in `proxyServer`/`proxyUsername`/`proxyPassword` on the crawl.
  Datacenter IPs get flagged instantly. *Per-context proxies require the Playwright server
  to be launched with a global proxy* (e.g. `launchServer({ proxy: { server: 'per-context' } })`);
  on such a server every crawl must set a proxy, so for mixed use run one plain server and
  one proxy-enabled server.
- **Realistic context** — `viewport: null` and a current Chrome UA. Locale, timezone and
  geolocation are **not** set per crawl: the remote browser owns them, so a proxy should be
  in a region matching that browser's own settings.
- **Stealth init-scripts** (injected over the connection, since server-side stealth doesn't
  apply to contexts we create) — patch `navigator.webdriver`, plugins/mimeTypes,
  `window.chrome`, permissions, WebGL vendor/renderer. `navigator.languages` is left alone,
  since overriding it to contradict the browser's real locale is itself a tell.
- **Fingerprint variance** — per-session randomized WebGL vendor/renderer, varied plugin
  count, and canvas-readback noise so the fingerprint isn't byte-identical between runs.
- **Navigation retries** — transient navigation errors are retried with exponential backoff.

The worker image carries **no browser binaries** — only the Playwright client. Run the
browser separately. `docker-compose.yml` keeps an example `playwright` service (headful
Chromium under Xvfb at `ws://playwright:3001/`) behind the `playwright` profile, so it is
**off by default** — start it with `docker compose --profile playwright up -d`. The worker
also joins the external browser networks, so remote browsers running in other stacks are
reachable by name from a crawl's connection field.

> **Caveat:** stealth plus a real browser lets passive / JS challenges auto-clear, but it is
> **not** a guaranteed bypass. A site that keeps serving an interstitial is crawled as-is —
> those pages get recorded with the interstitial's status and markup rather than failing the
> report. *Wait 1 minute for the bot check* buys a passive challenge time to finish; it does
> nothing for one that demands interaction.

## Data tabs

Internal · External · Response Codes · Page Titles · Meta Description · Headings (H1–H6) ·
Directives · Images · Broken Assets · **Links** · Redirects · Sitemaps (orphan pages) ·
**Dates**. Every tab supports server-side pagination, filter presets, sorting, URL search,
and **CSV / Excel export** (plus a multi-sheet master export).

The **Dates** tab surfaces publish/modified dates from two independent sources:
`datePublished` / `dateModified` parsed from each page's **JSON-LD** structured data
(schema.org `@graph`, Article/BlogPosting, with `dateCreated`/`uploadDate` fallbacks), and
the **sitemap `<lastmod>`** matched per URL. Filter by which signal is present.

The **Links** tab lists every link (source → destination), its anchor text, and flags
follow/nofollow, `target="_blank"`, and internal vs external — filterable by each.

## Programmatic API

Full reference is in-app at **`/docs/api`** (linked from the footer when logged in). Create
API keys under **Settings** (shown once at creation), then authenticate with
`Authorization: Bearer <key>` or `X-API-Key: <key>`.

| Method & path | Purpose |
|---|---|
| `POST /api/v1/crawls` | Create + enqueue a crawl (body = crawl config, optional `webhookUrl`) |
| `GET /api/v1/crawls/:id` | Crawl status, counters, and issue summary |
| `GET /api/v1/crawls/:id/results?tab=…` | Paginated/filtered result rows for any tab |
| `DELETE /api/v1/crawls/:id` | Delete a crawl and all its data (admins: any crawl) |

```bash
curl -X POST http://localhost:3000/api/v1/crawls \
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"seedUrl":"https://example.com","maxUrls":50,"webhookUrl":"https://you.dev/hook"}'
```

**`/playground`** (also in the footer) sends real requests to those endpoints from the
browser: pick an endpoint, paste a key, fill the parameters or JSON body, and read the
status/latency/response. It also renders the equivalent `curl` command (key masked until
you press *Show*). The key is kept in the page only — never persisted or logged.

Key management endpoints (session-authenticated, used by the Settings UI):
`GET/POST /api/keys`, `DELETE /api/keys/:id`.

## MCP server

Krawlify speaks the [Model Context Protocol](https://modelcontextprotocol.io) at
**`POST /api/mcp`**, so an AI assistant can start crawls and read the findings itself. The
in-app guide is at **`/docs/mcp`**.

Streamable HTTP transport, stateless (no session id), authenticated with the same API key
as the REST API. Add it to Claude Code with:

```bash
claude mcp add --transport http krawlify http://localhost:3000/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

Or into any client's MCP config:

```jsonc
{
  "mcpServers": {
    "krawlify": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}
```

**Tools:** `list_crawls`, `get_crawl`, `get_crawl_results`, `list_result_tabs`,
`start_crawl`, `stop_crawl`, `delete_crawl`. Each wraps the same service function the REST
API calls, so behaviour cannot drift between the two front doors.

Three things differ from the REST API on purpose:

- The crawl **`config` is never returned** — it holds the browser token and proxy password
  in plaintext, and an MCP response goes straight into a model's context and its client's logs.
- `get_crawl_results` caps at **200 rows** (25 by default, versus 1000 over REST) and strips
  empty fields and internal keys, to keep responses inside a model's context window.
- `delete_crawl` is annotated `destructiveHint: true` so a well-behaved client asks before
  running it.

Protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05` are supported. `GET` returns
405 (no server-initiated stream) and `DELETE` returns 204. Clients that cannot send a custom
header would need OAuth, which this server does not implement.

## Claude Code skill

`.claude/skills/krawlify-audit/` teaches Claude Code how to use the MCP server well — how
to size `maxUrls`, how to turn each issue count into the right tab-and-filter query, and how
to avoid the standard misreadings (a crawl reporting `12/12` hit its limit, it did not find
a 12-page site). It loads automatically when working in this repository.

## Users & roles

Two roles: **member** (default) and **admin**. The seeded `demo@krawlify.com` user is an admin.

- **Members** see and manage only their own crawls and API keys.
- **Admins** additionally get a **Users** area (`/settings/users`) to create users, change
  details (email, name, role, password), disable/enable and delete users. Admins can also
  open any user's crawl dashboard — the **View crawls** link sets `?user=<id>` on the home
  page, and crawl-data routes authorise admins for any crawl.
- **Disable** blocks sign-in (and immediately invalidates any active session) while keeping
  all data — reversible via **Enable**.
- **Delete** permanently removes the account **and all its data**: every crawl and its
  results plus all API keys (DB cascade).

Guards prevent lockout: you cannot delete or disable your own account, and you cannot
delete, disable, or demote the **last active admin**.

Admin endpoints (session-authenticated, admin-only): `GET/POST /api/users`,
`PATCH/DELETE /api/users/:id`.

## Webhooks

Set a **Webhook URL** on a crawl (new-crawl form or the API `webhookUrl` field). When the
crawl reaches a terminal state (`done` / `stopped` / `failed`), the worker POSTs once:

```jsonc
{
  "event": "crawl.completed",
  "crawl": { "id": "…", "seedUrl": "…", "status": "done",
             "totalFound": 50, "totalCrawled": 50, "byStatusClass": {"2": 48, "4": 2},
             "startedAt": "…", "finishedAt": "…", "error": null },
  "issues": [ { "category": "titles.duplicate", "severity": "warning", "count": 3 } ]
}
```

Delivery is best-effort (10s timeout, `X-Krawlify-Event` header) and never fails the crawl.

## Theming

Light and dark are switchable from the **Light / System / Dark** control in the top-right of
every page. *System* is the default and follows `prefers-color-scheme` live; an explicit
choice is stored in `localStorage` under `krawlify-theme` and re-applied by a blocking script
in `<head>` before first paint, so there is no flash of the wrong theme.

Dark mode is class-based (`.dark` on `<html>`, `darkMode: "class"` in the Tailwind config).
Rather than annotating every component with `dark:` variants, `globals.css` remaps the
palette the UI is built from, in two layers:

- a **brand layer** that swaps Tailwind's stock blue accent for the brand violet in *both*
  themes (so `bg-blue-600` renders violet and `text-blue-600` renders the link purple — no
  component needed changing);
- a **`.dark` layer** that re-skins the neutrals to kamenarov.dev's surfaces, text, borders
  and status colours.

New components inherit both for free as long as they stay on the same utilities. Two
gotchas: the brand layer relies on source order (it is emitted after `@tailwind utilities`,
at equal specificity), and `dark:*` variants are *not* remapped — they emit Tailwind's
literal colours — so explicit dark styling needs explicit values, e.g. `dark:bg-[#272438]`.

## Brand

**Krawlify** wears [kamenarov.dev](https://kamenarov.dev)'s palette — violet `#8b5cf6` →
purple `#a855f7` on near-black `#101019` / `#15141f`, with `#ececf1` text, `#8a8a97` muted,
and hairline borders at 7% white. Status colours come from the same family: `#3ddc84`,
`#ffbd2e`, `#e0576b`. The product name and those hex values live in `src/lib/brand.ts`.

The mark is the **K** tile from the Krawlify browser extension — `<Logo />` in
`src/components/Logo.tsx` redraws it as SVG using the exact coordinates from that project's
`tools/make-icons.mjs`, so the two stay identical as either changes. The extension's 128px
PNG is `src/app/icon.png`, which Next serves as the favicon.

## Development

```bash
npm test            # vitest — 81 tests across 6 files
npm run typecheck   # tsc --noEmit
npm run build       # prisma generate && next build
```

Test coverage is concentrated on the pure logic: the SEO analyzers, URL normalisation,
sitemap parsing, JSON-LD date extraction, crawl-config validation, bot-check detection, and
the MCP protocol layer. `scripts/` holds a smoke test and a ws/cdp end-to-end check for the
remote-browser path.

## Notes

- Duplicate title/meta/H1 detection is computed via grouped queries (stored hashes) so it
  stays correct as data streams in — no per-row duplicate flag to go stale.
- Sitemaps: a `<sitemapindex>` is followed into all its child sitemaps (Rank Math / Yoast
  `sitemap.xml` → `post-sitemap.xml`, `page-sitemap.xml`, …), including nested indexes.
  Parsing tolerates XSL stylesheet PIs, trailing comments, `image:` and other namespaces,
  and namespace-prefixed roots; each URL's `<lastmod>` is captured.
- Orphan pages = URLs present in the sitemap(s) with zero internal inlinks.
- Pixel widths for titles/meta are approximated via a per-character width table.
- `totalFound` counts URLs *admitted* to the crawl, which stops at `maxUrls` — a crawl
  reporting `12/12` on a large site hit its limit rather than finding twelve pages.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, what a good change looks like, and the
few invariants worth knowing before you touch the crawl config or the bot-protection path.
Security issues go through [SECURITY.md](SECURITY.md), not the issue tracker.

## License

[MIT](LICENSE) © Yordan Kamenarov.

Every runtime and build dependency is permissively licensed (MIT, ISC, Apache-2.0, BSD),
so a build of this project can be redistributed without further obligation beyond
preserving the copyright notices. Two entries in the tree are worth knowing about and
neither constrains use: `jszip` is dual-licensed `MIT OR GPL-3.0` (the MIT arm applies),
and `sharp`'s optional platform binaries link LGPL libvips as a separate shared library,
which does not reach this project's source.
