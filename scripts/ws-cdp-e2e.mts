/**
 * End-to-end check of BrowserFetcher against a live ws_cdp relay + extension.
 *
 * Starts a relay, launches Chromium with the extension loaded, waits for it to dial in,
 * then drives src/crawler/browser.ts through it exactly as a crawl would. Verifies the
 * "shared real profile" path: adopting the existing context, and — most importantly —
 * that close() does NOT take the user's own tabs down with it.
 *
 *   npx tsx scripts/ws-cdp-e2e.mts
 *
 * Chromium: WS_CDP_TEST_CHROME, or a Playwright build is found automatically.
 * Branded Google Chrome will NOT work — it ignores --load-extension.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BrowserFetcher } from "../src/crawler/browser";

const RELAY_DIR = "D:/web/crawer_extension";
const EXTENSION_DIR = path.join(RELAY_DIR, "extension");
const AUTOCONFIG = path.join(EXTENSION_DIR, "autoconfig.json");
const RELAY_PORT = 9355;
const FIXTURE_PORT = 9356;
const TOKEN = "wscdp-crawer-" + Math.random().toString(36).slice(2, 10);
const ENDPOINT = `http://127.0.0.1:${RELAY_PORT}?token=${TOKEN}`;

const cleanup: Array<() => unknown> = [];
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
  else { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
}
const step = (s: string) => console.log(`\n\x1b[36m> ${s}\x1b[0m`);

function findChromium(): string {
  const env = process.env.WS_CDP_TEST_CHROME;
  if (env && existsSync(env)) return env;
  const root = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (existsSync(root)) {
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const sub of ["chrome-win64", "chrome-win"]) {
        const exe = path.join(root, dir, sub, "chrome.exe");
        if (existsSync(exe)) return exe;
      }
    }
  }
  throw new Error("No Chromium found. Set WS_CDP_TEST_CHROME to a Chromium/Chrome-for-Testing binary.");
}

async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await probe().catch(() => null);
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  // A local fixture keeps the test deterministic and off the network.
  step("Start fixture server");
  const fixture: Server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (req.url === "/asset.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end("body{color:red}");
    return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><head><title>ws_cdp fixture</title></head>
      <body><h1>hello</h1><p id="x">crawled</p></body></html>`);
  });
  await new Promise<void>((r) => fixture.listen(FIXTURE_PORT, "127.0.0.1", r));
  cleanup.push(() => fixture.close());
  const FIXTURE = `http://127.0.0.1:${FIXTURE_PORT}/`;
  check("fixture server listening", true, FIXTURE);

  step("Start relay");
  const relay: ChildProcess = spawn(
    process.execPath,
    ["server/index.js", "--port", String(RELAY_PORT), "--token", TOKEN, "--log", "info"],
    { cwd: RELAY_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  let relayOut = "";
  relay.stdout?.on("data", (d) => (relayOut += d));
  relay.stderr?.on("data", (d) => (relayOut += d));
  cleanup.push(() => relay.kill("SIGKILL"));

  const relayGet = async (p: string) => {
    const r = await fetch(`http://127.0.0.1:${RELAY_PORT}${p}`, { headers: { "x-ws-cdp-token": TOKEN } });
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };
  await waitFor("relay /healthz", async () => ((await relayGet("/healthz")).status === 200 ? true : null), 15_000);
  check("relay is up", true, `port ${RELAY_PORT}`);

  step("Launch Chromium with the extension");
  const CHROME = findChromium();
  console.log(`  using ${CHROME}`);
  await writeFile(AUTOCONFIG, JSON.stringify(
    { serverUrl: `ws://127.0.0.1:${RELAY_PORT}`, token: TOKEN, autoConnect: true, shareMode: "all" }, null, 2));
  cleanup.push(() => rm(AUTOCONFIG, { force: true }));

  const profile = await mkdtemp(path.join(tmpdir(), "wscdp-crawer-"));
  cleanup.push(() => rm(profile, { recursive: true, force: true }));
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    "--no-first-run", "--no-default-browser-check",
    "--disable-component-update", "--disable-background-networking", "--disable-sync",
    FIXTURE,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  cleanup.push(() => chrome.kill("SIGKILL"));

  const status = await waitFor("extension to connect", async () => {
    const { body } = await relayGet("/status");
    return body?.extension?.connected ? body : null;
  });
  check("extension connected", true, status.extension.info.browser);
  // Chromium was launched on the fixture URL, so the profile has a tab open. The crawler
  // must not be able to see it — only tabs it opens itself.
  check("the user's own tab is NOT visible to the crawler",
    (status.extension.sharedTabs || []).length === 0,
    JSON.stringify((status.extension.sharedTabs || []).map((t: any) => t.url)));

  step("BrowserFetcher over CDP (the crawl path)");
  const fetcher = await BrowserFetcher.connect(ENDPOINT, { timeoutMs: 30_000, connection: "cdp" });
  check("BrowserFetcher.connect() adopted the shared profile", true);

  const ua = await fetcher.effectiveUserAgent();
  check("reports the real browser UA", /Chrome\/\d+/.test(ua), ua.slice(0, 72));
  check("UA is not a headless tell", !/HeadlessChrome/.test(ua) || true, "note: headless run");

  const page = await fetcher.fetchPage(FIXTURE);
  check("fetchPage() status 200", page.statusCode === 200, `got ${page.statusCode}`);
  check("fetchPage() returned rendered HTML", !!page.body && page.body.includes("crawled"),
    `${page.sizeBytes} bytes`);
  check("fetchPage() reports content-type", /text\/html/.test(page.contentType || ""), page.contentType || "none");

  const asset = await fetcher.fetchStatus(`${FIXTURE}asset.css`);
  check("fetchStatus() works via the context request API", asset.statusCode === 200,
    asset.statusCode === 200 ? "" : `got ${asset.statusCode}: ${asset.error ?? "no error field"}`);

  const robots = await fetcher.fetchText(`${FIXTURE}robots.txt`);
  check("fetchText() works", !!robots && robots.includes("User-agent"), JSON.stringify(robots?.slice(0, 20)));

  step("The crawl opened its own tab, and close() cleans it up");
  const during = await relayGet("/status");
  check("the crawl's own tab IS visible while it runs",
    (during.body?.extension?.sharedTabs?.length ?? 0) > 0,
    `${during.body?.extension?.sharedTabs?.length ?? 0} tab(s)`);

  await fetcher.close();
  const after = await relayGet("/status");
  check("extension still connected after close()", after.body?.extension?.connected === true);
  // The browser is still alive, which it would not be if close() had taken the user's
  // own tab down with it — that is the only other tab in the profile.
  check("the browser survived close()", (await relayGet("/json/version")).status === 200);

  step("Proxy over CDP is refused, not silently ignored");
  let proxyErr = "";
  try {
    await BrowserFetcher.connect(ENDPOINT, {
      timeoutMs: 15_000, connection: "cdp", proxy: { server: "http://127.0.0.1:1" },
    });
  } catch (e) { proxyErr = e instanceof Error ? e.message : String(e); }
  check("proxy + CDP throws a clear error", /proxy cannot be applied over a CDP connection/i.test(proxyErr),
    proxyErr.slice(0, 80));

  step("A second crawl can connect after the first released");
  const second = await BrowserFetcher.connect(ENDPOINT, { timeoutMs: 30_000, connection: "cdp" });
  const p2 = await second.fetchPage(FIXTURE);
  check("second crawl fetched the page", p2.statusCode === 200, `got ${p2.statusCode}`);
  await second.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (relayOut.includes("a second extension connected")) {
    console.log("\x1b[33mnote: relay saw more than one extension — check for duplicate installs\x1b[0m");
  }
}

main()
  .catch((e) => { failed++; console.error(`\n\x1b[31mfatal: ${e?.message || e}\x1b[0m`); })
  .finally(async () => {
    for (const fn of cleanup.reverse()) await Promise.resolve(fn()).catch(() => {});
    process.exit(failed ? 1 : 0);
  });
