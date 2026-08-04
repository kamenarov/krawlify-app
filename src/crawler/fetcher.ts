import { request } from "undici";
import { normalizeUrl } from "./url";

export interface RedirectHop {
  sourceUrl: string;
  statusCode: number;
  targetUrl: string;
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number; // final status (0 = network error / no response)
  contentType: string | null;
  body: string | null; // present only for HTML responses
  sizeBytes: number;
  responseTimeMs: number;
  redirectChain: RedirectHop[]; // empty if no redirect
  error?: string;
}

interface FetchOptions {
  userAgent: string;
  timeoutMs: number;
  maxRedirectHops: number;
  /** When false, only HEAD-style metadata is needed (assets) — body is skipped. */
  wantBody: boolean;
  /** Optional Cookie header (e.g. harvested cf_clearance) sent with every request. */
  cookie?: string;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB cap to bound memory per page

function isHtml(contentType: string | null): boolean {
  if (!contentType) return false;
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

/**
 * Fetch a single URL with manual redirect handling so each hop is captured for the
 * Redirects tab. Returns the final response plus the full chain. Never throws —
 * network failures resolve to statusCode 0 with an `error`.
 */
export async function fetchUrl(url: string, opts: FetchOptions): Promise<FetchResult> {
  const start = performance.now();
  const redirectChain: RedirectHop[] = [];
  let current = url;

  for (let hop = 0; hop <= opts.maxRedirectHops; hop++) {
    let res;
    try {
      // undici's request() does not auto-follow redirects — it returns the 3xx
      // response, which is exactly what we want for manual chain capture.
      res = await request(current, {
        method: opts.wantBody ? "GET" : "HEAD",
        headersTimeout: opts.timeoutMs,
        bodyTimeout: opts.timeoutMs,
        headers: {
          "user-agent": opts.userAgent,
          accept: "*/*",
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
        },
      });
    } catch (err) {
      return {
        requestedUrl: url,
        finalUrl: current,
        statusCode: 0,
        contentType: null,
        body: null,
        sizeBytes: 0,
        responseTimeMs: Math.round(performance.now() - start),
        redirectChain,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const status = res.statusCode;
    const headers = res.headers;
    const contentType =
      (Array.isArray(headers["content-type"])
        ? headers["content-type"][0]
        : headers["content-type"]) ?? null;

    // Redirect (3xx with Location)?
    const location = Array.isArray(headers["location"])
      ? headers["location"][0]
      : headers["location"];
    if (status >= 300 && status < 400 && location) {
      const target = normalizeUrl(location, current) ?? location;
      redirectChain.push({ sourceUrl: current, statusCode: status, targetUrl: target });
      // Drain body to free the socket.
      res.body.dump().catch(() => {});
      current = target;
      continue;
    }

    // Terminal response. Read body only for HTML when requested.
    let body: string | null = null;
    let sizeBytes = 0;
    if (opts.wantBody && isHtml(contentType)) {
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const chunk of res.body) {
          const buf = chunk as Buffer;
          total += buf.length;
          if (total <= MAX_BODY_BYTES) chunks.push(buf);
        }
      } catch {
        // partial body — use what we have
      }
      sizeBytes = total;
      body = Buffer.concat(chunks).toString("utf8");
    } else {
      const len = Array.isArray(headers["content-length"])
        ? headers["content-length"][0]
        : headers["content-length"];
      sizeBytes = len ? Number(len) : 0;
      res.body.dump().catch(() => {});
    }

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

  // Exceeded max hops.
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

export function statusClassOf(statusCode: number): number {
  if (statusCode === 0) return 0;
  return Math.floor(statusCode / 100);
}

/** Fetches a URL's text body (robots.txt, sitemaps). Returns null on non-2xx/error. */
export type TextFetcher = (url: string) => Promise<string | null>;

export async function fetchText(
  url: string,
  opts: { userAgent: string; timeoutMs: number; cookie?: string },
): Promise<string | null> {
  try {
    const res = await request(url, {
      method: "GET",
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
      headers: { "user-agent": opts.userAgent, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.body.dump().catch(() => {});
      return null;
    }
    return await res.body.text();
  } catch {
    return null;
  }
}
