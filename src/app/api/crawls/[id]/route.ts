import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeCrawl } from "@/lib/ownership";
import { redis } from "@/lib/redis";
import { controlKey } from "@/lib/events";
import { deleteCrawl } from "@/lib/crawlService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [crawl, issues] = await Promise.all([
    prisma.crawl.findUnique({ where: { id: crawlId } }),
    prisma.issue.findMany({ where: { crawlId }, orderBy: { count: "desc" } }),
  ]);
  return NextResponse.json({ crawl, issues });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (body?.action === "stop") {
    await redis.set(controlKey(crawlId), "stop", "EX", 3600);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteCrawl(crawlId);
  return NextResponse.json({ ok: true });
}
