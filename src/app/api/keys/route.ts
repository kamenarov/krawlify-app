import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/apiKeys";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json({ keys });
}

const createSchema = z.object({ name: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }

  const raw = generateApiKey();
  const created = await prisma.apiKey.create({
    data: { userId, name: parsed.data.name, prefix: keyPrefix(raw), keyHash: hashApiKey(raw) },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  // Plaintext key is returned exactly once — it cannot be retrieved again.
  return NextResponse.json({ ...created, key: raw }, { status: 201 });
}
