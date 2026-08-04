import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { crawlConfigSchema } from "@/lib/events";
import { createCrawl } from "@/lib/crawlService";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const crawls = await prisma.crawl.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      seedUrl: true,
      status: true,
      totalFound: true,
      totalCrawled: true,
      byStatusClass: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return NextResponse.json({ crawls });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = crawlConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid config" }, { status: 400 });
  }
  try {
    const id = await createCrawl(userId, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create crawl" },
      { status: 400 },
    );
  }
}
