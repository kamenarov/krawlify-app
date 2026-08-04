/**
 * Browser-driven fetcher for bot-protected sites (Cloudflare, etc.).
 *
 * The browser runs on a SEPARATE host; we connect to it rather than launching one
 * locally — so the worker image needs only the Playwright client, no browser binaries.
 * Two connection modes are supported:
 *   "ws"  — a Playwright browser server, via `chromium.connect`        (ws://host:3001/)
 *   "cdp" — any Chrome DevTools Protocol endpoint, via `connectOverCDP` (http://host:9222)
 * Either can authenticate with `Authorization: Bearer <token>` on the handshake, or with
 * nothing at all (providers that authenticate via a ?token= query param on the URL).
 *
 * When a crawl opts in (`bypassBotProtection`) we connect to the configured endpoint and
 * crawl every page through that browser context, ONE PAGE AT A TIME. Crawling starts
 * straight away — dealing with any interstitial is the remote browser's job. A crawl may
 * additionally opt into `waitForBotCheck`, which gives a detected interstitial up to a
 * minute to clear before the page is recorded.
 *
 * Why the whole crawl goes through the browser: a `cf_clearance` cookie is bound to the
 * IP + UA that solved the challenge. Since the browser lives on a different host than
 * the worker, those cookies are only valid from inside the browser — so page fetches,
 * asset/status checks, robots.txt and sitemaps all go through it.
 *
 * Speed: heavy resources (images/media/fonts) are blocked, navigations use
 * `domcontentloaded`, a single page is reused, and asset/text fetches use the context's
 * APIRequestContext (no rendering).
 */
import type { Browser, BrowserContext, Page } from "playwright";
import type { FetchResult, RedirectHop } from "./fetcher";
import { normalizeUrl } from "./url";

