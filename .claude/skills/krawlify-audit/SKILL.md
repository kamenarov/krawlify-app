---
name: krawlify-audit
description: Run an SEO crawl and audit a website through the Krawlify MCP server. Use when asked to crawl a site, audit its SEO, or find broken links, missing or duplicate titles and meta descriptions, missing H1s, missing image alt text, broken images or assets, redirect chains, canonical or noindex problems, or orphan pages — and when asked to check on, compare, or clean up an existing Krawlify crawl.
---

# Auditing a site with Krawlify

Krawlify crawls a site and stores what it finds as rows you query per topic. The MCP
server exposes that as seven tools. This skill is about using them well — the tool
descriptions cover the mechanics, this covers the judgement.

## Before anything else

Check the server is connected: `claude mcp list` should show `krawlify`, and the
`mcp__krawlify__*` tools should be available. If they are not, the user needs to add it
with an API key from the app's Settings page:

```
claude mcp add --transport http krawlify http://localhost:3000/api/mcp \
  --header "Authorization: Bearer <their key>"
```

Do not mint keys or edit the database to work around a missing connection — ask.

## The loop

1. **`start_crawl`** with `seedUrl`. Pick `maxUrls` deliberately (see below). It returns
   immediately with an id; the crawl runs in a background worker.
2. **`get_crawl`** to poll. Re-poll while `status` is `queued` or `running`. A hundred
   pages takes well under a minute; thousands take several. Polling costs nothing, so
   wait rather than reporting a half-finished crawl.
3. **`get_crawl_results`** once `status` is `done`, to pull the pages behind each issue.

### Choosing maxUrls

The default is 10,000 — almost never what you want for a question. Size it to the ask:

| Ask | maxUrls |
|---|---|
| "is this page/site set up right", a quick look | 50–200 |
| "audit my site", a normal site | 500–2000 |
| "full audit", "every page", a large site | leave at the default |

Too small silently truncates the crawl (see the trap below); too large wastes minutes.
When unsure, ask the user how big the site is rather than guessing high.

## Reading the results

`get_crawl` returns `issues`: a count per category. Each category maps to exactly one
`get_crawl_results` call — that is how you turn a count into a list of URLs:

| Issue category | tab | filter |
|---|---|---|
| `responseCodes.clientError` | `response-codes` | `4xx` |
| `responseCodes.serverError` | `response-codes` | `5xx` |
| `responseCodes.noResponse` | `response-codes` | `noresponse` |
| `titles.missing` / `.duplicate` / `.over` / `.under` / `.multiple` | `titles` | `missing` / `duplicate` / `over` / `under` / `multiple` |
| `meta.missing` / `.duplicate` / `.over` / `.under` | `meta` | same names |
| `headings.h1Missing` / `.h1Duplicate` / `.h1Multiple` | `headings` | `h1Missing` / `h1Duplicate` / `h1Multiple` |
| `directives.canonicalMismatch` / `.noindex` | `directives` | `canonicalMismatch` / `noindex` |
| `images.altMissing` / `.altOver` / `.broken` | `images` | `altMissing` / `altOver` / `broken` |
| `resources.broken` | `broken-assets` | `all` |
| `pages.orphan` | `sitemaps` | `orphan` |

For anything not driven by an issue count — link structure, redirect chains, publication
dates — read `references/tabs-and-filters.md` for the full tab list, the filters each one
takes, and what fields the rows carry.

## Traps

**`totalFound == maxUrls` means the crawl was truncated**, not that the site has that
many pages. The counter reports URLs admitted to the crawl, and admission stops at the
cap. A crawl reporting `12/12` on a site with thousands of pages found 12 because you
asked for 12. Say so plainly — "crawled 12 pages (the limit you set); the site is
larger" — rather than presenting the findings as sitewide.

**Check `hasMore` before concluding a list is complete.** Results are paginated at 25 rows
by default, 200 max. Page through with `page` while `hasMore` is true. Do not report "the
3 pages missing titles" off page 1 of 8.

**A wall of `noResponse` pages is infrastructure, not SEO.** If most of a crawl came back
with no response, the crawl broke — the site rate-limited it, or the remote browser died.
Report it as a failed crawl and suggest re-running, rather than as 900 broken pages.

**Bot-protected sites need `bypassBotProtection`** plus a `browserServer` endpoint, and
those settings come from the user — `start_crawl` has no default to fall back on. Without
them a protected site returns one 403 interstitial and stops. If a crawl comes back as a
single 403 page with no title, that is what happened. The usual answer is the hosted relay,
`https://alpha.krawlify.com` with `browserConnection: "cdp"` and `browserAuth: "bearer"`,
but its token is the one from *their* Krawlify browser extension — ask for it, never guess,
and their Chrome has to be open and connected or the relay answers 503.

**Counts are per-page, not per-instance.** `images.altMissing: 35` means 35 images across
the crawl, but the `images` tab returns one row per image — reconcile before quoting a
number back.

## Reporting

Lead with what to fix, not with what the crawler did. Group by severity: broken pages and
5xx first, then indexability (noindex, canonical mismatches), then content (titles, meta,
H1s), then assets. Give real URLs, not just counts — the user cannot act on "6 duplicate
titles". State the crawl's scope (pages crawled, whether it hit the cap) once, up front,
so the numbers are not read as sitewide when they are not.

## Destructive tools

`stop_crawl` is safe — partial results are kept. `delete_crawl` is irreversible and wipes
every row for that crawl. Do not call it to tidy up after yourself; ask first, always.
