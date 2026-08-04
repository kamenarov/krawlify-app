import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(80).nullable().optional(),
  role: z.enum(["admin", "member"]).optional(),
  password: z.string().min(8).optional(),
  disabled: z.boolean().optional(),
});

/** Number of admins who can currently sign in (admin role AND not disabled). */
async function enabledAdminCount(): Promise<number> {
  return prisma.user.count({ where: { role: "admin", disabled: false } });
}

/** Whether a user, in the given state, is an admin who can sign in. */
const isEnabledAdmin = (role: string, disabled: boolean) => role === "admin" && !disabled;

/** PATCH /api/users/:id — admin only: change details / role / password / disabled. */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, disabled: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { email, name, role, password, disabled } = parsed.data;

  // Don't let an admin disable their own account (lockout).
  if (disabled === true && id === me.id) {
    return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
  }

  // Guard: don't drop the number of sign-in-capable admins to zero via demote/disable.
  const wasEnabledAdmin = isEnabledAdmin(target.role, target.disabled);
  const willBeEnabledAdmin = isEnabledAdmin(role ?? target.role, disabled ?? target.disabled);
  if (wasEnabledAdmin && !willBeEnabledAdmin && (await enabledAdminCount()) <= 1) {
    return NextResponse.json(
      { error: "Cannot demote or disable the last active admin" },
      { status: 400 },
    );
  }

  if (email) {
    const clash = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), id: { not: id } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (email !== undefined) data.email = email.toLowerCase();
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (disabled !== undefined) data.disabled = disabled;
  if (password !== undefined) data.passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, disabled: true, createdAt: true },
  });
  return NextResponse.json({ user });
}

/**
 * DELETE /api/users/:id — admin only. Permanently removes the user AND all their data:
 * the User row cascades to their crawls (and each crawl's pages/links/assets/redirects/
 * issues) plus their API keys.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (id === me.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, disabled: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isEnabledAdmin(target.role, target.disabled) && (await enabledAdminCount()) <= 1) {
    return NextResponse.json({ error: "Cannot delete the last active admin" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
