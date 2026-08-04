import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeCrawl } from "@/lib/ownership";
import { queryTab } from "@/lib/tabs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const q = url.searchParams;
  try {
    const result = await queryTab(prisma, {
      crawlId,
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
