import { z } from "zod";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { controlKey, crawlConfigSchema } from "@/lib/events";
import { createCrawl, deleteCrawl } from "@/lib/crawlService";
import { queryTab } from "@/lib/tabs";
import { TAB_META } from "@/lib/tabMeta";
import { PRODUCT_RELAY_URL } from "@/lib/brand";

/**
 * The tools exposed over MCP. Each one is a thin wrapper over the same service
 * functions the REST API uses, so behaviour (ownership, validation, queueing) can't
 * drift between the two front doors.
 *
 * Everything is scoped to the API key's owner. `config` is never returned — it holds
 * the crawl's browser/proxy credentials in plaintext.
 */

export interface McpTool {
  name: string;
  title: string;
  description: string;
  /** JSON Schema advertised to the client. */
  inputSchema: Record<string, unknown>;
  /** Hints clients use to decide whether to prompt before calling. */
  annotations?: Record<string, unknown>;
  /** Runtime validation; the client's schema adherence is not something to trust. */
  args: z.ZodTypeAny;
  run: (userId: string, args: never) => Promise<unknown>;
}

/** Shorthand for a JSON Schema object node. */
function obj(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

const TAB_KEYS = TAB_META.map((t) => t.key);

/** Join keys and content hashes: storage plumbing, meaningless to a reader. */
const INTERNAL_COLUMNS = new Set([
  "crawlId",
  "pageId",
  "sourcePageId",
  "urlHash",
  "targetHash",
  "titleHash",
  "metaDescHash",
  "h1Hash",
]);

/**
 * Result rows are wide (a Page has ~50 columns) and mostly empty on any given crawl.
 * Nulls, empty strings, empty arrays and internal keys carry no information to a model,
 * so drop them — on a typical page row this roughly halves the payload.
 */
function compact<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (INTERNAL_COLUMNS.has(k)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** Fields safe and useful to hand back for a crawl. Deliberately excludes `config`. */
const CRAWL_SELECT = {
  id: true,
  seedUrl: true,
  rootHost: true,
  status: true,
  totalFound: true,
  totalCrawled: true,
  byStatusClass: true,
  webhookUrl: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

/** Confirm the key's owner may act on this crawl; admins may reach any of them. */
async function ownedCrawlId(userId: string, crawlId: string): Promise<string | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const where = me?.role === "admin" ? { id: crawlId } : { id: crawlId, userId };
  const found = await prisma.crawl.findFirst({ where, select: { id: true } });
  return found?.id ?? null;
}

const listCrawls: McpTool = {
  name: "list_crawls",
  title: "List crawls",
  description:
    "List the API key owner's crawls, newest first, with their status and counters. Use this to find a crawlId before calling the other tools.",
  annotations: { readOnlyHint: true },
  inputSchema: obj({
    status: {
      type: "string",
      enum: ["queued", "running", "paused", "done", "failed", "stopped"],
      description: "Only return crawls in this state.",
    },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  }),
  args: z.object({
    status: z.enum(["queued", "running", "paused", "done", "failed", "stopped"]).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  async run(userId, args: { status?: string; limit: number }) {
    const crawls = await prisma.crawl.findMany({
      where: { userId, ...(args.status ? { status: args.status as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: args.limit,
      select: CRAWL_SELECT,
    });
    return { crawls, count: crawls.length };
  },
};

const getCrawl: McpTool = {
  name: "get_crawl",
  title: "Get crawl status",
  description:
    "Fetch one crawl's status, page counters, response-code breakdown and its SEO issue summary (category, severity, count). Poll this until status is done, failed or stopped.",
  annotations: { readOnlyHint: true },
  inputSchema: obj({ crawlId: { type: "string", description: "The crawl id." } }, ["crawlId"]),
  args: z.object({ crawlId: z.string().min(1) }),
  async run(userId, args: { crawlId: string }) {
    const crawl = await prisma.crawl.findFirst({
      where: { id: args.crawlId, userId },
      select: CRAWL_SELECT,
    });
    if (!crawl) throw new Error(`No crawl ${args.crawlId} for this API key.`);
    const issues = await prisma.issue.findMany({
      where: { crawlId: crawl.id },
      orderBy: { count: "desc" },
      select: { category: true, severity: true, count: true },
    });
    return { crawl, issues };
  },
};

const getCrawlResults: McpTool = {
  name: "get_crawl_results",
  title: "Get crawl results",
  description:
    "Read result rows from a finished or running crawl, one tab at a time (paginated). Call list_result_tabs first if you are unsure which tab or filter to use. Empty fields are omitted from each row.",
  annotations: { readOnlyHint: true },
  inputSchema: obj(
    {
      crawlId: { type: "string" },
      tab: {
        type: "string",
        enum: TAB_KEYS,
        default: "internal",
        description: "Which result set to read.",
      },
      filter: {
        type: "string",
        default: "all",
        description: "A filter preset valid for that tab, e.g. \"4xx\" or \"missing\".",
      },
      search: { type: "string", description: "Substring match on the row's URL." },
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 200, default: 25 },
      sortBy: { type: "string", description: "Column to sort on; defaults to the tab's own." },
      sortDir: { type: "string", enum: ["asc", "desc"], default: "asc" },
    },
    ["crawlId"],
  ),
  args: z.object({
    crawlId: z.string().min(1),
    tab: z.string().default("internal"),
    filter: z.string().default("all"),
    search: z.string().optional(),
    page: z.number().int().min(1).default(1),
    // Capped well below the REST limit of 1000: these rows are going into a model's
    // context, and a thousand of them would swamp it.
    pageSize: z.number().int().min(1).max(200).default(25),
    sortBy: z.string().optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
  }),
  async run(
    userId,
    args: {
      crawlId: string;
      tab: string;
      filter: string;
      search?: string;
      page: number;
      pageSize: number;
      sortBy?: string;
      sortDir: "asc" | "desc";
    },
  ) {
    const owned = await prisma.crawl.findFirst({
      where: { id: args.crawlId, userId },
      select: { id: true },
    });
    if (!owned) throw new Error(`No crawl ${args.crawlId} for this API key.`);

    const result = await queryTab(prisma, { ...args, crawlId: owned.id });
    return {
      rows: (result.rows as Record<string, unknown>[]).map(compact),
      total: result.total,
      source: result.source,
      page: args.page,
      pageSize: args.pageSize,
      hasMore: args.page * args.pageSize < result.total,
    };
  },
};

const listResultTabs: McpTool = {
  name: "list_result_tabs",
  title: "List result tabs and filters",
  description:
    "Reference for get_crawl_results: every tab this crawler produces and the filter presets each one accepts.",
  annotations: { readOnlyHint: true },
  inputSchema: obj({}),
  args: z.object({}),
  async run() {
    return {
      tabs: TAB_META.map((t) => ({
        tab: t.key,
        label: t.label,
        filters: t.filters.map((f) => f.key),
      })),
    };
  },
};

const startCrawl: McpTool = {
  name: "start_crawl",
  title: "Start a crawl",
  description:
    "Queue a new crawl. Returns immediately with the crawl id — the crawl runs in the background, so poll get_crawl for progress. Fields not listed here from the crawl config reference are also accepted.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: {
    type: "object",
    properties: {
      seedUrl: { type: "string", format: "uri", description: "Where the crawl starts." },
      maxUrls: {
        type: "integer",
        minimum: 1,
        maximum: 500000,
        default: 10000,
        description: "Hard cap on URLs crawled. Keep it small for a quick look.",
      },
      maxDepth: { type: "integer", minimum: 0, maximum: 50, default: 10 },
      concurrency: { type: "integer", minimum: 1, maximum: 50, default: 8 },
      respectRobots: { type: "boolean", default: true },
      includeExternal: { type: "boolean", default: true, description: "Status-check off-domain links." },
      checkAssets: { type: "boolean", default: true, description: "Fetch images/JS/CSS to find broken assets." },
      userAgent: { type: "string", description: "Overrides the User-Agent for this crawl." },
      webhookUrl: { type: "string", format: "uri", description: "POSTed a summary when the crawl ends." },
      bypassBotProtection: {
        type: "boolean",
        default: false,
        description:
          "Drive the crawl through a remote browser for Cloudflare/bot-protected sites. Requires browserServer.",
      },
      browserServer: {
        type: "string",
        description:
          "Remote browser endpoint, required when bypassBotProtection is true. The hosted relay " +
          `is ${PRODUCT_RELAY_URL} with browserConnection "cdp" and browserAuth "bearer" — that ` +
          "token identifies the user's own browser and must be supplied by them.",
      },
    },
    required: ["seedUrl"],
    // The full config has ~20 more fields (proxy, bot-check waiting, timeouts). They are
    // validated by crawlConfigSchema either way, so let a caller that knows about them
    // pass them through instead of advertising the whole surface here.
    additionalProperties: true,
  },
  args: crawlConfigSchema,
  async run(userId, args: z.infer<typeof crawlConfigSchema>) {
    const id = await createCrawl(userId, args);
    return {
      id,
      status: "queued",
      message: `Crawl ${id} queued for ${args.seedUrl}. Poll get_crawl for progress.`,
    };
  },
};

const stopCrawl: McpTool = {
  name: "stop_crawl",
  title: "Stop a crawl",
  description:
    "Signal a running crawl to stop. Whatever it has already collected is kept and stays readable; the crawl ends in the 'stopped' state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: obj({ crawlId: { type: "string" } }, ["crawlId"]),
  args: z.object({ crawlId: z.string().min(1) }),
  async run(userId, args: { crawlId: string }) {
    const id = await ownedCrawlId(userId, args.crawlId);
    if (!id) throw new Error(`No crawl ${args.crawlId} for this API key.`);
    await redis.set(controlKey(id), "stop", "EX", 3600);
    return { id, ok: true, message: `Stop signalled for crawl ${id}.` };
  },
};

const deleteCrawlTool: McpTool = {
  name: "delete_crawl",
  title: "Delete a crawl",
  description:
    "Permanently delete a crawl and every row belonging to it — pages, links, assets, redirects and issues. This cannot be undone.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  inputSchema: obj({ crawlId: { type: "string" } }, ["crawlId"]),
  args: z.object({ crawlId: z.string().min(1) }),
  async run(userId, args: { crawlId: string }) {
    const id = await ownedCrawlId(userId, args.crawlId);
    if (!id) throw new Error(`No crawl ${args.crawlId} for this API key.`);
    await deleteCrawl(id);
    return { id, ok: true, message: `Crawl ${id} and all of its data were deleted.` };
  },
};

export const MCP_TOOLS: McpTool[] = [
  listCrawls,
  getCrawl,
  getCrawlResults,
  listResultTabs,
  startCrawl,
  stopCrawl,
  deleteCrawlTool,
];

export const MCP_TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));
