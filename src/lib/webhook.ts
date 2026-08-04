import type { PrismaClient } from "@prisma/client";
import { PRODUCT_NAME, PRODUCT_URL } from "./brand";

/**
 * Deliver the crawl-completion webhook (best-effort, fire-and-forget semantics).
 * POSTs a JSON summary to the crawl's webhookUrl when it reaches a terminal state.
 * Failures are logged but never bubble up — a bad webhook must not fail the crawl.
 * `webhookDelivered` guards against double-delivery (e.g. retried jobs).
 */
export async function deliverCrawlWebhook(prisma: PrismaClient, crawlId: string): Promise<void> {
  const crawl = await prisma.crawl.findUnique({
    where: { id: crawlId },
    select: {
      id: true,
      seedUrl: true,
      status: true,
      webhookUrl: true,
      webhookDelivered: true,
      totalFound: true,
      totalCrawled: true,
      byStatusClass: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  });
  if (!crawl?.webhookUrl || crawl.webhookDelivered) return;

  const issues = await prisma.issue.findMany({
    where: { crawlId },
    select: { category: true, severity: true, count: true },
  });

  const payload = {
    event: "crawl.completed",
    crawl: {
      id: crawl.id,
      seedUrl: crawl.seedUrl,
      status: crawl.status,
      totalFound: crawl.totalFound,
      totalCrawled: crawl.totalCrawled,
      byStatusClass: crawl.byStatusClass,
      startedAt: crawl.startedAt,
      finishedAt: crawl.finishedAt,
      error: crawl.error,
    },
    issues,
  };

  try {
    const res = await fetch(crawl.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `${PRODUCT_NAME}-Webhook/1.0 (+${PRODUCT_URL})`,
        // Renamed from X-Crawer-Event with the product; consumers that switch on the
        // header name need updating, the JSON body's `event` field is unchanged.
        "X-Krawlify-Event": "crawl.completed",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[webhook] crawl ${crawlId} → ${crawl.webhookUrl} [${res.status}]`);
  } catch (err) {
    console.error(
      `[webhook] crawl ${crawlId} delivery failed:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    // Mark delivered regardless of HTTP outcome so we don't spam on retries.
    await prisma.crawl
      .update({ where: { id: crawlId }, data: { webhookDelivered: true } })
      .catch(() => {});
  }
}
