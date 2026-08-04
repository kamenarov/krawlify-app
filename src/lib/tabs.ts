import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Tab + filter definitions shared by the data API and the export route.
 * Each tab maps to a source model (page | asset | redirect) and a set of named
 * filter presets that translate into Prisma `where` fragments. Duplicate filters
 * are resolved dynamically (grouped query) so they stay correct without storing a
 * per-row duplicate flag.
 */

export type TabSource = "page" | "asset" | "redirect" | "link";

export interface TabDef {
  source: TabSource;
  /** Base where (before filter preset), e.g. internal-only. */
  base?: Prisma.PageWhereInput | Prisma.AssetWhereInput;
  /** Allowed filter preset keys for this tab. */
  filters: string[];
  /** Default ordering column. */
  orderBy?: string;
}

export const TABS: Record<string, TabDef> = {
  internal: { source: "page", base: { isInternal: true }, filters: ["all", "2xx", "3xx", "4xx", "5xx", "noresponse"], orderBy: "url" },
  external: { source: "page", base: { isInternal: false }, filters: ["all", "2xx", "3xx", "4xx", "5xx", "noresponse"], orderBy: "url" },
  "response-codes": { source: "page", filters: ["all", "2xx", "3xx", "4xx", "5xx", "noresponse"], orderBy: "statusClass" },
  titles: { source: "page", base: { isInternal: true }, filters: ["all", "missing", "duplicate", "over", "under", "multiple"], orderBy: "url" },
  meta: { source: "page", base: { isInternal: true }, filters: ["all", "missing", "duplicate", "over", "under", "multiple"], orderBy: "url" },
  headings: { source: "page", base: { isInternal: true }, filters: ["all", "h1Missing", "h1Duplicate", "h1Multiple"], orderBy: "url" },
  directives: { source: "page", base: { isInternal: true }, filters: ["all", "canonicalMismatch", "noindex", "canonicalised"], orderBy: "url" },
  images: { source: "asset", base: { type: "img" }, filters: ["all", "altMissing", "altOver", "broken"], orderBy: "url" },
  "broken-assets": { source: "asset", base: { isBroken: true }, filters: ["all", "img", "script", "stylesheet", "api", "other"], orderBy: "url" },
  redirects: { source: "redirect", filters: ["all"], orderBy: "sourceUrl" },
  links: { source: "link", filters: ["all", "follow", "nofollow", "blank", "internal", "external"], orderBy: "sourceUrl" },
  sitemaps: { source: "page", base: { foundViaSitemap: true }, filters: ["all", "orphan"], orderBy: "url" },
  dates: {
    source: "page",
    base: { isInternal: true },
    filters: ["all", "hasPublished", "hasModified", "hasSitemapDate", "noDates"],
    orderBy: "url",
  },
};

const STATUS_CLASS: Record<string, number> = { "2xx": 2, "3xx": 3, "4xx": 4, "5xx": 5, noresponse: 0 };

/** Resolve hashes that appear more than once for a column (duplicate detection). */
async function duplicateHashes(
  prisma: PrismaClient,
  crawlId: string,
  column: "titleHash" | "metaDescHash" | "h1Hash",
): Promise<string[]> {
  const rows = await prisma.page.groupBy({
    by: [column],
    where: { crawlId, [column]: { not: null } } as Prisma.PageWhereInput,
    _count: { _all: true },
    having: { [column]: { _count: { gt: 1 } } } as Prisma.PageScalarWhereWithAggregatesInput,
  });
  return rows.map((r) => r[column]).filter((h): h is string => h !== null);
}

