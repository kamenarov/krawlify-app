import { PrismaClient } from "@prisma/client";

// Prisma singleton — avoids exhausting DB connections during dev hot-reload and is
// shared by both the Next.js process and the worker process.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
