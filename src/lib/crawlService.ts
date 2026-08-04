import { prisma } from "./db";
import { crawlQueue } from "./queue";
import { redis } from "./redis";
import { controlKey, DEFAULT_USER_AGENT, type CrawlConfig } from "./events";
import { hostOf, normalizeUrl } from "@/crawler/url";

/**
 * Create a Crawl row and enqueue the job. Shared by the session-based UI route
 * (`/api/crawls`) and the programmatic API (`/api/v1/crawls`) so creation logic —
 * URL normalisation, User-Agent resolution, webhook capture, queueing — lives in one
 * place.
 */
export async function createCrawl(userId: string, config: CrawlConfig): Promise<string> {
  const seed = normalizeUrl(config.seedUrl);
  if (!seed) throw new Error("Invalid seed URL");

  // User-Agent precedence: an explicit per-crawl UA wins; otherwise (the caller left
  // it at the global default, e.g. the API omitted it) fall back to the user's saved
  // default, then the global default.
  let userAgent = config.userAgent;
  if (!userAgent || userAgent === DEFAULT_USER_AGENT) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultUserAgent: true },
    });
    userAgent = user?.defaultUserAgent?.trim() || DEFAULT_USER_AGENT;
  }

  const finalConfig: CrawlConfig = { ...config, seedUrl: seed, userAgent };

  const crawl = await prisma.crawl.create({
    data: {
      userId,
      seedUrl: seed,
      rootHost: hostOf(seed),
      status: "queued",
      config: finalConfig,
      webhookUrl: finalConfig.webhookUrl ?? null,
    },
    select: { id: true },
  });

  await crawlQueue.add("crawl", { crawlId: crawl.id, config: finalConfig });
  return crawl.id;
}

/**
 * Delete a crawl and all its data. Signals the worker to stop first (in case it's
 * still running) so it doesn't keep writing rows against a deleted crawl; the
 * cascade then removes pages/links/assets/redirects/issues. Idempotent-ish: a
 * missing crawl simply throws from prisma.delete, which callers map to 404.
 */
export async function deleteCrawl(crawlId: string): Promise<void> {
  await redis.set(controlKey(crawlId), "stop", "EX", 60);
  await prisma.crawl.delete({ where: { id: crawlId } });
}
