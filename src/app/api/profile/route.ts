import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { DEFAULT_USER_AGENT } from "@/lib/events";

/** GET the current user's profile prefs + the global UA fallback (for placeholders). */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, defaultUserAgent: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...user, fallbackUserAgent: DEFAULT_USER_AGENT });
}

const patchSchema = z.object({
  // Empty string clears the saved default (falls back to the global default).
  defaultUserAgent: z.string().max(512).nullable().optional(),
});

/** PATCH the current user's profile prefs (currently the default User-Agent). */
export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const raw = parsed.data.defaultUserAgent;
  const defaultUserAgent = raw && raw.trim() ? raw.trim() : null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { defaultUserAgent },
    select: { email: true, name: true, defaultUserAgent: true },
  });
  return NextResponse.json({ ...user, fallbackUserAgent: DEFAULT_USER_AGENT });
}
