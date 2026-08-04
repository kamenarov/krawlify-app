import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TAB_META } from "@/lib/tabMeta";
import { PRODUCT_RELAY_URL } from "@/lib/brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px]">{children}</code>;
}

function Block({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
      {children}
    </pre>
  );
}

function Method({ m }: { m: string }) {
  const color =
    m === "GET"
      ? "bg-blue-100 text-blue-700"
      : m === "POST"
        ? "bg-green-100 text-green-700"
        : m === "DELETE"
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-700";
  return <span className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${color}`}>{m}</span>;
}

const CONFIG_FIELDS: [string, string, string, string][] = [
  ["seedUrl", "string (URL)", "— required", "Where the crawl starts."],
  ["maxDepth", "int 0–50", "10", "Maximum link depth from the seed."],
  ["maxUrls", "int 1–500000", "10000", "Hard cap on URLs admitted to the crawl."],
  ["concurrency", "int 1–50", "8", "Parallel in-flight requests."],
  ["respectRobots", "boolean", "true", "Honour robots.txt."],
  ["followNofollow", "boolean", "false", "Follow rel=\"nofollow\" links."],
  ["includeExternal", "boolean", "true", "Check external (off-domain) links' status."],
  ["checkAssets", "boolean", "true", "Fetch images/JS/CSS to find broken assets."],
  ["bypassBotProtection", "boolean", "false", "Drive the crawl through a remote browser for Cloudflare/bot-protected sites (whole crawl runs in the browser, one page at a time). Crawling starts immediately — no challenge-clearing wait unless waitForBotCheck is set."],
  ["browserConnection", "ws | cdp", "ws", "How to reach that browser: \"ws\" = Playwright browser server (chromium.connect), \"cdp\" = Chrome DevTools endpoint (chromium.connectOverCDP)."],
  ["browserServer", "string (URL)", "— required with bypassBotProtection", `Endpoint to connect to when bypassBotProtection is on — ws://host:3001/ for "ws", http://host:9222 for "cdp". The hosted Krawlify relay is ${PRODUCT_RELAY_URL} with "cdp" + "bearer", where the token is your Krawlify extension's (it drives your own browser). Taken from this field only; there is no environment fallback.`],
  ["browserAuth", "none | bearer", "none", "Auth for the browser connection handshake. \"bearer\" sends Authorization: Bearer <browserAuthToken>; \"none\" sends no auth header (for endpoints that authenticate via a ?token= query param)."],
  ["browserAuthToken", "string", "— required with browserAuth: bearer", "Token used when browserAuth is \"bearer\". Sent exactly as given; there is no environment fallback."],
  ["waitForBotCheck", "boolean", "false", "When a page comes back as a bot-check interstitial (\"Just a moment…\"), wait up to 60s for it to clear and record what it becomes. That tab runs at full fidelity (scripts, cookies, images, fonts) so the check can pass; once cleared, remaining pages are fetched over plain HTTP through the same session instead of being rendered, which is much faster. A page that challenges again falls back to the tab. Bypass mode only."],
  ["useProxy", "boolean", "false", "Enable the per-context proxy (optional, \"ws\" connections only — a CDP browser's proxy is fixed at its own launch). When false no proxy is used even if proxyServer is set."],
  ["proxyServer", "string", "— required with useProxy", "Per-context proxy (residential/mobile recommended), e.g. http://host:port or socks5://host:port. Requires the Playwright server launched with a global proxy. No environment fallback."],
  ["proxyUsername", "string", "— optional", "Proxy username."],
  ["proxyPassword", "string", "— optional", "Proxy password."],
  ["userAgent", "string", "user/global default", "Overrides the User-Agent for this crawl."],
  ["requestTimeoutMs", "int 1000–120000", "15000", "Per-request timeout."],
  ["politenessDelayMs", "int 0–10000", "0", "Delay before each request."],
  ["webhookUrl", "string (URL)", "— optional", "POSTed a JSON summary when the crawl reaches a terminal state."],
];

