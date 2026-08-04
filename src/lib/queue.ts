import { Queue, type ConnectionOptions } from "bullmq";
import { bullConnection } from "./redis";
import type { CrawlConfig } from "./events";

export const CRAWL_QUEUE = "crawls";

export interface CrawlJobData {
  crawlId: string;
  config: CrawlConfig;
}

// BullMQ bundles its own ioredis copy, so a shared instance is nominally a
// different type — cast to ConnectionOptions (BullMQ accepts an ioredis instance).
export const bullConnectionOptions = bullConnection as unknown as ConnectionOptions;

const globalForQueue = globalThis as unknown as {
  crawlQueue?: Queue<CrawlJobData, void, string>;
};

export const crawlQueue: Queue<CrawlJobData, void, string> =
  globalForQueue.crawlQueue ??
  new Queue<CrawlJobData, void, string>(CRAWL_QUEUE, {
    connection: bullConnectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600 },
    },
  });

if (process.env.NODE_ENV !== "production") globalForQueue.crawlQueue = crawlQueue;
