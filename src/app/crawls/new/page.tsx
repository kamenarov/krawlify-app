"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PRODUCT_RELAY_URL } from "@/lib/brand";

/** useSearchParams needs a Suspense boundary (it opts the tree out of prerendering). */
export default function NewCrawlPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-6 py-10 text-sm text-gray-500">Loading…</div>}>
      <NewCrawlForm />
    </Suspense>
  );
}

function NewCrawlForm() {
  const router = useRouter();
  // `?from=<crawlId>` — "Redo crawl": start from that crawl's saved settings.
  const redoFromId = useSearchParams().get("from");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redoLoaded, setRedoLoaded] = useState(false);
  const [form, setForm] = useState({
    seedUrl: "",
    maxDepth: 10,
    maxUrls: 10000,
    concurrency: 8,
    respectRobots: true,
    followNofollow: false,
    includeExternal: true,
    checkAssets: true,
    bypassBotProtection: false,
    browserConnection: "ws" as "ws" | "cdp",
    browserServer: "",
    browserAuth: "none" as "none" | "bearer",
    browserAuthToken: "",
    waitForBotCheck: false,
    useProxy: false,
    proxyServer: "",
    proxyUsername: "",
    proxyPassword: "",
    userAgent: "",
    webhookUrl: "",
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Turning the bypass on offers the hosted Krawlify relay, which is a CDP endpoint
   * authenticated by the token identifying the user's own browser. Only fills a blank
   * endpoint, so a redone crawl or anything already typed is left alone.
   */
  const onBypassToggle = (on: boolean) =>
    setForm((f) =>
      on && !f.browserServer
        ? {
            ...f,
            bypassBotProtection: true,
            browserConnection: "cdp",
            browserServer: PRODUCT_RELAY_URL,
            browserAuth: "bearer",
            useProxy: false, // no per-context proxy over CDP
          }
        : { ...f, bypassBotProtection: on },
    );

  const usingRelay = form.browserServer.startsWith(PRODUCT_RELAY_URL);

  // Pre-fill the User-Agent from the user's saved default (or the system default). Skipped
  // when redoing a crawl — that crawl's own UA is loaded below instead.
  useEffect(() => {
    if (redoFromId) return;
    void fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setForm((f) => ({ ...f, userAgent: d.defaultUserAgent || d.fallbackUserAgent || "" }));
      })
      .catch(() => {});
  }, [redoFromId]);

  // Redo: load the source crawl's config into the form so it can be revised before starting.
  // Only known keys are copied, and optional/number fields are normalised back to the
  // strings the inputs expect.
  useEffect(() => {
    if (!redoFromId) return;
    void fetch(`/api/crawls/${redoFromId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const c = d?.crawl?.config as Record<string, unknown> | undefined;
        if (!c) {
          setError("Could not load the settings from that crawl — using the defaults instead.");
          return;
        }
        const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
        setForm((f) => ({
          ...f,
          seedUrl: str(c.seedUrl) || f.seedUrl,
          maxDepth: Number(c.maxDepth ?? f.maxDepth),
          maxUrls: Number(c.maxUrls ?? f.maxUrls),
          concurrency: Number(c.concurrency ?? f.concurrency),
          respectRobots: Boolean(c.respectRobots ?? f.respectRobots),
          followNofollow: Boolean(c.followNofollow ?? f.followNofollow),
          includeExternal: Boolean(c.includeExternal ?? f.includeExternal),
          checkAssets: Boolean(c.checkAssets ?? f.checkAssets),
          bypassBotProtection: Boolean(c.bypassBotProtection ?? f.bypassBotProtection),
          browserConnection: (c.browserConnection === "cdp" ? "cdp" : "ws") as typeof f.browserConnection,
          browserServer: str(c.browserServer),
          browserAuth: (c.browserAuth === "bearer" ? "bearer" : "none") as typeof f.browserAuth,
          browserAuthToken: str(c.browserAuthToken),
          waitForBotCheck: Boolean(c.waitForBotCheck ?? f.waitForBotCheck),
          useProxy: Boolean(c.useProxy ?? f.useProxy),
          proxyServer: str(c.proxyServer),
          proxyUsername: str(c.proxyUsername),
          proxyPassword: str(c.proxyPassword),
          userAgent: str(c.userAgent) || f.userAgent,
          webhookUrl: str(c.webhookUrl),
        }));
        setRedoLoaded(true);
      })
      .catch(() => setError("Could not load the settings from that crawl — using the defaults instead."));
  }, [redoFromId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/crawls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to start crawl");
      return;
    }
    router.push(`/crawls/${data.id}/internal`);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to crawls
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mb-6 mt-3 text-2xl font-bold">{redoFromId ? "Redo crawl" : "New crawl"}</h1>
      <form onSubmit={onSubmit} className="space-y-6 rounded-lg border bg-white p-6 shadow-sm">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {redoFromId && !error && (
          <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {redoLoaded ? (
              <>
                Settings copied from{" "}
                <Link href={`/crawls/${redoFromId}/internal`} className="underline">
                  the previous crawl
                </Link>
                . Revise anything below, then start — the original report is left untouched.
              </>
            ) : (
              "Loading the previous crawl's settings…"
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium">Seed URL</label>
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={form.seedUrl}
            onChange={(e) => update("seedUrl", e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium">Max depth</label>
            <input
              type="number"
              min={0}
              max={50}
              value={form.maxDepth}
              onChange={(e) => update("maxDepth", Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Max URLs</label>
            <input
              type="number"
              min={1}
              max={500000}
              value={form.maxUrls}
              onChange={(e) => update("maxUrls", Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Concurrency</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.concurrency}
              onChange={(e) => update("concurrency", Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">User-Agent</label>
          <input
            type="text"
            value={form.userAgent}
            onChange={(e) => update("userAgent", e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            Webhook URL <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="url"
            placeholder="https://your-app.com/hooks/crawl-complete"
            value={form.webhookUrl}
            onChange={(e) => update("webhookUrl", e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            POSTed a JSON summary when the crawl finishes (done, stopped, or failed).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {([
            ["respectRobots", "Respect robots.txt"],
            ["followNofollow", "Follow nofollow links"],
            ["includeExternal", "Check external links"],
            ["checkAssets", "Check assets (images/JS/CSS)"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => update(key, e.target.checked as never)}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.bypassBotProtection}
              onChange={(e) => onBypassToggle(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Site uses Cloudflare / bot protection</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Drives the crawl through a remote browser — every page is fetched in the
                browser, one at a time. Slower, but works behind bot protection. The crawl
                starts immediately; handling any challenge is left to that browser.
              </span>
            </span>
          </label>
          {form.bypassBotProtection && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700">Connection type</label>
              <select
                value={form.browserConnection}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    browserConnection: e.target.value as typeof f.browserConnection,
                    // Per-context proxies don't exist over CDP — the remote browser's proxy
                    // is fixed when it launches.
                    useProxy: e.target.value === "cdp" ? false : f.useProxy,
                  }))
                }
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              >
                <option value="ws">Playwright server (WS) — ws://host:3001/, …/chromium/playwright</option>
                <option value="cdp">Chrome DevTools Protocol (CDP) — http://host:9222, wss://host?token=…</option>
              </select>

              <label className="mt-3 block text-xs font-medium text-gray-700">
                {form.browserConnection === "cdp" ? "CDP endpoint" : "Playwright server (WS endpoint)"}
              </label>
              <input
                type="text"
                required
                placeholder={
                  form.browserConnection === "cdp"
                    ? "http://cloakbrowser:9222  or  wss://host?token=…"
                    : "ws://playwright:3001/  or  wss://host/chromium/playwright?token=…"
                }
                value={form.browserServer}
                onChange={(e) => update("browserServer", e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-gray-500">
                {usingRelay ? (
                  <>
                    The hosted Krawlify relay. It drives <em>your own</em> Chrome, so the token
                    below is the one from your Krawlify extension&apos;s options page — the
                    extension has to be connected for the crawl to start. Replace this with your
                    own browser endpoint if you run one.
                  </>
                ) : form.browserConnection === "cdp" ? (
                  <>
                    Connection to an already-running Chrome exposing a DevTools endpoint — its{" "}
                    <code>http://</code> address, or the <code>wss://</code> URL a hosted provider gives
                    you. On a plain Chrome the bare <code>ws://host:9222/</code> root is not a WebSocket
                    URL; use <code>http://host:9222</code>. Note that some hosted browsers ignore the
                    User-Agent override over CDP and serve their own.
                  </>
                ) : (
                  <>
                    Connection to a Playwright browser server. Hosted providers expose this under a path
                    (e.g. <code>wss://host/chromium/playwright?token=…</code>) — pointing this at their
                    bare root URL is a CDP endpoint and will just time out.
                  </>
                )}
              </p>

              <label className="mt-3 block text-xs font-medium text-gray-700">Authentication</label>
              <select
                value={form.browserAuth}
                onChange={(e) => update("browserAuth", e.target.value as typeof form.browserAuth)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
              </select>
              {form.browserAuth === "bearer" && (
                <>
                  <input
                    type="password"
                    required
                    placeholder={
                      usingRelay
                        ? "Your Krawlify extension token"
                        : "Token (sent as: Authorization: Bearer …)"
                    }
                    value={form.browserAuthToken}
                    onChange={(e) => update("browserAuthToken", e.target.value)}
                    className="mt-2 w-full rounded border px-3 py-2 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Sent on the connection handshake, exactly as entered here.
                    {usingRelay &&
                      " On the relay a wrong token and a closed browser look the same" +
                        " (both answer 503), so check the extension popup says Connected."}
                  </p>
                </>
              )}

              <label className="mt-3 flex items-start gap-2 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.waitForBotCheck}
                  onChange={(e) => update("waitForBotCheck", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Wait 1 minute for the bot check
                  <span className="mt-0.5 block font-normal text-gray-500">
                    When a page comes back as an interstitial (&ldquo;Just a moment…&rdquo;,
                    &ldquo;Checking your browser…&rdquo;), give it up to 60 seconds to clear and
                    record the real page instead. That tab runs as a full browser — scripts,
                    cookies, images and fonts all load — so the check can pass the way it would
                    for a person. Once it clears, the rest of the crawl switches to plain HTTP
                    through the same session (same cookies, same IP, no rendering), which is far
                    faster. If a page challenges again the browser tab takes over for it. When
                    the minute runs out the page is recorded as served.
                  </span>
                </span>
              </label>

              {form.browserConnection === "cdp" ? (
                <p className="mt-3 text-xs text-gray-500">
                  Proxy options aren&apos;t available over CDP — the remote browser&apos;s proxy is
                  fixed when it launches, so configure it on that browser itself.
                </p>
              ) : (
                <label className="mt-3 flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.useProxy}
                    onChange={(e) => update("useProxy", e.target.checked)}
                  />
                  Use a proxy <span className="font-normal text-gray-400">(optional, residential/mobile recommended)</span>
                </label>
              )}
              {form.useProxy && (
                <div className="mt-2 rounded border border-gray-200 p-2">
                  <input
                    type="text"
                    required
                    placeholder="http://host:port  or  socks5://host:port"
                    value={form.proxyServer}
                    onChange={(e) => update("proxyServer", e.target.value)}
                    className="w-full rounded border px-3 py-2 font-mono text-xs"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Proxy username"
                      value={form.proxyUsername}
                      onChange={(e) => update("proxyUsername", e.target.value)}
                      className="rounded border px-3 py-2 text-xs"
                    />
                    <input
                      type="password"
                      placeholder="Proxy password"
                      value={form.proxyPassword}
                      onChange={(e) => update("proxyPassword", e.target.value)}
                      className="rounded border px-3 py-2 text-xs"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Datacenter IPs get flagged instantly — use a residential/mobile proxy in a region
                    that matches the browser&apos;s own locale and timezone. (The Playwright server
                    must be launched with a global proxy.)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          // Wait for the redo prefill so a half-populated form can't be submitted.
          disabled={loading || (!!redoFromId && !redoLoaded && !error)}
          className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Starting…" : "Start crawl"}
        </button>
      </form>
    </div>
  );
}