async function pageFilterWhere(
  prisma: PrismaClient,
  crawlId: string,
  tab: string,
  filter: string,
): Promise<Prisma.PageWhereInput> {
  if (filter === "all" || !filter) return {};
  if (STATUS_CLASS[filter] !== undefined) return { statusClass: STATUS_CLASS[filter] };

  switch (tab) {
    case "titles":
      if (filter === "duplicate") return { titleHash: { in: await duplicateHashes(prisma, crawlId, "titleHash") } };
      return { titleIssues: { has: filter } };
    case "meta":
      if (filter === "duplicate") return { metaDescHash: { in: await duplicateHashes(prisma, crawlId, "metaDescHash") } };
      return { metaIssues: { has: filter } };
    case "headings":
      if (filter === "h1Duplicate") return { h1Hash: { in: await duplicateHashes(prisma, crawlId, "h1Hash") } };
      return { h1Issues: { has: filter } };
    case "directives":
      if (filter === "canonicalMismatch") return { canonicalMismatch: true };
      if (filter === "noindex") return { indexability: "noindex" };
      if (filter === "canonicalised") return { indexability: "canonicalised" };
      return {};
    case "sitemaps":
      if (filter === "orphan") return { isOrphan: true };
      return {};
    case "dates":
      if (filter === "hasPublished") return { datePublished: { not: null } };
      if (filter === "hasModified") return { dateModified: { not: null } };
      if (filter === "hasSitemapDate") return { sitemapLastmod: { not: null } };
      if (filter === "noDates")
        return { datePublished: null, dateModified: null, sitemapLastmod: null };
      return {};
    default:
      return {};
  }
}

export interface QueryParams {
  crawlId: string;
  tab: string;
  filter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface QueryResult {
  rows: unknown[];
  total: number;
  source: TabSource;
}

/** Run a paginated, filtered query for a tab. Used by the data + export routes. */
export async function queryTab(prisma: PrismaClient, params: QueryParams): Promise<QueryResult> {
  const def = TABS[params.tab];
  if (!def) throw new Error(`Unknown tab: ${params.tab}`);

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(1000, Math.max(1, params.pageSize ?? 100));
  const skip = (page - 1) * pageSize;
  const sortDir = params.sortDir ?? "asc";
  const orderBy = { [params.sortBy ?? def.orderBy ?? "id"]: sortDir };

  if (def.source === "redirect") {
    const where: Prisma.RedirectWhereInput = {
      crawlId: params.crawlId,
      ...(params.search ? { sourceUrl: { contains: params.search, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.redirect.findMany({ where, orderBy, skip, take: pageSize }),
      prisma.redirect.count({ where }),
    ]);
    return { rows, total, source: "redirect" };
  }

  if (def.source === "link") {
    const f = params.filter ?? "all";
    const linkFilter: Prisma.LinkWhereInput =
      f === "follow"
        ? { nofollow: false }
        : f === "nofollow"
          ? { nofollow: true }
          : f === "blank"
            ? { isBlank: true }
            : f === "internal"
              ? { isInternal: true }
              : f === "external"
                ? { isInternal: false }
                : {};
    const where: Prisma.LinkWhereInput = {
      crawlId: params.crawlId,
      ...linkFilter,
      ...(params.search
        ? {
            OR: [
              { sourceUrl: { contains: params.search, mode: "insensitive" } },
              { targetUrl: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.link.findMany({ where, orderBy, skip, take: pageSize }),
      prisma.link.count({ where }),
    ]);
    return { rows, total, source: "link" };
  }

  if (def.source === "asset") {
    const filterWhere: Prisma.AssetWhereInput =
      params.filter && params.filter !== "all"
        ? params.tab === "images"
          ? params.filter === "broken"
            ? { isBroken: true }
            : { altIssues: { has: params.filter } }
          : { type: params.filter as Prisma.AssetWhereInput["type"] }
        : {};
    const where: Prisma.AssetWhereInput = {
      crawlId: params.crawlId,
      ...(def.base as Prisma.AssetWhereInput),
      ...filterWhere,
      ...(params.search ? { url: { contains: params.search, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.asset.findMany({ where, orderBy, skip, take: pageSize }),
      prisma.asset.count({ where }),
    ]);
    return { rows, total, source: "asset" };
  }

  // page source
  const filterWhere = await pageFilterWhere(prisma, params.crawlId, params.tab, params.filter ?? "all");
  const where: Prisma.PageWhereInput = {
    crawlId: params.crawlId,
    ...(def.base as Prisma.PageWhereInput),
    ...filterWhere,
    ...(params.search ? { url: { contains: params.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.page.findMany({ where, orderBy, skip, take: pageSize }),
    prisma.page.count({ where }),
  ]);
  return { rows, total, source: "page" };
}
