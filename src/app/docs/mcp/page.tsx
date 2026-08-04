import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PRODUCT_NAME } from "@/lib/brand";
import { MCP_TOOLS } from "@/lib/mcp/tools";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@/lib/mcp/protocol";

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

/** The URL a client should point at — taken from this request so it matches the deploy. */
async function endpointUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/mcp`;
}

export default async function McpDocsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const url = await endpointUrl();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to crawls
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mb-1 mt-3 text-3xl font-bold">MCP Server</h1>
      <p className="mb-8 text-gray-500">
        {PRODUCT_NAME} speaks the{" "}
        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noreferrer noopener"
          className="text-blue-600 hover:underline"
        >
          Model Context Protocol
        </a>{" "}
        over HTTP, so an AI assistant can start crawls and read the findings itself. Point any
        MCP client at the endpoint below and authenticate with an API key.
      </p>

      {/* Endpoint + auth */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">Endpoint &amp; authentication</h2>
        <p className="mb-3 text-sm text-gray-600">
          One endpoint, Streamable HTTP transport, no session to manage. Every request carries the
          same API key the REST API uses — create one under{" "}
          <Link href="/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>
          . The key scopes the connection: a client only ever sees its owner&apos;s crawls.
        </p>
        <Block>{`POST ${url}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}</Block>
        <p className="mt-3 text-sm text-gray-600">
          <Code>X-API-Key: YOUR_API_KEY</Code> works too, if your client sets that header instead.
        </p>
      </section>

      {/* Claude Code */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">Connect from Claude Code</h2>
        <p className="mb-3 text-sm text-gray-600">
          One command. Add <Code>--scope project</Code> to share it with your team through{" "}
          <Code>.mcp.json</Code>, or leave it off to keep it to yourself.
        </p>
        <Block>{`claude mcp add --transport http ${PRODUCT_NAME.toLowerCase()} ${url} \\
  --header "Authorization: Bearer YOUR_API_KEY"

# check it connected
claude mcp list`}</Block>
        <p className="mt-3 text-sm text-gray-600">
          Then just ask: <em>&ldquo;Crawl example.com, 200 pages, and tell me which titles are
          duplicated.&rdquo;</em>
        </p>
        <p className="mt-3 text-sm text-gray-600">
          This repository also ships a Claude Code skill at{" "}
          <Code>.claude/skills/krawlify-audit</Code>, which teaches the assistant how to size a
          crawl, turn each issue count into the right query, and read the results without the
          usual misinterpretations. It loads automatically when you work in this project.
        </p>
      </section>

      {/* Config file */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">Connect from any other client</h2>
        <p className="mb-3 text-sm text-gray-600">
          Cursor, VS Code, Windsurf, Zed and the MCP Inspector all take the same shape of config —
          an HTTP server with a custom header. Drop this into the client&apos;s MCP settings file.
        </p>
        <Block>{`{
  "mcpServers": {
    "${PRODUCT_NAME.toLowerCase()}": {
      "type": "http",
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}</Block>
        <p className="mt-3 text-sm text-gray-600">
          Clients that cannot send a custom header need OAuth, which this server does not
          implement — use one that can, or call the{" "}
          <Link href="/docs/api" className="text-blue-600 hover:underline">
            REST API
          </Link>{" "}
          directly.
        </p>
      </section>

      {/* Tools */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Tools</h2>
        <p className="mb-3 text-sm text-gray-600">
          What the assistant can do once connected. Each one maps to the same service the REST API
          calls, so results are identical.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Arguments</th>
                <th className="px-3 py-2">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {MCP_TOOLS.map((t) => {
                const schema = t.inputSchema as {
                  properties?: Record<string, unknown>;
                  required?: string[];
                };
                const required = new Set(schema.required ?? []);
                const argNames = Object.keys(schema.properties ?? {});
                return (
                  <tr key={t.name} className="align-top">
                    <td className="px-3 py-2 font-mono text-[13px] whitespace-nowrap">
                      {t.name}
                      {t.annotations?.destructiveHint ? (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase text-red-700">
                          destructive
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-gray-600">
                      {argNames.length === 0
                        ? "—"
                        : argNames.map((a) => (required.has(a) ? `${a}*` : a)).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          * required. <Code>start_crawl</Code> also accepts every field from the{" "}
          <Link href="/docs/api" className="text-blue-600 hover:underline">
            crawl config reference
          </Link>
          , including the bot-protection and proxy settings.
        </p>
      </section>

      {/* Typical flow */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">How a session goes</h2>
        <p className="mb-3 text-sm text-gray-600">
          Crawls run in the background, so the assistant starts one, polls, then reads. A big site
          takes minutes; nothing is lost by waiting.
        </p>
        <Block>{`start_crawl        { "seedUrl": "https://example.com", "maxUrls": 200 }
                   → { "id": "clx…", "status": "queued" }

get_crawl          { "crawlId": "clx…" }
                   → status "running", 84/200 crawled … poll until "done"
                   → issues: [ { "category": "titles.duplicate", "count": 6 }, … ]

get_crawl_results  { "crawlId": "clx…", "tab": "titles", "filter": "duplicate" }
                   → the 6 pages behind that count, paginated (check "hasMore")`}</Block>
      </section>

      {/* Raw protocol */}
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-semibold">Checking it by hand</h2>
        <p className="mb-3 text-sm text-gray-600">
          Plain JSON-RPC 2.0, so <Code>curl</Code> is enough to prove the endpoint and your key are
          working before you wire up a client.
        </p>
        <Block>{`curl -s ${url} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"${LATEST_PROTOCOL_VERSION}",
        "capabilities":{},
        "clientInfo":{"name":"curl","version":"1.0"}}}'

# list the tools
curl -s ${url} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# call one
curl -s ${url} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
        "name":"list_crawls","arguments":{"limit":5}}}'`}</Block>
      </section>

      {/* Notes */}
      <section className="mb-4">
        <h2 className="mb-2 text-xl font-semibold">Good to know</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-600">
          <li>
            Protocol versions {SUPPORTED_PROTOCOL_VERSIONS.join(", ")} are supported; the server
            echoes back whichever one your client asks for.
          </li>
          <li>
            The server is stateless — no <Code>Mcp-Session-Id</Code> is issued, and a{" "}
            <Code>GET</Code> returns 405 because there is no server-initiated stream. Responses
            come back as JSON, or as SSE if your client accepts only <Code>text/event-stream</Code>.
          </li>
          <li>
            It offers tools only: no resources, no prompts. <Code>resources/list</Code> and{" "}
            <Code>prompts/list</Code> answer with empty lists so probing clients do not log errors.
          </li>
          <li>
            <Code>get_crawl_results</Code> returns at most 200 rows per call (25 by default) and
            omits empty fields, to keep responses inside a model&apos;s context. Page through with{" "}
            <Code>page</Code> while <Code>hasMore</Code> is true.
          </li>
          <li>
            Crawl configuration is never echoed back — it can hold browser and proxy credentials.
            Read it through the UI if you need it.
          </li>
          <li>
            <Code>delete_crawl</Code> is irreversible. It is flagged destructive so a well-behaved
            client asks you before running it; revoke the key in{" "}
            <Link href="/settings" className="text-blue-600 hover:underline">
              Settings
            </Link>{" "}
            if you would rather it were never available.
          </li>
        </ul>
      </section>
    </div>
  );
}
