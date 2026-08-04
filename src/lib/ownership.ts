import { prisma } from "./db";
import { getCurrentUser } from "./auth";

/**
 * Authorize access to a crawl. Members may only touch their own crawls; admins may
 * access any crawl (to view other users' data). Returns the crawl id if authorised,
 * otherwise null — callers translate null into 401/404.
 */
export async function authorizeCrawl(crawlId: string): Promise<string | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  const where = me.role === "admin" ? { id: crawlId } : { id: crawlId, userId: me.id };
  const crawl = await prisma.crawl.findFirst({ where, select: { id: true } });
  return crawl?.id ?? null;
}
