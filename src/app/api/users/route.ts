import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/users — admin only: list all users with their crawl counts. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabled: true,
      createdAt: true,
      _count: { select: { crawls: true } },
    },
  });
  return NextResponse.json({ users, currentUserId: me.id });
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(80).optional(),
  role: z.enum(["admin", "member"]).default("member"),
});

/** POST /api/users — admin only: create a user. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { email, password, name, role } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), name, role },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json({ user }, { status: 201 });
}
