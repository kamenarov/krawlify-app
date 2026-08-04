import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export type Role = "admin" | "member";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || user.disabled) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      // Re-read role + existence from the DB each time so role changes and account
      // deletions take effect immediately (no stale-session admin access).
      if (token.uid && session.user) {
        const u = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { id: true, email: true, name: true, role: true, disabled: true },
        });
        if (u && !u.disabled) {
          session.user.id = u.id;
          session.user.email = u.email;
          session.user.name = u.name;
          (session.user as { role?: Role }).role = u.role;
        } else {
          // User was deleted or disabled — drop identity (reads as unauthenticated).
          session.user = undefined;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export interface CurrentUser {
  id: string;
  role: Role;
}

/** Authenticated user (id + role) from the session, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; role?: string } | undefined;
  if (!u?.id) return null;
  return { id: u.id, role: u.role === "admin" ? "admin" : "member" };
}

/** Convenience: just the user id (used to scope queries). */
export async function getCurrentUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}