/** A current, real desktop Chrome UA (default for desktop instead of a server UA). */
const REAL_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Realistic WebGL vendor/renderer pairs; one is picked per session (fingerprint variance). */
const WEBGL_PAIRS: [string, string][] = [
  ["Intel Inc.", "Intel Iris OpenGL Engine"],
  ["Google Inc. (Intel)", "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
  ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
  ["Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"],
  ["Apple Inc.", "Apple GPU"],
];

interface Fingerprint {
  webglVendor: string;
  webglRenderer: string;
  pluginCount: number;
  canvasSeed: number;
}

/** Pick a per-session fingerprint so it isn't byte-identical across runs (#4). */
function randomFingerprint(): Fingerprint {
  const [webglVendor, webglRenderer] = WEBGL_PAIRS[Math.floor(Math.random() * WEBGL_PAIRS.length)];
  return {
    webglVendor,
    webglRenderer,
    pluginCount: 3 + Math.floor(Math.random() * 3), // 3–5
    canvasSeed: 1 + Math.floor(Math.random() * 1_000_000),
  };
}

/**
 * Stealth init-scripts, applied client-side over connect() (server-side stealth does
 * NOT apply to contexts we create remotely). Patches the common automation tells —
 * navigator.webdriver, plugins/mimeTypes, window.chrome, permissions, the WebGL
 * vendor/renderer (headless reports SwiftShader) — plus per-session canvas noise and
 * randomized WebGL so the fingerprint varies between runs.
 *
 * navigator.languages is deliberately left alone: the remote browser owns its locale, and
 * overriding the language list to something that contradicts it is itself a tell.
 */
function buildEvasions(fp: Fingerprint): string {
  return `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => Array.from({length: ${fp.pluginCount}}, (_, i) => i + 1) });
  Object.defineProperty(navigator, 'mimeTypes', { get: () => [1, 2] });
  window.chrome = window.chrome || { runtime: {}, app: {}, csi: function(){}, loadTimes: function(){} };
  try {
    const orig = window.navigator.permissions && window.navigator.permissions.query;
    if (orig) window.navigator.permissions.query = (p) =>
      p && p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : orig(p);
  } catch (e) {}
  try {
    const patch = (proto) => {
      const gp = proto.getParameter;
      proto.getParameter = function (p) {
        if (p === 37445) return ${JSON.stringify(fp.webglVendor)};   // UNMASKED_VENDOR_WEBGL
        if (p === 37446) return ${JSON.stringify(fp.webglRenderer)}; // UNMASKED_RENDERER_WEBGL
        return gp.call(this, p);
      };
    };
    if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
  } catch (e) {}
  try {
    // Per-session canvas noise so the canvas fingerprint differs across runs.
    let s = ${fp.canvasSeed} >>> 0;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      try {
        const ctx = this.getContext('2d');
        if (ctx && this.width && this.height) {
          const img = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < img.data.length; i += 4) { if (rnd() < 0.02) img.data[i] = img.data[i] ^ 1; }
          ctx.putImageData(img, 0, 0);
        }
      } catch (e) {}
      return orig.apply(this, args);
    };
  } catch (e) {}
`;
}

/**
 * Interstitial detection, used only when a crawl opts into waiting for the bot check.
 * Cloudflare (and friends) serve a holding page with a recognisable title and/or one of
 * these challenge containers while they decide whether the visitor is human.
 */
export const CHALLENGE_TITLE =
  /just a moment|checking your browser|attention required|verify(ing)? (you|that you) are human|one more step|security check|ddos-guard/i;
export const CHALLENGE_SELECTOR =
  "#challenge-form, #challenge-running, #challenge-stage, #cf-challenge-running, #cf-please-wait, .cf-browser-verification, [data-translate='checking_browser']";
/** How long a crawl with `waitForBotCheck` gives an interstitial to clear itself. */
const BOT_CHECK_WAIT_MS = 60_000;
const BOT_CHECK_POLL_MS = 1_000;
/** Extra grace for the handed-over page to render links (see settleAfterChallenge). */
const LINK_SETTLE_MS = 10_000;
/** Cap on the post-challenge "let the page finish its XHRs" wait. */
const NETWORK_IDLE_MS = 15_000;
/** Redirect hops followed by the HTTP fast path before giving up. */
const MAX_HTTP_HOPS = 10;

/**
 * The same interstitial test as `isChallenged`, but against raw HTML rather than a live
 * DOM — the HTTP fast path has no page to inspect. Matches the holding page's <title> or
 * any of the challenge containers by id/class in the markup.
 */
function bodyLooksChallenged(html: string | null): boolean {
  if (!html) return false;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  if (CHALLENGE_TITLE.test(title)) return true;
  return /id=["']?(challenge-form|challenge-running|challenge-stage|cf-challenge-running|cf-please-wait)|cf-browser-verification|data-translate=["']checking_browser/i.test(
    html,
  );
}

function looksLikeBrowserUA(ua: string | undefined): boolean {
  return !!ua && /mozilla\/5\.0/i.test(ua);
}

function isHtml(ct: string | null): boolean {
  return !!ct && /text\/html|application\/xhtml\+xml/i.test(ct);
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/** How to reach the remote browser: Playwright server (ws) or DevTools endpoint (cdp). */
export type BrowserConnection = "ws" | "cdp";

export interface ConnectOptions {
  userAgent?: string;
  timeoutMs: number;
  proxy?: ProxyConfig;
  /** Connection protocol; defaults to the Playwright server ("ws"). */
  connection?: BrowserConnection;
  /** Sent as `Authorization: Bearer <token>` on the connection handshake when set. */
  authToken?: string;
  /**
   * When a page comes back as a bot-check interstitial, give it up to a minute to clear
   * itself before recording the page. Off by default — pages are recorded as served.
   */
  waitForBotCheck?: boolean;
}

export class BrowserFetcher {
  private constructor(
    private browser: Browser,
    private context: BrowserContext,
    private page: Page,
    private timeoutMs: number,
    /**
     * False when we adopted the remote browser's existing default context instead of
     * creating our own (see `connect`). Closing a context we do not own would take the
     * user's own tabs down with it, so `close()` checks this.
     */
    private ownsContext: boolean,
    /** Opt-in: wait out a bot-check interstitial instead of recording it (see fetchPage). */
    private waitForBotCheck: boolean,
  ) {}

  /**
   * Most recent main-frame document response. Tracked because when an interstitial clears
   * it navigates to the real page on its own, which makes the response returned by our
   * original `goto` stale — this is the one that carries the real status/content-type.
   */
  private lastDocResponse: import("playwright").Response | null = null;

  /**
   * Two-mode fetching, active only when `waitForBotCheck` is on.
   *
   * `fullFidelity` — the tab that faces the bot check runs as a complete browser: nothing
   * is blocked, so the challenge's own scripts, styles, fonts and images all load and its
   * cookies are set exactly as they would be for a human. Blocking any of that is a way to
   * fail a check that would otherwise pass.
   *
   * `httpMode` — once clearance is in the context's cookie jar, the rest of the crawl stops
   * rendering. Pages are fetched over HTTP through that same context (same cookies, same
   * IP, same TLS fingerprint) — curl-fast, no layout, no JS. If a fetch comes back looking
   * like a challenge again, we drop back to the real tab, re-clear, and resume.
   */
  private fullFidelity = false;
  private httpMode = false;

  /**
   * Set once the remote browser goes away (its process exits, the CDP socket drops, a
   * shared profile's owner closes Chrome). Every fetch after that fails instantly, so
   * without this the crawl marches through the whole frontier recording "no response"
   * for pages it never actually asked for — a report that looks like a dead site rather
   * than a dead connection. The engine checks it and stops.
   */
  private disconnected = false;

  /** Has the remote browser dropped out from under us? */
  get isDisconnected(): boolean {
    return this.disconnected;
  }

  /** Connect to a remote browser (Playwright server or CDP) and prepare one reusable page. */
  static async connect(endpoint: string, opts: ConnectOptions): Promise<BrowserFetcher> {
    let chromium: typeof import("playwright").chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      throw new Error("Bot-protection bypass needs the 'playwright' package, which isn't installed.");
    }

    const mode: BrowserConnection = opts.connection ?? "ws";
    // A CDP browser was launched by someone else, so its proxy is fixed at ITS launch —
    // per-context proxies aren't available over CDP. Fail loudly instead of silently
    // crawling from the wrong IP.
    if (mode === "cdp" && opts.proxy) {
      throw new Error(
        "A proxy cannot be applied over a CDP connection — the remote browser's proxy is fixed " +
          "when it launches. Configure the proxy on the browser itself, or use a Playwright " +
          "server connection (WS) instead.",
      );
    }

    // Bearer auth (when configured) rides on the handshake request — the WebSocket upgrade,
    // and for an http:// CDP endpoint the /json/version lookup too. Providers that instead
    // take a ?token= query param need no header, so this stays absent.
    //
    // Against a ws_cdp relay the Bearer token is not a server password but the identity of
    // ONE user's browser: the relay is multi-tenant, and the token selects whose Chrome
    // this crawl drives. A wrong or stale token is not a 401 there — it is a 503, because
    // distinguishing "unknown token" from "that user is offline" would let a caller probe
    // for which tokens exist.
    const connectOpts = {
      timeout: 30_000,
      ...(opts.authToken ? { headers: { authorization: `Bearer ${opts.authToken}` } } : {}),
    };

    let browser: Browser;
    try {
      browser =
        mode === "cdp"
          ? await chromium.connectOverCDP(endpoint, connectOpts)
          : await chromium.connect(endpoint, connectOpts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const label = mode === "cdp" ? "CDP endpoint" : "Playwright server";
      // The most common cause is picking the wrong connection type for the endpoint. Each
      // protocol simply hangs on the other's socket, so the failure is a bare timeout with
      // nothing to explain it — spell out the likely mix-up.
      let hint = "";
      // Providers are inconsistent about rejecting bad credentials — browserless answers a
      // bad token with 500, others with 401/403 — so treat any HTTP error on the handshake
      // as a possible auth problem.
      if (/\b503\b|no browser connected/i.test(msg)) {
        // ws_cdp answers 503 both when the token is unknown and when that user's browser
        // is simply offline — it will not say which. Cover both in the message.
        hint =
          " — the relay has no browser for this token. Either the token is wrong/rotated, " +
          "or that user's Chrome is closed or their ws_cdp extension is disconnected. Check " +
          "the extension's popup shows Connected, and that the token matches its options page.";
      } else if (/\b(401|403|407|500)\b|unauthorized|forbidden/i.test(msg)) {
        hint = opts.authToken
          ? " — the endpoint rejected the handshake; check the Bearer token is current and has access."
          : " — the endpoint rejected the handshake; it may require authentication (set the auth type" +
            " to Bearer with a token, or include the provider's ?token= parameter in the URL).";
      } else if (mode === "ws" && /timeout/i.test(msg)) {
        hint =
          " — a timeout here usually means this is a CDP endpoint, not a Playwright server " +
          "(hosted browsers often expose CDP at the bare root URL and the Playwright protocol " +
          "under a path, e.g. browserless: /chromium/playwright?token=…). Either switch the " +
          "connection type to CDP or point this at the Playwright server path.";
      } else if (mode === "cdp") {
        hint =
          " — a CDP endpoint is its http(s):// address (Playwright reads webSocketDebuggerUrl " +
          "from it) or the ws(s):// URL the provider gives you; note that ws://host:9222/ on a " +
          "plain Chrome is NOT a WebSocket URL, use http://host:9222 there.";
      }
      throw new Error(`Could not connect to the ${label} at ${endpoint}${hint}: ${msg}`);
    }

    // UA precedence: an explicit browser-like UA from the crawl, else a current real
    // desktop Chrome UA.
    const ua = looksLikeBrowserUA(opts.userAgent) ? opts.userAgent : REAL_CHROME_UA;

    // Context options. `viewport: null` keeps the real (headful) browser window size rather
    // than emulating one — no device emulation is applied. Locale, timezone and geolocation
    // are not set either: the remote browser's own settings stand.
    // Proxy is OPTIONAL — only set when requested. Per-context proxy requires the remote
    // server to have been launched with a global proxy (proxy:{server:'per-context'});
    // a no-proxy crawl works on a normally-launched server.
    const ctxOpts: Record<string, unknown> = {
      userAgent: ua,
      viewport: null,
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
    };

    let context: BrowserContext;
    let ownsContext = true;
    try {
      context = await browser.newContext(ctxOpts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (opts.proxy && /proxy/i.test(msg)) {
        await browser.close().catch(() => {});
        throw new Error(
          `Failed to apply per-context proxy. To use proxies, launch the Playwright server with a ` +
            `global proxy (e.g. launchServer({ proxy: { server: 'per-context' } })). Original error: ${msg}`,
        );
      }

      // A CDP endpoint that shares a REAL browser profile (ws_cdp, or any
      // --remote-debugging-port Chrome) has exactly one browser context and cannot make
      // another — Target.createBrowserContext is refused. Adopt the existing default
      // context instead: that profile's cookies and logins are the whole point of
      // connecting to it, and a fresh context would have thrown them away anyway.
      const existing = mode === "cdp" ? browser.contexts()[0] : undefined;
      if (!existing || !/createBrowserContext|not supported/i.test(msg)) {
        await browser.close().catch(() => {});
        throw e;
      }
      context = existing;
      ownsContext = false;
    }

    // Context-level options (userAgent, proxy) only apply to a context we created; an
    // adopted one keeps the real browser's own identity. That is the better outcome here —
    // a genuine profile's UA and fingerprint beat any override — but it does mean the
    // crawl's `userAgent` is ignored in this mode.
    if (!ownsContext && opts.userAgent) {
      console.warn(
        "[browser] connected to a shared real browser profile — the crawl's User-Agent " +
          "setting is ignored; the browser's own identity is used instead.",
      );
    }

    // Stealth evasions exist to hide a headless/automated browser. A real profile is not
    // one, and patching a genuine fingerprint only makes it inconsistent — so skip them.
    if (ownsContext) await context.addInitScript(buildEvasions(randomFingerprint()));
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(opts.timeoutMs);
    const fetcher = new BrowserFetcher(
      browser,
      context,
      page,
      opts.timeoutMs,
      ownsContext,
      opts.waitForBotCheck ?? false,
    );
    // A crawl that expects a bot check starts at full fidelity so the challenge can run
    // with everything it would have for a human; it drops to the fast path once cleared.
    fetcher.fullFidelity = fetcher.waitForBotCheck;
    // Heavy resources are dead weight when all we need is HTML — but they are NOT dead
    // weight to a bot check, which may load images/fonts/CSS and watch that they arrive.
    // So the block is conditional rather than absolute.
    await context.route("**/*", (route) => {
      if (fetcher.fullFidelity) return route.continue();
      const t = route.request().resourceType();
      if (t === "image" || t === "media" || t === "font") return route.abort();
      return route.continue();
    });
    // Playwright's own signal that the far end is gone — more reliable than pattern
    // matching the error text of whichever call happens to fail first.
    browser.on("disconnected", () => {
      fetcher.disconnected = true;
    });
    // Keep the latest main-frame document response to hand (see lastDocResponse).
    page.on("response", (r) => {
      const req = r.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        fetcher.lastDocResponse = r;
      }
    });
    return fetcher;
  }

  async effectiveUserAgent(): Promise<string> {
    return this.page.evaluate(() => navigator.userAgent).catch(() => "");
  }

  /**
   * Fetch a page.
   *
   * Without `waitForBotCheck` this always renders in the browser tab, as it always has.
   * With it, the crawl runs in two modes: the tab does the hard part (face the bot check
   * at full fidelity, let it set its cookies), then everything after clearance is pulled
   * over HTTP through the same context — same cookie jar, same IP — which is as fast as
   * curl and gives the parser the same HTML the app needs. A challenge seen on the fast
   * path sends us back to the tab for that URL.
   */
  async fetchPage(url: string): Promise<FetchResult> {
    if (this.httpMode) {
      const fast = await this.fetchPageOverHttp(url);
      if (fast && !bodyLooksChallenged(fast.body)) return fast;
      console.log(
        `[browser] ${fast ? "bot check is back" : "http fetch failed"} on ${url} — ` +
          "reopening it in the browser tab",
      );
      this.httpMode = false;
      this.fullFidelity = true;
    }
    return this.renderPage(url);
  }

  /**
   * Pull a page over HTTP using the context's own request stack: it carries the context's
   * cookies (including whatever the challenge granted) and leaves from the browser's IP,
   * but skips layout, script execution and subresources entirely.
   *
   * Redirects are followed by hand, exactly like the undici fetcher, so the Redirects tab
   * still gets every hop rather than just the final URL. Returns null when the fetch is
   * impossible, leaving the caller to fall back to rendering.
   */
  private async fetchPageOverHttp(url: string): Promise<FetchResult | null> {
    const start = performance.now();

    // A shared real profile has no usable context.request (see inPageFetch); the page's own
    // fetch() is the equivalent there. It follows redirects itself, so no chain is available.
    if (!this.ownsContext) {
      const r = await this.inPageFetch(url, true);
      if (!r) return null;
      return {
        requestedUrl: url,
        finalUrl: r.url || url,
        statusCode: r.status,
        contentType: r.contentType,
        body: isHtml(r.contentType) ? r.text : null,
        sizeBytes: r.text ? Buffer.byteLength(r.text) : r.length,
        responseTimeMs: Math.round(performance.now() - start),
        redirectChain: [],
      };
    }

    const redirectChain: RedirectHop[] = [];
    let current = url;
    for (let hop = 0; hop <= MAX_HTTP_HOPS; hop++) {
      let res;
      try {
        res = await this.context.request.get(current, {
          timeout: this.timeoutMs,
          failOnStatusCode: false,
          maxRedirects: 0, // captured by hand, below
        });
      } catch {
        return null; // let the caller fall back to the tab
      }

      const status = res.status();
      const headers = res.headers();
      const contentType = headers["content-type"] ?? null;
      const location = headers["location"];

      if (status >= 300 && status < 400 && location) {
        const target = normalizeUrl(location, current) ?? location;
        redirectChain.push({ sourceUrl: current, statusCode: status, targetUrl: target });
        await res.dispose().catch(() => {});
        current = target;
        continue;
      }

      let body: string | null = null;
      let sizeBytes = 0;
      if (isHtml(contentType)) {
        body = await res.text().catch(() => null);
        sizeBytes = body ? Buffer.byteLength(body) : 0;
      } else {
        sizeBytes = Number(headers["content-length"] ?? 0);
      }
      await res.dispose().catch(() => {});

      return {
        requestedUrl: url,
        finalUrl: current,
        statusCode: status,
        contentType,
        body,
        sizeBytes,
        responseTimeMs: Math.round(performance.now() - start),
        redirectChain,
      };
    }

    return {
      requestedUrl: url,
      finalUrl: current,
      statusCode: redirectChain.at(-1)?.statusCode ?? 0,
      contentType: null,
      body: null,
      sizeBytes: 0,
      responseTimeMs: Math.round(performance.now() - start),
      redirectChain,
      error: "Too many redirects",
    };
  }

  /** Fetch a page by navigating the reusable page; returns rendered HTML + status. */
  private async renderPage(url: string): Promise<FetchResult> {
    const start = performance.now();

    // Navigate with exponential backoff retries on transient navigation errors (#7).
    let resp: Awaited<ReturnType<Page["goto"]>> = null;
    let lastErr: unknown;
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      try {
        resp = await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) await this.page.waitForTimeout(1000 * 2 ** i).catch(() => {});
      }
    }
    if (lastErr) return this.errorResult(url, start, lastErr);

    // Opt-in: if this landed on a bot-check interstitial, give it up to a minute to clear
    // and record what it turns into instead. The interstitial navigates to the real page
    // itself once it passes, so the original response is stale by then.
    if (this.waitForBotCheck) {
      const outcome = await this.waitOutBotCheck(url);
      if (outcome === "cleared") resp = this.lastDocResponse ?? resp;
      // Either the page was clean or the check has just been passed — either way this
      // context now holds whatever cookie the site wanted, so the remaining pages can be
      // pulled over HTTP instead of rendered. A check still standing keeps us in the tab.
      if (outcome !== "timeout") {
        this.httpMode = true;
        this.fullFidelity = false;
      }
    }

    const status = resp ? resp.status() : 0;
    const headers = resp ? resp.headers() : {};
    const contentType = headers["content-type"] ?? null;
    const finalUrl = this.page.url();

    // Reconstruct the redirect chain from Playwright's request graph.
    const redirectChain: RedirectHop[] = [];
    if (resp) {
      const hops = [];
      let r = resp.request().redirectedFrom();
      while (r) {
        hops.unshift(r);
        r = r.redirectedFrom();
      }
      for (let i = 0; i < hops.length; i++) {
        const hres = await hops[i].response();
        redirectChain.push({
          sourceUrl: hops[i].url(),
          statusCode: hres?.status() ?? 0,
          targetUrl: i + 1 < hops.length ? hops[i + 1].url() : finalUrl,
        });
      }
    }

    let body: string | null = null;
    let sizeBytes = 0;
    if (isHtml(contentType)) {
      body = await this.readHtml();
      sizeBytes = body ? Buffer.byteLength(body) : 0;
    }

    return {
      requestedUrl: url,
      finalUrl,
      statusCode: status,
      contentType,
      body,
      sizeBytes,
      responseTimeMs: Math.round(performance.now() - start),
      redirectChain,
    };
  }

  /**
   * Resolve to `fallback` if `p` hasn't settled in `ms`.
   *
   * `page.title()` and `page.evaluate()` take no timeout of their own and fall back to
   * Playwright's 30s default, which an interstitial that keeps reloading itself can hit on
   * every poll — enough to blow well past the one minute the bot-check wait promises.
   */
  private static async withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    try {
      return await Promise.race([p, guard]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Title + challenge-container marker of the page as it stands right now. */
  private async challengeSigns(): Promise<{ title: string; marker: boolean }> {
    const probe = 5_000;
    const [title, marker] = await Promise.all([
      BrowserFetcher.withTimeout(this.page.title(), probe, "").catch(() => ""),
      BrowserFetcher.withTimeout(
        this.page.evaluate((sel) => !!document.querySelector(sel), CHALLENGE_SELECTOR),
        probe,
        false,
      ).catch(() => false),
    ]);
    return { title, marker };
  }

  /** Does the current page look like a bot-check holding page rather than real content? */
  private async isChallenged(): Promise<boolean> {
    const { title, marker } = await this.challengeSigns();
    return marker || CHALLENGE_TITLE.test(title);
  }

  /**
   * Has a challenge we were already waiting on actually finished?
   *
   * Stricter than `!isChallenged()` on purpose. Cloudflare blanks the document title while
   * it works, so a naive "the title no longer says Just a moment" check reports success a
   * second in and captures the half-built interstitial — observed as a 403 with no title
   * and no text. Clearing therefore also requires a real title and a non-error status on
   * the document response: the challenge is only over once the origin serves the page.
   */
  private async isCleared(): Promise<boolean> {
    const { title, marker } = await this.challengeSigns();
    if (marker || CHALLENGE_TITLE.test(title) || !title.trim()) return false;
    const status = this.lastDocResponse?.status() ?? 0;
    return status > 0 && status < 400;
  }

  /**
   * Let the page the challenge handed over to finish building before it is read.
   *
   * An interstitial hands over by navigating to the real page, and the clear is detectable
   * as soon as that document's <head> is parsed — read it right then and you capture a
   * shell: correct <title>, no text, and NO LINKS. That last part is why this matters
   * beyond one page's data: links are what feed the frontier, so an early capture of the
   * seed leaves nothing to crawl and the whole run stops after a single page.
   *
   * Settles on `load`, then gives anchors a bounded extra moment in case the real page
   * renders them client-side. Both waits are best-effort — a page that genuinely has no
   * links costs LINK_SETTLE_MS once, and only ever on the challenge path.
   */
  private async settleAfterChallenge(): Promise<void> {
    // `load` = subresources done. `networkidle` additionally waits out the XHR/fetch a
    // modern page does after load, which is where a lot of the real content arrives —
    // this is the page being "fully loaded as usual" rather than merely parsed. It is
    // bounded because a page with polling or a live socket never goes idle.
    await this.page.waitForLoadState("load", { timeout: this.timeoutMs }).catch(() => {});
    await this.page
      .waitForLoadState("networkidle", { timeout: NETWORK_IDLE_MS })
      .catch(() => {});
    const hasLinks = await BrowserFetcher.withTimeout(
      this.page.evaluate(() => document.querySelector("a[href]") !== null),
      5_000,
      false,
    ).catch(() => false);
    if (hasLinks) return;
    await this.page
      .waitForFunction(() => document.querySelector("a[href]") !== null, undefined, {
        timeout: LINK_SETTLE_MS,
      })
      .catch(() => {});
  }

  /**
   * Wait out a bot-check interstitial, up to BOT_CHECK_WAIT_MS.
   *
   * Only entered when one is actually detected, so a site without bot protection costs
   * nothing — the alternative (sleeping a flat minute per page) would turn any real crawl
   * into hours. Each poll settles on `domcontentloaded` first: while the challenge is
   * navigating, `title()`/`evaluate()` fail and would otherwise look like "cleared".
   *
   * "none"    — the page was never an interstitial.
   * "cleared" — one was, and it passed; the caller re-reads the page it handed over to.
   * "timeout" — still up after the minute; the page is recorded as served.
   */
  private async waitOutBotCheck(url: string): Promise<"none" | "cleared" | "timeout"> {
    if (!(await this.isChallenged())) return "none";

    console.log(`[browser] bot check on ${url} — waiting up to ${BOT_CHECK_WAIT_MS / 1000}s…`);
    const startedAt = Date.now();
    const deadline = startedAt + BOT_CHECK_WAIT_MS;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(BOT_CHECK_POLL_MS).catch(() => {});
      await this.page.waitForLoadState("domcontentloaded", { timeout: this.timeoutMs }).catch(() => {});
      if (await this.isCleared()) {
        await this.settleAfterChallenge();
        console.log(`[browser] bot check cleared after ${Math.round((Date.now() - startedAt) / 1000)}s`);
        return "cleared";
      }
    }
    console.warn(`[browser] bot check did not clear within ${BOT_CHECK_WAIT_MS / 1000}s — recording ${url} as served`);
    return "timeout";
  }

  /**
   * Rendered HTML of the current page.
   *
   * `page.content()` can throw "Unable to retrieve content because the page is navigating
   * and changing the content" on browsers that still have a navigation in flight after
   * `domcontentloaded` — seen on stealth/CDP proxy browsers. That used to surface as a
   * silently empty body (no title/meta/links for the page), so settle on `load` and retry,
   * then fall back to reading the DOM directly.
   */
  private async readHtml(): Promise<string | null> {
    const direct = await this.page.content().catch(() => null);
    if (direct !== null) return direct;
    await this.page.waitForLoadState("load", { timeout: this.timeoutMs }).catch(() => {});
    const retried = await this.page.content().catch(() => null);
    if (retried !== null) return retried;
    return this.page.evaluate(() => document.documentElement.outerHTML).catch(() => null);
  }

  /**
   * Fetch from inside the page itself, used when we adopted a shared real profile.
   *
   * `context.request` is unavailable there: Playwright backs it with `Storage.getCookies`
   * to copy the jar out to Node, which a shared-profile endpoint refuses (the profile's
   * cookies are not the client's to read). Issuing it from Node would be wrong anyway —
   * the request would leave from the worker's IP, losing exactly the cookie/IP binding
   * this class connects to a real browser to obtain.
   *
   * Returns null when the page cannot make the request at all (cross-origin with no CORS
   * headers, or an opaque about:blank origin), leaving the caller to fall back.
   */
  private async inPageFetch(url: string, wantBody: boolean) {
    return this.page
      .evaluate(
        async ({ url, wantBody, timeoutMs }) => {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), timeoutMs);
          try {
            const r = await fetch(url, { redirect: "follow", credentials: "include", signal: ctl.signal });
            return {
              status: r.status,
              url: r.url,
              contentType: r.headers.get("content-type"),
              length: Number(r.headers.get("content-length") ?? 0),
              text: wantBody ? await r.text() : null,
            };
          } catch {
            return null;
          } finally {
            clearTimeout(timer);
          }
        },
        { url, wantBody, timeoutMs: this.timeoutMs },
      )
      .catch(() => null);
  }

  /** Status-only fetch (assets, external links) via the context request API. */
  async fetchStatus(url: string): Promise<FetchResult> {
    const start = performance.now();

    if (!this.ownsContext) {
      const r = await this.inPageFetch(url, false);
      if (r) {
        return {
          requestedUrl: url,
          finalUrl: r.url || url,
          statusCode: r.status,
          contentType: r.contentType,
          body: null,
          sizeBytes: r.length,
          responseTimeMs: Math.round(performance.now() - start),
          redirectChain: [],
        };
      }
      // Cross-origin without CORS — common for external link checks. A plain request is
      // fine here: a status probe of someone else's host needs no profile cookies.
      return this.plainFetchStatus(url, start);
    }

    try {
      const r = await this.context.request.get(url, { timeout: this.timeoutMs, failOnStatusCode: false });
      const headers = r.headers();
      const result: FetchResult = {
        requestedUrl: url,
        finalUrl: r.url(),
        statusCode: r.status(),
        contentType: headers["content-type"] ?? null,
        body: null,
        sizeBytes: Number(headers["content-length"] ?? 0),
        responseTimeMs: Math.round(performance.now() - start),
        redirectChain: [],
      };
      await r.dispose().catch(() => {});
      return result;
    } catch (e) {
      return this.errorResult(url, start, e);
    }
  }

  /** Status probe from Node, for URLs the page itself is not allowed to fetch. */
  private async plainFetchStatus(url: string, start: number): Promise<FetchResult> {
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(this.timeoutMs) });
      return {
        requestedUrl: url,
        finalUrl: r.url || url,
        statusCode: r.status,
        contentType: r.headers.get("content-type"),
        body: null,
        sizeBytes: Number(r.headers.get("content-length") ?? 0),
        responseTimeMs: Math.round(performance.now() - start),
        redirectChain: [],
      };
    } catch (e) {
      return this.errorResult(url, start, e);
    }
  }

  /** Fetch text (robots.txt, sitemaps) through the browser context (valid cookies/IP). */
  async fetchText(url: string): Promise<string | null> {
    if (!this.ownsContext) {
      const r = await this.inPageFetch(url, true);
      // robots.txt and sitemaps are same-origin with the site being crawled, so the page
      // can nearly always fetch them itself — with the profile's cookies and IP.
      return r && r.status >= 200 && r.status < 300 ? r.text : null;
    }

    try {
      const r = await this.context.request.get(url, { timeout: this.timeoutMs, failOnStatusCode: false });
      if (!r.ok()) {
        await r.dispose().catch(() => {});
        return null;
      }
      const text = await r.text();
      await r.dispose().catch(() => {});
      return text;
    } catch {
      return null;
    }
  }

  /**
   * Tear down what WE created. Closing the context first matters for CDP: `close()` on a
   * CDP-connected browser only disconnects (the remote browser keeps running and is often
   * shared), so the context we opened would otherwise be left behind.
   */
  async close(): Promise<void> {
    if (this.ownsContext) {
      await this.context.close().catch(() => {});
    } else {
      // Someone else's context — closing it would close their tabs. Drop only our page.
      await this.page.close().catch(() => {});
    }
    await this.browser.close().catch(() => {});
  }

  private errorResult(url: string, start: number, e: unknown): FetchResult {
    // The browser can also disappear without the "disconnected" event — a shared profile's
    // owner closing our tab kills the page while the connection stays up. Those errors are
    // unrecoverable for this crawl, so treat them the same way.
    const msg = e instanceof Error ? e.message : String(e);
    if (/target (page|closed)|context or browser has been closed|browser has been closed|websocket|connection closed|session closed/i.test(msg)) {
      this.disconnected = true;
    }
    return {
      requestedUrl: url,
      finalUrl: url,
      statusCode: 0,
      contentType: null,
      body: null,
      sizeBytes: 0,
      responseTimeMs: Math.round(performance.now() - start),
      redirectChain: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
