import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromApiKey } from "@/lib/apiAuth";
import { queryTab } from "@/lib/tabs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Fetch result rows for a crawl tab (key-authenticated, paginated/filtered).
 * Query params: tab, filter, search, page, pageSize, sortBy, sortDir.
 */
export async function GET(req: Request, { params }: Ctx) {
  const userId = await getUserIdFromApiKey(req);
  if (!userId) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const { id } = await params;

  const owned = await prisma.crawl.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  try {
    const result = await queryTab(prisma, {
      crawlId: id,
      tab: q.get("tab") ?? "internal",
      filter: q.get("filter") ?? "all",
      search: q.get("search") ?? undefined,
      page: q.get("page") ? Number(q.get("page")) : 1,
      pageSize: q.get("pageSize") ? Number(q.get("pageSize")) : 100,
      sortBy: q.get("sortBy") ?? undefined,
      sortDir: (q.get("sortDir") as "asc" | "desc") ?? "asc",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query failed" },
      { status: 400 },
    );
  }
}
