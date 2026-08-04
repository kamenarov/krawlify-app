# Contributing to Krawlify

Thanks for taking the time. This document covers how to get the project running, what the
code expects of a change, and how to get a pull request merged.

## Getting set up

```bash
docker compose up -d postgres redis   # infrastructure only
cp .env.example .env                  # set NEXTAUTH_SECRET
npm install
npx prisma migrate dev
npm run prisma:seed                   # demo@krawlify.com / demo1234
```

Then two terminals:

```bash
npm run dev       # Next.js on http://localhost:3000
npm run worker    # crawl worker
```

Node 20+ (see `.nvmrc`). Nothing else is needed unless you are working on the
bot-protection path, which connects to a browser you run separately — see the README.

## Before you open a pull request

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

Both run in CI on every PR, along with a production build and a Docker image build.

## What a good change looks like

**Test the logic, not the plumbing.** The test suite covers pure functions — the SEO
analyzers, URL normalisation, sitemap and JSON-LD parsing, config validation, bot-check
detection, the MCP dispatcher. If your change adds a rule, a filter preset, or a parsing
branch, it should come with a case. If it wires existing pieces together, it probably does
not need one.

**Match the surrounding code.** Comments in this codebase explain *why*, not *what* — they
carry the reason a thing is done the strange way it is done. Keep that habit; a comment
restating the line below it is noise, and a missing one costs the next reader an hour.

**Keep the front doors in sync.** The UI, the REST API and the MCP server all go through
the same service functions in `src/lib/` on purpose. A new capability belongs in the
service, not in one route handler — otherwise the three interfaces drift and the drift is
invisible until someone reports it as a bug.

**Crawl config is validated in one place.** `crawlConfigSchema` in `src/lib/events.ts` is
the single definition of what a valid crawl is, including the cross-field rules. Add fields
there and both API surfaces pick them up.

**Never add an environment fallback for bot-protection settings.** The remote-browser
endpoint, its token and any proxy come from the crawl's own fields and nowhere else. This is
deliberate: a crawl is stored with exactly what it ran with, so *Redo crawl* reproduces it
and editing a `.env` can never silently change how an existing crawl behaves.

**Watch what leaves the process.** The crawl `config` holds `browserAuthToken` and
`proxyPassword` in plaintext. It is deliberately excluded from every MCP response. If you
add an endpoint that returns crawl records, exclude it there too.

## Theming

Dark mode is class-based and driven by a palette remap in `globals.css`, not by `dark:`
variants scattered across components. Stay on the standard Tailwind utilities and both
themes come for free. If you genuinely need explicit dark styling, note that `dark:*`
variants are *not* remapped — they emit Tailwind's literal colours — so use arbitrary
values, e.g. `dark:bg-[#272438]`. Check both themes before pushing.

## Database changes

Schema changes need a migration:

```bash
npx prisma migrate dev --name what_changed
```

Commit the generated migration directory. The `migrate` service applies migrations on
startup, so a PR without one will break `docker compose up` for everyone else.

## Commit messages and PRs

No strict format. A subject line that says what changed and a body that says why is enough.
Keep a PR to one concern — a bug fix and a refactor in the same diff are hard to review and
harder to revert.

Fill in the PR template honestly, particularly the verification section. "I could not test
this against a real Cloudflare site" is useful information; silence on the point is not.

## Reporting bugs

Use the issue template. For crawl bugs, the seed URL and the crawl settings are worth more
than a description of the symptom — most of them reproduce or vanish based on the target
site. Redact tokens from any logs you paste; they show up in connection errors.

Security issues do not go in the issue tracker — see [SECURITY.md](SECURITY.md).

## Licensing of contributions

By submitting a pull request you agree that your contribution is licensed under the
[MIT License](LICENSE), the same terms as the rest of the project. There is no CLA.
