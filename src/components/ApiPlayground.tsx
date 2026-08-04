"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TAB_META } from "@/lib/tabMeta";
import { ThemeToggle } from "./ThemeToggle";

type Op = "create" | "status" | "results" | "delete";

const OPS: { key: Op; method: "GET" | "POST" | "DELETE"; path: string; label: string; blurb: string }[] = [
  {
    key: "create",
    method: "POST",
    path: "/api/v1/crawls",
    label: "Create crawl",
    blurb: "Queues a crawl from a JSON config. Returns the new crawl id and a status URL.",
  },
  {
    key: "status",
    method: "GET",
    path: "/api/v1/crawls/:id",
    label: "Crawl status",
    blurb: "Counters, per-status-class totals and the issue summary. Poll until status is terminal.",
  },
  {
    key: "results",
    method: "GET",
    path: "/api/v1/crawls/:id/results",
    label: "Crawl results",
    blurb: "Paginated, filtered rows for any tab of the crawl dashboard.",
  },
  {
    key: "delete",
    method: "DELETE",
    path: "/api/v1/crawls/:id",
    label: "Delete crawl",
    blurb: "Permanently deletes the crawl and every row belonging to it.",
  },
];

const DEFAULT_BODY = `{
  "seedUrl": "https://example.com",
  "maxUrls": 50,
  "maxDepth": 3,
  "concurrency": 4
}`;

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-green-100 text-green-700",
  DELETE: "bg-red-100 text-red-700",
};

interface CrawlOption {
  id: string;
  seedUrl: string;
  status: string;
}

interface ApiResponse {
  status: number;
  statusText: string;
  ms: number;
  bytes: number;
  body: string;
  isJson: boolean;
}

