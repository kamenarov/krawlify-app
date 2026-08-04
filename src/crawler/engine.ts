import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";

import { Frontier } from "./frontier";
import { fetchUrl, fetchText, statusClassOf, type FetchResult, type TextFetcher } from "./fetcher";
import { RobotsCache } from "./robots";
import { collectSitemapUrls, defaultSitemapUrls } from "./sitemap";
import { parseHtml } from "./parse";
import { auditTitles } from "./audit/titles";
import { auditMeta } from "./audit/meta";
import { auditHeadings } from "./audit/headings";
import { auditDirectives } from "./audit/directives";
import { auditImageAlt } from "./audit/images";
import { CrawlWriter } from "./persist";
import { BrowserFetcher } from "./browser";
import { hashStr, normalizeUrl, urlHash, hostOf, isInternalUrl } from "./url";
import {
  type CrawlConfig,
  type CrawlProgressEvent,
  type StatusClassCounts,
  progressChannel,
} from "@/lib/events";

interface EngineDeps {
  prisma: PrismaClient;
  redis: Redis;
  isStopped: () => Promise<boolean>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Map an HTTP status class to its response-code issue category, if any. */
function statusIssueKey(statusClass: number): string | null {
  if (statusClass === 4) return "responseCodes.clientError";
  if (statusClass === 5) return "responseCodes.serverError";
  if (statusClass === 0) return "responseCodes.noResponse";
  return null;
}

function assetTypeForCheck(t: "img" | "script" | "stylesheet"): "img" | "script" | "stylesheet" {
  return t;
}

export async function runCrawl(
  crawlId: string,
  config: CrawlConfig,
  deps: EngineDeps,
): Promise<void> {
  const { prisma, redis } = deps;

  const seed = normalizeUrl(config.seedUrl);
  if (!seed) throw new Error(`Invalid seed URL: ${config.seedUrl}`);
  const rootHost = hostOf(seed);
  const origin = new URL(seed).origin;

  await prisma.crawl.update({
    where: { id: crawlId },
    data: { status: "running", startedAt: new Date() },
  });

  // Bot-protection bypass: connect to the remote browser and crawl every page THROUGH it,
  // one at a time — any clearance cookie is bound to that browser's IP, so undici from the
  // worker would be re-challenged. The crawl starts immediately; whatever the remote browser
  // does about challenges is its own business. Normal crawls use the fast undici path with
  // full concurrency.
  let effectiveUA = config.userAgent;
  let concurrency = config.concurrency;
  let browser: BrowserFetcher | null = null;
  let doFetch: (url: string, wantBody: boolean) => Promise<FetchResult>;
  let textFetcher: TextFetcher;

  // Everything from the browser connect onward is wrapped so the remote browser is
  // ALWAYS closed in `finally` — whether the crawl completes, is stopped, or fails.
  try {
  if (config.bypassBotProtection) {
    // Every bot-protection setting comes from the crawl's own config — i.e. the fields on
    // the form — and nowhere else. No environment fallback: what the crawl was saved with
    // is exactly what is used, so a crawl always reproduces (and a redo reproduces it too).
    // "ws" = Playwright browser server, "cdp" = Chrome DevTools endpoint.
    const mode = config.browserConnection;
    const endpoint = config.browserServer?.trim();
    if (!endpoint) {
      const label = mode === "cdp" ? "CDP endpoint" : "Playwright server connection";
      throw new Error(`Bot-protection bypass is enabled but no ${label} was set on this crawl.`);
    }
    // Bearer auth is OPTIONAL: only when explicitly selected, and only from the token field.
    let authToken: string | undefined;
    if (config.browserAuth === "bearer") {
      authToken = config.browserAuthToken;
      if (!authToken) {
        throw new Error(
          "Bearer auth was selected for the browser connection but no token was set on this crawl.",
        );
      }
    }

    // Proxy is OPTIONAL: only when useProxy is set and a server was entered. Residential/
    // mobile recommended — datacenter IPs are flagged.
    const proxy =
      config.useProxy && config.proxyServer
        ? {
            server: config.proxyServer,
            username: config.proxyUsername,
            password: config.proxyPassword,
          }
        : undefined;

    console.log(
      `[crawl ${crawlId}] connecting to ${mode === "cdp" ? "CDP endpoint" : "Playwright server"} ` +
        `${endpoint}${authToken ? " (bearer auth)" : ""}${proxy ? ` via proxy ${proxy.server}` : ""}…`,
    );
    browser = await BrowserFetcher.connect(endpoint, {
      userAgent: config.userAgent,
      timeoutMs: config.requestTimeoutMs,
      proxy,
      connection: mode,
      authToken,
      waitForBotCheck: config.waitForBotCheck,
    });
    effectiveUA = (await browser.effectiveUserAgent()) || config.userAgent;
    concurrency = 1; // one page at a time through the browser
    doFetch = (url, wantBody) => (wantBody ? browser!.fetchPage(url) : browser!.fetchStatus(url));
    textFetcher = (url) => browser!.fetchText(url);
    console.log(`[crawl ${crawlId}] crawling via the remote browser (1 page at a time).`);
  } else {
    const maxHops = Number(process.env.CRAWL_MAX_REDIRECT_HOPS ?? 10);
    doFetch = (url, wantBody) =>
      fetchUrl(url, { userAgent: effectiveUA, timeoutMs: config.requestTimeoutMs, maxRedirectHops: maxHops, wantBody });
    textFetcher = (url) => fetchText(url, { userAgent: effectiveUA, timeoutMs: config.requestTimeoutMs });
  }

  const frontier = new Frontier(config.maxDepth, config.maxUrls);
  frontier.add(seed, 0);

  const robots = new RobotsCache(effectiveUA, textFetcher);
  const writer = new CrawlWriter(prisma, 50);
  const limit = pLimit(concurrency);

  // Live counters.
  const byStatusClass: StatusClassCounts = {};
  const issueCounts: Record<string, number> = {};
  let totalCrawled = 0;
  let currentUrl = "";
  let stopped = false;
  let noResponseCount = 0;
  /** Set when the remote browser vanishes — turns the run into a failure, not a `done`. */
  let browserLost: string | null = null;

  // Asset status cache (urlHash -> result) so each asset is fetched at most once.
  const assetStatus = new Map<string, { statusCode: number; statusClass: number; sizeBytes: number }>();

  const bump = (key: string, by = 1) => {
    issueCounts[key] = (issueCounts[key] ?? 0) + by;
  };
  const bumpStatus = (statusClass: number) => {
    const k = String(statusClass);
    byStatusClass[k] = (byStatusClass[k] ?? 0) + 1;
  };

  let lastPublish = 0;
  const publishProgress = async (
    type: CrawlProgressEvent["type"] = "progress",
    force = false,
  ) => {
    const now = Date.now();
    if (!force && now - lastPublish < 400) return;
    lastPublish = now;
    const evt: CrawlProgressEvent = {
      type,
      crawlId,
      status: type === "progress" ? "running" : type,
      totalFound: frontier.admittedCount,
      totalCrawled,
      byStatusClass: { ...byStatusClass },
      issueCounts: { ...issueCounts },
      currentUrl,
      at: now,
    };
    await redis.publish(progressChannel(crawlId), JSON.stringify(evt));
    // Keep the Crawl row roughly current so reconnecting clients get a snapshot.
    await prisma.crawl.update({
      where: { id: crawlId },
      data: {
        totalFound: frontier.admittedCount,
        totalCrawled,
        byStatusClass: byStatusClass as Prisma.InputJsonValue,
      },
    });
  };

  /** Fetch + cache an asset's status (deduped across pages). */
  async function checkAsset(url: string): Promise<{ statusCode: number; statusClass: number; sizeBytes: number }> {
    const h = urlHash(url);
    const cached = assetStatus.get(h);
    if (cached) return cached;
    const res = await doFetch(url, false);
    const result = {
      statusCode: res.statusCode,
      statusClass: statusClassOf(res.statusCode),
      sizeBytes: res.sizeBytes,
    };
    assetStatus.set(h, result);
    return result;
  }

  async function processUrl(url: string, depth: number): Promise<void> {
    if (stopped) return;
    currentUrl = url;
    const internal = isInternalUrl(url, rootHost);

    // robots.txt
    if (config.respectRobots && internal) {
      const allowed = await robots.isAllowed(url);
      if (!allowed) {
        recordBlockedPage(url, depth);
        return;
      }
    }

    if (config.politenessDelayMs > 0) await sleep(config.politenessDelayMs);

    const res = await doFetch(url, internal);

    // A status-0 page is stored with a null statusCode and "HTTP no response", which says
    // nothing about WHY. The reason only exists on the FetchResult, so surface it here —
    // a run where hundreds of pages fail identically (dead browser tab, DNS, TLS) is
    // otherwise indistinguishable from a site that is simply down.
    if (res.statusCode === 0 && res.error) {
      noResponseCount += 1;
      if (noResponseCount <= 5 || noResponseCount % 50 === 0) {
        console.warn(`[crawl ${crawlId}] no response (${noResponseCount}) ${url}: ${res.error}`);
      }
    }

    // If the remote browser has gone (its Chrome was closed, the CDP socket dropped, the
    // relay lost its token), every remaining fetch will fail instantly. Continuing would
    // write hundreds of "HTTP no response" rows for pages that were never requested and
    // finish the crawl as `done` — a report that silently understates the site. Stop and
    // fail loudly instead, so the partial data is labelled for what it is.
    if (browser?.isDisconnected) {
      browserLost =
        "The remote browser disconnected mid-crawl, so the rest of the site was never " +
        "fetched. Check that browser/relay is still running, then re-run the crawl.";
      stopped = true;
      console.error(`[crawl ${crawlId}] ${browserLost}`);
      return;
    }

    const statusClass = statusClassOf(res.statusCode);
    bumpStatus(statusClass);
    const sk = statusIssueKey(statusClass);
    if (sk) bump(sk);
    totalCrawled += 1;

    // Redirect chain rows.
    if (res.redirectChain.length > 0) {
      const hops = res.redirectChain.length;
      writer.addRedirects(
        res.redirectChain.map((hop, i) => ({
          crawlId,
          sourceUrl: hop.sourceUrl,
          statusCode: hop.statusCode,
          targetUrl: hop.targetUrl,
          chainPosition: i,
          finalUrl: res.finalUrl,
          finalStatus: res.statusCode,
          hops,
        })),
      );
    }

    const pageId = randomUUID();
    const pageRow: Prisma.PageCreateManyInput = {
      id: pageId,
      crawlId,
      url,
      urlHash: urlHash(url),
      isInternal: internal,
      depth,
      statusCode: res.statusCode || null,
      statusClass,
      contentType: res.contentType,
      responseTimeMs: res.responseTimeMs,
      sizeBytes: res.sizeBytes,
    };

    // Parse + audit only internal HTML 2xx pages with a body.
    const isHtml = !!res.contentType && /text\/html|application\/xhtml/i.test(res.contentType);
    if (internal && res.body && isHtml && statusClass === 2) {
      const parsed = parseHtml(res.body, res.finalUrl, rootHost);

      const t = auditTitles(parsed.titles);
      const m = auditMeta(parsed.metaDescriptions);
      const h = auditHeadings(parsed.headings);
      const d = auditDirectives({
        pageUrl: res.finalUrl,
        canonicalRaw: parsed.canonical,
        metaRobots: parsed.metaRobots,
        xRobotsTag: null,
        statusClass,
      });

      pageRow.title = t.title;
      pageRow.titleLength = t.titleLength;
      pageRow.titlePixelWidth = t.titlePixelWidth;
      pageRow.titleCount = t.titleCount;
      pageRow.titleIssues = t.issues;
      pageRow.titleHash = t.title ? hashStr(t.title) : null;

      pageRow.metaDescription = m.metaDescription;
      pageRow.metaDescLength = m.metaDescLength;
      pageRow.metaDescPixelWidth = m.metaDescPixelWidth;
      pageRow.metaDescCount = m.metaDescCount;
      pageRow.metaIssues = m.issues;
      pageRow.metaDescHash = m.metaDescription ? hashStr(m.metaDescription) : null;

      pageRow.h1 = h.levels.h1;
      pageRow.h1Count = h.counts.h1;
      pageRow.h1Issues = h.issues;
      pageRow.h1Hash = h.levels.h1[0] ? hashStr(h.levels.h1[0]) : null;
      pageRow.h2 = h.levels.h2;
      pageRow.h2Count = h.counts.h2;
      pageRow.h3 = h.levels.h3;
      pageRow.h3Count = h.counts.h3;
      pageRow.h4 = h.levels.h4;
      pageRow.h4Count = h.counts.h4;
      pageRow.h5 = h.levels.h5;
      pageRow.h5Count = h.counts.h5;
      pageRow.h6 = h.levels.h6;
      pageRow.h6Count = h.counts.h6;

      pageRow.datePublished = parsed.datePublished;
      pageRow.dateModified = parsed.dateModified;

      pageRow.canonicalUrl = d.canonicalUrl;
      pageRow.canonicalMismatch = d.canonicalMismatch;
      pageRow.metaRobots = d.metaRobots;
      pageRow.indexability = d.indexability;
      pageRow.indexabilityReason = d.indexabilityReason;
      pageRow.wordCount = parsed.wordCount;

      // Issue counters (per-page; duplicates handled at finalize).
      for (const iss of t.issues) bump(`titles.${iss}`);
      for (const iss of m.issues) bump(`meta.${iss}`);
      for (const iss of h.issues) bump(`headings.${iss}`);
      for (const iss of d.issues) bump(`directives.${iss}`);

      // Links → rows + enqueue.
      const linkRows: Prisma.LinkCreateManyInput[] = [];
      for (const link of parsed.links) {
        linkRows.push({
          crawlId,
          sourcePageId: pageId,
          sourceUrl: url,
          targetUrl: link.targetUrl,
          targetHash: urlHash(link.targetUrl),
          anchorText: link.anchorText || null,
          rel: link.rel,
          target: link.target,
          nofollow: link.nofollow,
          isBlank: (link.target ?? "").toLowerCase() === "_blank",
          isInternal: link.isInternal,
        });
        const skip = link.nofollow && !config.followNofollow;
        if (skip) continue;
        if (link.isInternal) {
          frontier.add(link.targetUrl, depth + 1);
        } else if (config.includeExternal) {
          frontier.add(link.targetUrl, depth + 1);
        }
      }
      writer.addLinks(linkRows);

      // Assets → rows (+ optional status check).
      const assetRows: Prisma.AssetCreateManyInput[] = [];
      for (const asset of parsed.assets) {
        const altAudit = asset.type === "img" ? auditImageAlt(asset.alt) : null;
        let status = { statusCode: 0, statusClass: 0, sizeBytes: 0 };
        if (config.checkAssets) status = await checkAsset(asset.url);
        const isBroken = config.checkAssets && status.statusClass !== 2;
        const altIssues = altAudit ? [...altAudit.issues] : [];
        if (asset.type === "img" && isBroken) altIssues.push("broken");

        if (altAudit) {
          for (const iss of altAudit.issues) bump(`images.${iss}`);
          if (asset.type === "img" && isBroken) bump("images.broken");
        }
        if (isBroken) bump("resources.broken");

        assetRows.push({
          crawlId,
          pageId,
          referrerUrl: url,
          url: asset.url,
          urlHash: urlHash(asset.url),
          type: assetTypeForCheck(asset.type),
          statusCode: config.checkAssets ? status.statusCode || null : null,
          statusClass: status.statusClass,
          sizeBytes: status.sizeBytes || null,
          isBroken,
          altText: altAudit?.altText ?? null,
          altLength: altAudit?.altLength ?? null,
          altIssues,
        });
      }
      writer.addAssets(assetRows);
    } else if (internal && statusClass !== 2) {
      pageRow.indexability = "non-indexable";
      pageRow.indexabilityReason = `HTTP ${res.statusCode || "no response"}`;
    }

    writer.addPage(pageRow);

    if (writer.shouldFlush()) await writer.flush();
    await publishProgress();
  }

  function recordBlockedPage(url: string, depth: number) {
    totalCrawled += 1;
    bumpStatus(0);
    writer.addPage({
      id: randomUUID(),
      crawlId,
      url,
      urlHash: urlHash(url),
      isInternal: true,
      depth,
      statusClass: 0,
      indexability: "non-indexable",
      indexabilityReason: "Blocked by robots.txt",
    });
  }

  // ---- Main pump loop: keep `concurrency` URLs in flight until frontier drains.
  await new Promise<void>((resolve, reject) => {
    let active = 0;
    let settled = false;
    let pumping = false;

    const pump = async () => {
      if (settled || pumping) return;
      pumping = true;
      try {
        if (await deps.isStopped()) stopped = true;
      } catch {
        /* ignore */
      }
      pumping = false;

      if (stopped) {
        if (active === 0) finish();
        return;
      }
      while (active < concurrency) {
        const item = frontier.next();
        if (!item) break;
        active += 1;
        limit(() => processUrl(item.url, item.depth))
          .catch((e) => {
            console.error(`[crawl ${crawlId}] error on ${item.url}:`, e);
          })
          .finally(() => {
            active -= 1;
            void pump();
          });
      }
      if (active === 0 && frontier.pending === 0) finish();
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    void pump().catch(reject);
  });

  await writer.flush();

  // A crawl cut short by a lost browser is a failure, not a user-requested stop: the data
  // is partial through no choice of theirs, and `error` says so on the dashboard.
  if (browserLost) {
    await finalizeIssues(prisma, crawlId, issueCounts);
    await prisma.crawl.update({
      where: { id: crawlId },
      data: { status: "failed", error: browserLost, finishedAt: new Date() },
    });
    await publishProgress("failed", true);
    return;
  }

  if (stopped) {
    await finalizeIssues(prisma, crawlId, issueCounts);
    await prisma.crawl.update({
      where: { id: crawlId },
      data: { status: "stopped", finishedAt: new Date() },
    });
    await publishProgress("stopped", true);
    return;
  }

  // ---- Finalize: inlinks, orphans, duplicates, rollup.
  await computeInlinks(prisma, crawlId);
  await detectOrphans(prisma, crawlId, robots, origin, seed, issueCounts, textFetcher);
  await computeDuplicates(prisma, crawlId, issueCounts);

  await finalizeIssues(prisma, crawlId, issueCounts);
  await prisma.crawl.update({
    where: { id: crawlId },
    data: {
      status: "done",
      finishedAt: new Date(),
      byStatusClass: byStatusClass as Prisma.InputJsonValue,
      totalFound: frontier.admittedCount,
      totalCrawled,
    },
  });
  await publishProgress("done", true);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log(`[crawl ${crawlId}] browser closed.`);
    }
  }
}

/** Recompute Page.inlinkCount from internal Link rows in one UPDATE. */
async function computeInlinks(prisma: PrismaClient, crawlId: string) {
  await prisma.$executeRaw`
    UPDATE "Page" p
    SET "inlinkCount" = sub.c
    FROM (
      SELECT "targetHash", COUNT(*)::int AS c
      FROM "Link"
      WHERE "crawlId" = ${crawlId} AND "isInternal" = true
      GROUP BY "targetHash"
    ) sub
    WHERE p."crawlId" = ${crawlId} AND p."urlHash" = sub."targetHash"`;
}

/** Cross-reference sitemap URLs against crawled pages to flag orphans. */
async function detectOrphans(
  prisma: PrismaClient,
  crawlId: string,
  robots: RobotsCache,
  origin: string,
  seed: string,
  issueCounts: Record<string, number>,
  textFetcher: TextFetcher,
) {
  const declared = await robots.getSitemaps(origin);
  const candidates = declared.length > 0 ? declared : defaultSitemapUrls(origin);
  const sitemapUrls = await collectSitemapUrls(candidates, textFetcher, 50);

  let orphanCount = 0;
  for (const [url, entry] of sitemapUrls) {
    const existing = await prisma.page.findUnique({
      where: { crawlId_url: { crawlId, url } },
      select: { id: true, inlinkCount: true },
    });
    if (existing) {
      const isOrphan = existing.inlinkCount === 0 && url !== seed;
      await prisma.page.update({
        where: { id: existing.id },
        data: { foundViaSitemap: true, isOrphan, sitemapLastmod: entry.lastmod },
      });
      if (isOrphan) orphanCount += 1;
    } else {
      // In sitemap but never linked/crawled → orphan.
      await prisma.page.create({
        data: {
          crawlId,
          url,
          urlHash: urlHash(url),
          isInternal: true,
          foundViaSitemap: true,
          isOrphan: true,
          sitemapLastmod: entry.lastmod,
          statusClass: 0,
          indexability: "indexable",
          indexabilityReason: "In sitemap, not linked internally",
        },
      });
      orphanCount += 1;
    }
  }
  if (orphanCount > 0) issueCounts["pages.orphan"] = orphanCount;
}

/** Count duplicate titles / meta / H1 across the crawl for the issue rollup. */
async function computeDuplicates(
  prisma: PrismaClient,
  crawlId: string,
  issueCounts: Record<string, number>,
) {
  const dupCount = async (column: "titleHash" | "metaDescHash" | "h1Hash") => {
    const rows = await prisma.page.groupBy({
      by: [column],
      where: { crawlId, [column]: { not: null } } as Prisma.PageWhereInput,
      _count: { _all: true },
    });
    return rows.filter((r) => r._count._all > 1).reduce((sum, r) => sum + r._count._all, 0);
  };
  const [titleDup, metaDup, h1Dup] = await Promise.all([
    dupCount("titleHash"),
    dupCount("metaDescHash"),
    dupCount("h1Hash"),
  ]);
  if (titleDup) issueCounts["titles.duplicate"] = titleDup;
  if (metaDup) issueCounts["meta.duplicate"] = metaDup;
  if (h1Dup) issueCounts["headings.h1Duplicate"] = h1Dup;
}

/** Upsert the Issue rollup table from accumulated counts. */
async function finalizeIssues(
  prisma: PrismaClient,
  crawlId: string,
  issueCounts: Record<string, number>,
) {
  const { ISSUE_CATEGORIES } = await import("@/lib/events");
  const sevByKey = new Map(ISSUE_CATEGORIES.map((c) => [c.key, c.severity]));
  const entries = Object.entries(issueCounts).filter(([, v]) => v > 0);
  await Promise.all(
    entries.map(([category, count]) =>
      prisma.issue.upsert({
        where: { crawlId_category: { crawlId, category } },
        create: { crawlId, category, count, severity: sevByKey.get(category) ?? "warning" },
        update: { count },
      }),
    ),
  );
}
