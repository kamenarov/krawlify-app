# Tabs, filters and row shapes

Every `get_crawl_results` call names one `tab` and one `filter`. This is the full matrix —
slightly wider than what `list_result_tabs` advertises, because that reflects the UI's
filter menu and a couple of working filters are not on it (`broken-assets/other`).

Empty fields are stripped from rows before they reach you, so a field being absent means
"not set on this page", not "not collected".

## Tabs

| tab | What it holds | filters |
|---|---|---|
| `internal` | Pages on the crawled host | `all`, `2xx`, `3xx`, `4xx`, `5xx`, `noresponse` |
| `external` | Off-domain URLs that were status-checked | `all`, `2xx`, `3xx`, `4xx`, `5xx`, `noresponse` |
| `response-codes` | Every page, internal and external | `all`, `2xx`, `3xx`, `4xx`, `5xx`, `noresponse` |
| `titles` | Internal pages, title-focused | `all`, `missing`, `duplicate`, `over` (>60 chars), `under` (<30), `multiple` |
| `meta` | Internal pages, meta-description-focused | `all`, `missing`, `duplicate`, `over` (>160), `under` (<70), `multiple` |
| `headings` | Internal pages, H1–H6 | `all`, `h1Missing`, `h1Duplicate`, `h1Multiple` |
| `directives` | Canonical / robots directives | `all`, `canonicalMismatch`, `noindex`, `canonicalised` |
| `images` | Every `<img>` found | `all`, `altMissing`, `altOver` (>100 chars), `broken` |
| `broken-assets` | Assets that failed to load | `all`, `img`, `script`, `stylesheet`, `api`, `other` |
| `links` | Every `<a href>` found | `all`, `follow`, `nofollow`, `blank`, `internal`, `external` |
| `redirects` | Redirect hops with their chains | `all` |
| `sitemaps` | Pages discovered via sitemap.xml | `all`, `orphan` |
| `dates` | Published / modified dates | `all`, `hasPublished`, `hasModified`, `hasSitemapDate`, `noDates` |

Duplicate filters (`titles/duplicate`, `meta/duplicate`, `headings/h1Duplicate`) are
resolved at query time by grouping on a content hash, so they stay correct as a crawl
grows. They return every member of each duplicate group, not one representative.

`sitemaps/orphan` means "in the sitemap but nothing links to it" — a real finding.
`directives/canonicalised` means "canonical points elsewhere", which is usually
intentional; do not report it as a problem without checking the target.

## Row shapes

`source` in the response tells you which of these you got.

**`page`** — `internal`, `external`, `response-codes`, `titles`, `meta`, `headings`,
`directives`, `sitemaps`, `dates`

`url`, `depth`, `isInternal`, `statusCode`, `statusClass`, `contentType`,
`responseTimeMs`, `sizeBytes`, `indexability` (`indexable` | `noindex` |
`canonicalised` | `non-indexable`) + `indexabilityReason`, `title` + `titleLength` +
`titlePixelWidth` + `titleCount`, `metaDescription` + `metaDescLength` +
`metaDescPixelWidth`, `h1`…`h6` (arrays) + their counts, `canonicalUrl` +
`canonicalMismatch`, `metaRobots`, `xRobotsTag`, `datePublished`, `dateModified`,
`sitemapLastmod`, `wordCount`, `inlinkCount`, `isOrphan`, `foundViaSitemap`,
`titleIssues` / `metaIssues` / `h1Issues` (arrays of the issue keys that fired).

**`link`** — `links`

`sourceUrl`, `targetUrl`, `anchorText`, `rel`, `target`, `nofollow`, `isBlank`,
`isInternal`. One row per anchor, so a nav link repeated across 500 pages is 500 rows —
aggregate before quoting counts.

**`asset`** — `images`, `broken-assets`

`url`, `type` (`img` | `script` | `stylesheet` | `api` | `other`), `referrerUrl`,
`statusCode`, `statusClass`, `sizeBytes`, `isBroken`, `altText`, `altLength`,
`altIssues`.

**`redirect`** — `redirects`

`sourceUrl`, `statusCode`, `targetUrl`, `chainPosition`, `finalUrl`, `finalStatus`,
`hops`. `hops > 1` is a redirect chain worth flagging; `finalStatus` in the 4xx/5xx range
is a redirect to nowhere.

## Sorting

`sortBy` takes any field name from the row shape above; it defaults to the tab's natural
column (`url` for pages, `sourceUrl` for links and redirects). `sortDir` is `asc` or
`desc`. Sorting `internal` by `inlinkCount desc` is a quick way to find the pages the
site itself considers important; by `responseTimeMs desc`, the slow ones.