export default async function ApiDocsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to crawls
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mb-1 mt-3 text-3xl font-bold">API Documentation</h1>
      <p className="mb-8 text-gray-500">
        Programmatic access to crawls and their results. Authenticate with an API key created
        under <Link href="/settings" className="text-blue-600 hover:underline">Settings</Link>. Try
        any endpoint live in the{" "}
        <Link href="/playground" className="text-blue-600 hover:underline">API Playground</Link>. To
        let an AI assistant drive these endpoints itself, connect the{" "}
        <Link href="/docs/mcp" className="text-blue-600 hover:underline">MCP server</Link>.
      </p>

      {/* Auth */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">Authentication</h2>
        <p className="mb-3 text-sm text-gray-600">
          Every <Code>/api/v1</Code> request must carry an API key, sent as either header. Requests
          are scoped to the key&apos;s owner (admins may read/delete any crawl).
        </p>
        <Block>{`Authorization: Bearer YOUR_API_KEY
# or
X-API-Key: YOUR_API_KEY`}</Block>
      </section>

      {/* Endpoints */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Endpoints</h2>
        <div className="space-y-6">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Method m="POST" /> <Code>/api/v1/crawls</Code>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              Create and queue a crawl. Body is the crawl config (see reference below). Returns the
              new crawl id and a status URL.
            </p>
            <Block>{`curl -X POST http://localhost:3000/api/v1/crawls \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "seedUrl": "https://example.com",
    "maxUrls": 500,
    "maxDepth": 5,
    "webhookUrl": "https://your-app.com/hooks/crawl"
  }'

# → 201
{ "id": "clx…", "status": "queued", "statusUrl": "http://localhost:3000/api/v1/crawls/clx…" }`}</Block>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <Method m="GET" /> <Code>/api/v1/crawls/:id</Code>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              Fetch crawl status, counters, and the issue summary. Poll this until{" "}
              <Code>status</Code> is <Code>done</Code>, <Code>failed</Code>, or <Code>stopped</Code>.
            </p>
            <Block>{`curl http://localhost:3000/api/v1/crawls/CRAWL_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"

# → 200
{
  "crawl": {
    "id": "clx…", "seedUrl": "https://example.com", "status": "done",
    "totalFound": 480, "totalCrawled": 480,
    "byStatusClass": { "2": 470, "3": 6, "4": 4 },
    "startedAt": "…", "finishedAt": "…", "error": null
  },
  "issues": [ { "category": "titles.duplicate", "severity": "warning", "count": 3 } ]
}`}</Block>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <Method m="GET" /> <Code>/api/v1/crawls/:id/results</Code>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              Paginated, filtered result rows for any tab. Query params:{" "}
              <Code>tab</Code>, <Code>filter</Code>, <Code>search</Code>, <Code>page</Code>,{" "}
              <Code>pageSize</Code> (max 1000), <Code>sortBy</Code>, <Code>sortDir</Code> (asc|desc).
            </p>
            <Block>{`curl "http://localhost:3000/api/v1/crawls/CRAWL_ID/results?tab=links&filter=nofollow&page=1&pageSize=100" \\
  -H "Authorization: Bearer YOUR_API_KEY"

# → 200
{ "rows": [ … ], "total": 1234, "source": "link" }`}</Block>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <Method m="DELETE" /> <Code>/api/v1/crawls/:id</Code>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              Permanently delete a crawl and all its data (pages, links, assets, redirects, issues).
            </p>
            <Block>{`curl -X DELETE http://localhost:3000/api/v1/crawls/CRAWL_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"
# → 200  { "ok": true }`}</Block>
          </div>
        </div>
      </section>

      {/* Config reference */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Crawl config reference</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Default</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {CONFIG_FIELDS.map(([field, type, def, desc]) => (
                <tr key={field} className="align-top">
                  <td className="px-3 py-2 font-mono text-[13px]">{field}</td>
                  <td className="px-3 py-2 text-gray-600">{type}</td>
                  <td className="px-3 py-2 text-gray-600">{def}</td>
                  <td className="px-3 py-2 text-gray-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabs reference */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Tabs &amp; filters</h2>
        <p className="mb-3 text-sm text-gray-600">
          Valid <Code>tab</Code> values for the results endpoint and the <Code>filter</Code> presets
          each supports.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">tab</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">filter values</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {TAB_META.map((t) => (
                <tr key={t.key} className="align-top">
                  <td className="px-3 py-2 font-mono text-[13px]">{t.key}</td>
                  <td className="px-3 py-2 text-gray-600">{t.label}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-gray-600">
                    {t.filters.map((f) => f.key).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Webhook */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">Completion webhook</h2>
        <p className="mb-3 text-sm text-gray-600">
          If <Code>webhookUrl</Code> is set, the worker POSTs this payload once when the crawl
          reaches a terminal state (10s timeout, header <Code>X-Krawlify-Event: crawl.completed</Code>).
          Delivery is best-effort and never fails the crawl.
        </p>
        <Block>{`POST {your webhookUrl}
X-Krawlify-Event: crawl.completed
Content-Type: application/json

{
  "event": "crawl.completed",
  "crawl": {
    "id": "clx…", "seedUrl": "https://example.com", "status": "done",
    "totalFound": 480, "totalCrawled": 480,
    "byStatusClass": { "2": 470, "4": 10 },
    "startedAt": "…", "finishedAt": "…", "error": null
  },
  "issues": [ { "category": "images.altMissing", "severity": "warning", "count": 12 } ]
}`}</Block>
      </section>

      {/* Key management */}
      <section className="mb-4">
        <h2 className="mb-2 text-xl font-semibold">Managing keys</h2>
        <p className="text-sm text-gray-600">
          Create, list, and revoke keys in{" "}
          <Link href="/settings" className="text-blue-600 hover:underline">Settings</Link>. A key&apos;s
          secret is shown once at creation. The same operations are available to the UI via{" "}
          <Code>GET/POST /api/keys</Code> and <Code>DELETE /api/keys/:id</Code> (session-authenticated).
        </p>
      </section>
    </div>
  );
}
