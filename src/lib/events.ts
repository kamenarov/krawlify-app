// Shared types + Redis channel naming used by both the worker (publisher) and the
// Next.js SSE route (subscriber). Keeping these in one place avoids drift.

import { z } from "zod";
import { PRODUCT_NAME, PRODUCT_URL } from "./brand";

/**
 * Global fallback User-Agent. Sourced from CRAWL_DEFAULT_USER_AGENT in .env so it can
 * be customised per deployment; falls back to a sensible built-in. Precedence used at
 * crawl creation: explicit per-crawl UA → user's saved default → this value.
 *
 * The `+url` is the convention for a crawler pointing at a page explaining itself, so a
 * webmaster reading their logs can tell who this is.
 */
export const DEFAULT_USER_AGENT =
  process.env.CRAWL_DEFAULT_USER_AGENT?.trim() || `${PRODUCT_NAME}/1.0 (+${PRODUCT_URL})`;

/** Validated crawl configuration stored on Crawl.config and used by the engine. */
export const crawlConfigSchema = z.object({
  seedUrl: z.string().url(),
  maxDepth: z.number().int().min(0).max(50).default(10),
  maxUrls: z.number().int().min(1).max(500_000).default(10_000),
  concurrency: z.number().int().min(1).max(50).default(8),
  respectRobots: z.boolean().default(true),
  followNofollow: z.boolean().default(false),
  includeExternal: z.boolean().default(true),
  checkAssets: z.boolean().default(true),
  // When true, drive the crawl through a remote browser to clear Cloudflare/bot-protection
  // challenges (the whole crawl runs in the browser, one page at a time).
  //
  // Two ways to reach that browser (`browserConnection`):
  //   "ws"  → a Playwright browser server   (chromium.connect,        ws://host:3001/)
  //   "cdp" → any Chrome DevTools endpoint  (chromium.connectOverCDP, http://host:9222)
  // `browserServer` is the endpoint and is REQUIRED whenever bypassBotProtection is on —
  // these settings are taken from the crawl alone, never from the environment.
  bypassBotProtection: z.boolean().default(false),
  browserConnection: z.enum(["ws", "cdp"]).default("ws"),
  browserServer: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  // How to authenticate the connection handshake. "bearer" sends
  // `Authorization: Bearer <browserAuthToken>`; "none" sends no auth header (providers that
  // take a ?token= query param need nothing here). "bearer" requires a token here.
  browserAuth: z.enum(["none", "bearer"]).default("none"),
  browserAuthToken: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  // When a page comes back as a bot-check interstitial ("Just a moment…"), give it up to a
  // minute to clear itself and record what it becomes. Only ever waits when an interstitial
  // is actually detected, so clean pages cost nothing. Bypass mode only.
  waitForBotCheck: z.boolean().default(false),
  // --- Anti-detection (bypass mode only). ---
  // Proxy is OPTIONAL — only applied when useProxy is true, and then the server must be
  // given here. Residential/mobile strongly recommended (datacenter IPs get flagged instantly).
  useProxy: z.boolean().default(false),
  proxyServer: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  proxyUsername: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  proxyPassword: z.string().optional().transform((v) => (v ? v : undefined)),
  userAgent: z.string().min(1).default(DEFAULT_USER_AGENT),
  requestTimeoutMs: z.number().int().min(1000).max(120_000).default(15_000),
  politenessDelayMs: z.number().int().min(0).max(10_000).default(0),
  // Optional webhook fired when the crawl finishes. Empty string is coerced to undefined.
  webhookUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
})
  // Bot-protection settings have no environment fallback, so whatever a run needs must be
  // present on the crawl itself. Caught here rather than at connect time, so an unusable
  // crawl is rejected at creation instead of failing minutes later in the worker.
  .superRefine((cfg, ctx) => {
    if (!cfg.bypassBotProtection) return;
    if (!cfg.browserServer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["browserServer"],
        message:
          cfg.browserConnection === "cdp"
            ? "A CDP endpoint is required when bot-protection bypass is enabled."
            : "A Playwright server endpoint is required when bot-protection bypass is enabled.",
      });
    }
    if (cfg.browserAuth === "bearer" && !cfg.browserAuthToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["browserAuthToken"],
        message: "A token is required when the browser connection uses Bearer authentication.",
      });
    }
    if (cfg.useProxy && !cfg.proxyServer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proxyServer"],
        message: "A proxy server is required when “Use a proxy” is enabled.",
      });
    }
  });

export type CrawlConfig = z.infer<typeof crawlConfigSchema>;

/** Per-status-class tally. Key "0" = no response / network error. */
export type StatusClassCounts = Record<string, number>;

/** Snapshot/progress event streamed over SSE. */
export interface CrawlProgressEvent {
  type: "progress" | "snapshot" | "done" | "failed" | "stopped";
  crawlId: string;
  status: string;
  totalFound: number;
  totalCrawled: number;
  byStatusClass: StatusClassCounts;
  issueCounts: Record<string, number>;
  currentUrl?: string;
  error?: string;
  at: number; // epoch ms (stamped by publisher)
}

export const progressChannel = (crawlId: string) => `crawl:${crawlId}:progress`;
export const controlKey = (crawlId: string) => `crawl:${crawlId}:control`;

/** Issue categories tracked in the rollup + sidebar. Order = display order. */
export const ISSUE_CATEGORIES: { key: string; label: string; severity: "error" | "warning" | "notice" }[] = [
  { key: "responseCodes.clientError", label: "4xx Client Error", severity: "error" },
  { key: "responseCodes.serverError", label: "5xx Server Error", severity: "error" },
  { key: "responseCodes.noResponse", label: "No Response", severity: "error" },
  { key: "titles.missing", label: "Title: Missing", severity: "error" },
  { key: "titles.duplicate", label: "Title: Duplicate", severity: "warning" },
  { key: "titles.over", label: "Title: Over 60 chars", severity: "warning" },
  { key: "titles.under", label: "Title: Under 30 chars", severity: "notice" },
  { key: "titles.multiple", label: "Title: Multiple", severity: "warning" },
  { key: "meta.missing", label: "Meta Desc: Missing", severity: "warning" },
  { key: "meta.duplicate", label: "Meta Desc: Duplicate", severity: "warning" },
  { key: "meta.over", label: "Meta Desc: Over 160 chars", severity: "warning" },
  { key: "meta.under", label: "Meta Desc: Under 70 chars", severity: "notice" },
  { key: "headings.h1Missing", label: "H1: Missing", severity: "warning" },
  { key: "headings.h1Duplicate", label: "H1: Duplicate", severity: "warning" },
  { key: "headings.h1Multiple", label: "H1: Multiple", severity: "warning" },
  { key: "directives.canonicalMismatch", label: "Canonical Mismatch", severity: "warning" },
  { key: "directives.noindex", label: "Noindex", severity: "notice" },
  { key: "images.altMissing", label: "Image: Missing Alt", severity: "warning" },
  { key: "images.altOver", label: "Image: Alt > 100 chars", severity: "notice" },
  { key: "images.broken", label: "Image: Broken", severity: "error" },
  { key: "resources.broken", label: "Broken Resources", severity: "error" },
  { key: "pages.orphan", label: "Orphan Pages", severity: "warning" },
];
