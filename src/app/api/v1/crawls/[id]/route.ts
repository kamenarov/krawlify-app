import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromApiKey } from "@/lib/apiAuth";
import { deleteCrawl } from "@/lib/crawlService";

type Ctx = { params: Promise<{ id: string }> };

/** Fetch crawl status, counters, and the issue summary (key-authenticated). */
export async function GET(req: Request, { params }: Ctx) {
  const userId = await getUserIdFromApiKey(req);
  if (!userId) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const { id } = await params;

  const crawl = await prisma.crawl.findFirst({
    where: { id, userId },
    select: {
      id: true,
      seedUrl: true,
      status: true,
      totalFound: true,
      totalCrawled: true,
      byStatusClass: true,
      webhookUrl: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  });
  if (!crawl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const issues = await prisma.issue.findMany({
    where: { crawlId: id },
    orderBy: { count: "desc" },
    select: { category: true, severity: true, count: true },
  });

  return NextResponse.json({ crawl, issues });
}

/** Delete a crawl and all its data (key-authenticated). Admins may delete any crawl. */
export async function DELETE(req: Request, { params }: Ctx) {
  const userId = await getUserIdFromApiKey(req);
  if (!userId) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const { id } = await params;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const where = me?.role === "admin" ? { id } : { id, userId };
  const owned = await prisma.crawl.findFirst({ where, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteCrawl(owned.id);
  return NextResponse.json({ ok: true });
}
