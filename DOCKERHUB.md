# Krawlify — SEO Crawler & Audit Platform

Self-hosted website crawler with Screaming Frog–style data tabs, live progress streaming, a
REST API, and an **MCP server** so an AI assistant can run audits itself.

Crawls a site respecting robots.txt and sitemaps, captures redirect chains, status-checks
external links and assets, and audits titles, meta descriptions, headings, canonicals,
robots directives, image alt text and orphan pages across 13 filterable result tabs with
CSV/Excel export.

**Source:** https://github.com/kamenarov/krawlify-app · **MIT licensed**

## Tags

| Tag | What it is |
| --- | --- |
| `latest` | The newest release. What you want. |
| `0.1.0`, `0.1`, `0` | A specific release, pinned as loosely or tightly as you like. |
| `edge` | Built from `main` on every green CI run. Newer, less settled. |
| `sha-<short>` | An exact commit. |

Published for `linux/amd64` and `linux/arm64`.

## Running it

One image runs all three roles — migrations, the web app and the crawl worker — under
different commands. It needs PostgreSQL 16 and Redis 7 alongside it.

```yaml
# docker-compose.yml
x-app: &app
  image: kamenarov/krawlify-app:latest
  environment: &env
    DATABASE_URL: postgresql://crawler:crawler@postgres:5432/crawler?schema=public
    REDIS_URL: redis://redis:6379
    NEXTAUTH_SECRET: change-me            # openssl rand -base64 32
    NEXTAUTH_URL: http://localhost:3000

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: crawler
      POSTGRES_PASSWORD: crawler
      POSTGRES_DB: crawler
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U crawler"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction"]
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  migrate:                                 # one-shot; web and worker wait for it
    <<: *app
    command: ["npx", "prisma", "migrate", "deploy"]
    depends_on:
      postgres: {condition: service_healthy}
    restart: "no"

  web:
    <<: *app
    command: ["npm", "run", "start"]
    ports: ["3000:3000"]
    depends_on:
      redis: {condition: service_healthy}
      migrate: {condition: service_completed_successfully}
    restart: unless-stopped

  worker:                                  # runs the crawls
    <<: *app
    command: ["npm", "run", "worker:start"]
    depends_on:
      redis: {condition: service_healthy}
      migrate: {condition: service_completed_successfully}
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

```bash
docker compose up -d
```

Then open **http://localhost:3000** and register an account. The first user is a member;
promote from the admin UI or seed a demo admin with
`docker compose run --rm worker npm run prisma:seed` (`demo@krawlify.com` / `demo1234` —
don't leave that on anything reachable from outside your machine).

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required. |
| `REDIS_URL` | Redis, for the job queue and progress pub/sub. Required. |
| `NEXTAUTH_SECRET` | **Set this.** `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of the app |
| `CRAWL_DEFAULT_USER_AGENT` | Global fallback User-Agent |
| `CRAWL_MAX_REDIRECT_HOPS` | Cap on a redirect chain before giving up (default 10) |
| `WORKER_CONCURRENCY` | How many crawls the worker runs at once (default 3) |

No browser binaries ship in this image. The bot-protection bypass connects to a browser you
run separately, and its endpoint, token and proxy come from each crawl's own settings —
never from the environment — so a crawl always reproduces exactly as it ran.

## Ways in

- **Web UI** — multi-user, member/admin roles, dark mode.
- **REST API** — key-authenticated, with completion webhooks and a browser playground.
- **MCP server** at `POST /api/mcp` — Streamable HTTP, same API keys, seven tools for
  starting crawls and reading results.

Full documentation, configuration and the crawl engine's internals:
**https://github.com/kamenarov/krawlify-app**
