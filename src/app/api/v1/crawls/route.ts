import { NextResponse } from "next/server";
import { getUserIdFromApiKey } from "@/lib/apiAuth";
import { crawlConfigSchema } from "@/lib/events";
import { createCrawl } from "@/lib/crawlService";

/**
 * Programmatic crawl creation. Authenticate with an API key:
 *   Authorization: Bearer <key>   (or)   X-API-Key: <key>
 * Body is the crawl config (seedUrl required; sensible defaults otherwise) plus an
 * optional webhookUrl. Returns { id, status, statusUrl }.
 */
export async function POST(req: Request) {
  const userId = await getUserIdFromApiKey(req);
  if (!userId) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = crawlConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid config", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const id = await createCrawl(userId, parsed.data);
    const base = new URL(req.url).origin;
    return NextResponse.json(
      { id, status: "queued", statusUrl: `${base}/api/v1/crawls/${id}` },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create crawl" },
      { status: 400 },
    );
  }
}