export function ApiPlayground() {
  const [op, setOp] = useState<Op>("create");
  const [apiKey, setApiKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [crawlId, setCrawlId] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [tab, setTab] = useState("internal");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [crawls, setCrawls] = useState<CrawlOption[]>([]);
  const [origin, setOrigin] = useState("");
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const current = OPS.find((o) => o.key === op)!;
  const needsId = op !== "create";

  // window.location is only available after mount (keeps SSR markup stable).
  useEffect(() => setOrigin(window.location.origin), []);

  // The user's own crawls, for the id picker. Session-authenticated, so no key needed.
  useEffect(() => {
    void fetch("/api/crawls")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCrawls(d?.crawls ?? []))
      .catch(() => {});
  }, []);

  // Keep the filter valid when the tab changes.
  const tabMeta = TAB_META.find((t) => t.key === tab) ?? TAB_META[0];
  useEffect(() => {
    if (!tabMeta.filters.some((f) => f.key === filter)) setFilter(tabMeta.filters[0]?.key ?? "all");
  }, [tabMeta, filter]);

  const queryString = useMemo(() => {
    if (op !== "results") return "";
    const q = new URLSearchParams();
    q.set("tab", tab);
    if (filter && filter !== "all") q.set("filter", filter);
    if (search.trim()) q.set("search", search.trim());
    if (page !== 1) q.set("page", String(page));
    if (pageSize !== 100) q.set("pageSize", String(pageSize));
    if (sortBy.trim()) {
      q.set("sortBy", sortBy.trim());
      q.set("sortDir", sortDir);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [op, tab, filter, search, page, pageSize, sortBy, sortDir]);

  const path =
    current.path.replace(":id", crawlId.trim() || "CRAWL_ID") + (op === "results" ? queryString : "");

  const bodyError = useMemo(() => {
    if (op !== "create") return null;
    try {
      JSON.parse(body);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [op, body]);

  const keyForDisplay = revealKey ? apiKey || "YOUR_API_KEY" : apiKey ? "••••••••••••" : "YOUR_API_KEY";

  const curl = useMemo(() => {
    const url = `${origin}${path}`;
    const lines = [
      current.method === "GET" ? `curl "${url}"` : `curl -X ${current.method} "${url}"`,
      `  -H "Authorization: Bearer ${keyForDisplay}"`,
    ];
    if (op === "create") {
      lines.push(`  -H "Content-Type: application/json"`);
      lines.push(`  -d '${body.replace(/\n\s*/g, " ")}'`);
    }
    return lines.join(" \\\n");
  }, [origin, path, current.method, keyForDisplay, op, body]);

  const canSend =
    !!apiKey.trim() &&
    (!needsId || !!crawlId.trim()) &&
    !bodyError &&
    (op !== "delete" || confirmDelete) &&
    !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setRes(null);
    const started = performance.now();
    try {
      const r = await fetch(path, {
        method: current.method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          ...(op === "create" ? { "Content-Type": "application/json" } : {}),
        },
        ...(op === "create" ? { body } : {}),
      });
      const text = await r.text();
      let pretty = text;
      let isJson = false;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
        isJson = true;
      } catch {
        /* leave as-is — error pages may be HTML */
      }
      setRes({
        status: r.status,
        statusText: r.statusText,
        ms: Math.round(performance.now() - started),
        bytes: new Blob([text]).size,
        body: pretty,
        isJson,
      });
      if (op === "delete") setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSending(false);
    }
  }

  async function copy(what: string, text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
  }

  const statusColor = !res
    ? ""
    : res.status < 300
      ? "bg-green-100 text-green-700"
      : res.status < 400
        ? "bg-blue-100 text-blue-700"
        : res.status < 500
          ? "bg-orange-100 text-orange-700"
          : "bg-red-100 text-red-700";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to crawls
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mb-1 mt-3 text-3xl font-bold">API Playground</h1>
      <p className="mb-8 text-gray-500">
        Send real requests to the <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px]">/api/v1</code>{" "}
        endpoints with your own API key and read the responses here. See the{" "}
        <Link href="/docs/api" className="text-blue-600 hover:underline">
          API documentation
        </Link>{" "}
        for the full reference.
      </p>

      {/* Endpoint picker */}
      <section className="mb-6 grid gap-2 sm:grid-cols-2">
        {OPS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              setOp(o.key);
              setRes(null);
              setError(null);
            }}
            className={`rounded-lg border p-3 text-left transition-colors ${
              op === o.key ? "border-blue-600 bg-blue-50" : "bg-white hover:bg-gray-50"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_STYLE[o.method]}`}
              >
                {o.method}
              </span>
              <code className="font-mono text-xs">{o.path}</code>
            </div>
            <div className="text-sm font-medium">{o.label}</div>
            <p className="text-xs text-gray-500">{o.blurb}</p>
          </button>
        ))}
      </section>

      {/* Auth */}
      <section className="mb-6 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">API key</h2>
        <p className="mb-3 text-sm text-gray-500">
          Sent as <code className="font-mono">Authorization: Bearer …</code>. Held in this page only —
          never stored or logged. Create one under{" "}
          <Link href="/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <input
            type={revealKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk_live_…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 rounded border px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setRevealKey((v) => !v)}
            className="rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            {revealKey ? "Hide" : "Show"}
          </button>
        </div>
      </section>

      {/* Parameters */}
      <section className="mb-6 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Request</h2>

        {needsId && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">Crawl id</label>
            <input
              list="playground-crawls"
              value={crawlId}
              onChange={(e) => setCrawlId(e.target.value)}
              placeholder="clx…"
              className="w-full rounded border px-3 py-2 font-mono text-xs"
            />
            <datalist id="playground-crawls">
              {crawls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.seedUrl} ({c.status})
                </option>
              ))}
            </datalist>
            <p className="mt-1 text-xs text-gray-400">
              {crawls.length > 0
                ? "Start typing or open the list to pick one of your crawls."
                : "No crawls of your own to pick from yet."}
            </p>
          </div>
        )}

        {op === "results" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">tab</label>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                {TAB_META.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key} — {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">filter</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                {tabMeta.filters.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.key} — {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="substring of the URL"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">page</label>
                <input
                  type="number"
                  min={1}
                  value={page}
                  onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">pageSize</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={pageSize}
                  onChange={(e) =>
                    setPageSize(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-full rounded border px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">sortBy</label>
              <input
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                placeholder="column key (blank = default)"
                className="w-full rounded border px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">sortDir</label>
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                <option value="asc">asc</option>
                <option value="desc">desc</option>
              </select>
            </div>
          </div>
        )}

        {op === "create" && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium">JSON body</label>
              <button
                type="button"
                onClick={() => setBody(DEFAULT_BODY)}
                className="text-xs text-blue-600 hover:underline"
              >
                Reset to template
              </button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              rows={12}
              className="w-full rounded border px-3 py-2 font-mono text-xs"
            />
            {bodyError ? (
              <p className="mt-1 text-xs text-red-600">Invalid JSON — {bodyError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">
                Any field from the{" "}
                <Link href="/docs/api" className="text-blue-600 hover:underline">
                  config reference
                </Link>
                . Only <code className="font-mono">seedUrl</code> is required.
              </p>
            )}
          </div>
        )}

        {op === "delete" && (
          <label className="mt-2 flex items-start gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-red-700">
              I understand this permanently deletes the crawl and all of its pages, links, assets,
              redirects and issues. This cannot be undone.
            </span>
          </label>
        )}
      </section>

      {/* Preview + send */}
      <section className="mb-6 rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_STYLE[current.method]}`}>
            {current.method}
          </span>
          <code className="break-all font-mono text-xs text-gray-600">
            {origin}
            {path}
          </code>
        </div>

        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-400">curl</span>
            <button
              type="button"
              onClick={() => copy("curl", curl)}
              className="text-xs text-blue-600 hover:underline"
            >
              {copied === "curl" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
            {curl}
          </pre>
          {!revealKey && apiKey && (
            <p className="mt-1 text-xs text-gray-400">
              The key is masked in the snippet — use “Show” above to copy a runnable command.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              op === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {sending ? "Sending…" : `Send ${current.method}`}
          </button>
          {!apiKey.trim() && <span className="text-xs text-gray-500">Enter an API key to send.</span>}
          {apiKey.trim() && needsId && !crawlId.trim() && (
            <span className="text-xs text-gray-500">Enter a crawl id to send.</span>
          )}
          {apiKey.trim() && op === "delete" && !confirmDelete && (
            <span className="text-xs text-gray-500">Tick the confirmation to enable deletion.</span>
          )}
        </div>
      </section>

      {/* Response */}
      {(res || error) && (
        <section className="mb-6 rounded-lg border bg-white p-6 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Response</h2>
            {res && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`rounded px-2 py-0.5 font-mono font-semibold ${statusColor}`}>
                  {res.status} {res.statusText}
                </span>
                <span className="tabular">{res.ms} ms</span>
                <span className="tabular">{res.bytes.toLocaleString()} B</span>
                <button
                  type="button"
                  onClick={() => copy("body", res.body)}
                  className="text-blue-600 hover:underline"
                >
                  {copied === "body" ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {res && (
            <pre className="max-h-[28rem] overflow-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
              {res.body || "(empty body)"}
            </pre>
          )}
          {res && !res.isJson && (
            <p className="mt-1 text-xs text-gray-400">Response was not JSON — shown verbatim.</p>
          )}
        </section>
      )}
    </div>
  );
}
