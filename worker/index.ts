/**
 * Standalone crawl worker. Run with `npm run worker` (dev) or `npm run worker:start`.
 * Consumes BullMQ jobs from the `crawls` queue and drives the crawl engine, which
 * streams page data into Postgres and publishes progress to Redis pub/sub.
 *
 * This is a separate process from the Next.js app so heavy crawling never blocks the
 * web event loop and crawls survive web restarts.
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { CRAWL_QUEUE, bullConnectionOptions, type CrawlJobData } from "../src/lib/queue";
import { redis } from "../src/lib/redis";
import { prisma } from "../src/lib/db";
import { controlKey, progressChannel, type CrawlProgressEvent } from "../src/lib/events";
import { runCrawl } from "../src/crawler/engine";
import { deliverCrawlWebhook } from "../src/lib/webhook";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 3); // parallel crawls

const worker = new Worker<CrawlJobData>(
  CRAWL_QUEUE,
  async (job: Job<CrawlJobData>) => {
    const { crawlId, config } = job.data;
    console.log(`[worker] starting crawl ${crawlId} → ${config.seedUrl}`);

    // Clear any stale stop flag from a previous run.
    await redis.del(controlKey(crawlId));

    const isStopped = async () => (await redis.get(controlKey(crawlId))) === "stop";

    try {
      await runCrawl(crawlId, config, { prisma, redis, isStopped });
      console.log(`[worker] finished crawl ${crawlId}`);
      // Fire the completion webhook for done/stopped terminal states.
      await deliverCrawlWebhook(prisma, crawlId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] crawl ${crawlId} failed:`, message);
      await prisma.crawl.update({
        where: { id: crawlId },
        data: { status: "failed", error: message, finishedAt: new Date() },
      });
      const evt: CrawlProgressEvent = {
        type: "failed",
        crawlId,
        status: "failed",
        totalFound: 0,
        totalCrawled: 0,
        byStatusClass: {},
        issueCounts: {},
        error: message,
        at: Date.now(),
      };
      await redis.publish(progressChannel(crawlId), JSON.stringify(evt));
      // Notify the webhook of the failure too.
      await deliverCrawlWebhook(prisma, crawlId);
      throw err;
    } finally {
      await redis.del(controlKey(crawlId));
    }
  },
  { connection: bullConnectionOptions, concurrency },
);

worker.on("ready", () => console.log(`[worker] ready (concurrency=${concurrency})`));
worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));

async function shutdown() {
  console.log("[worker] shutting down…");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
