import { prisma } from "@/lib/db";
import { authorizeCrawl } from "@/lib/ownership";
import { createSubscriber } from "@/lib/redis";
import { progressChannel, type CrawlProgressEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * SSE endpoint. On connect: send a DB snapshot (so reloads show current state),
 * then subscribe to the crawl's Redis pub/sub channel and forward every event.
 * A heartbeat comment keeps proxies from closing the idle connection. Closes when
 * the client disconnects or a terminal event arrives.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const sub = createSubscriber();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: CrawlProgressEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));

      // Initial snapshot from the DB.
      const [crawl, issues] = await Promise.all([
        prisma.crawl.findUnique({ where: { id: crawlId } }),
        prisma.issue.findMany({ where: { crawlId } }),
      ]);
      if (crawl) {
        const issueCounts: Record<string, number> = {};
        for (const i of issues) issueCounts[i.category] = i.count;
        send({
          type: "snapshot",
          crawlId,
          status: crawl.status,
          totalFound: crawl.totalFound,
          totalCrawled: crawl.totalCrawled,
          byStatusClass: (crawl.byStatusClass as Record<string, number>) ?? {},
          issueCounts,
          at: Date.now(),
        });
        // If already finished, no point subscribing.
        if (["done", "failed", "stopped"].includes(crawl.status)) {
          controller.close();
          await sub.quit();
          return;
        }
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);

      await sub.subscribe(progressChannel(crawlId));
      sub.on("message", (_channel, message) => {
        try {
          const evt = JSON.parse(message) as CrawlProgressEvent;
          send(evt);
          if (["done", "failed", "stopped"].includes(evt.type)) {
            clearInterval(heartbeat);
            controller.close();
            void sub.quit();
          }
        } catch {
          /* ignore malformed */
        }
      });

      const cleanup = () => {
        clearInterval(heartbeat);
        void sub.quit();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      void sub.quit();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
