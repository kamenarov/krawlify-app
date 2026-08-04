import { prisma } from "./db";
import { hashApiKey } from "./apiKeys";

/**
 * Resolve the user behind an API key on a programmatic request. Accepts either
 * `Authorization: Bearer <key>` or an `X-API-Key: <key>` header. Returns the user id
 * or null. Updates lastUsedAt best-effort (non-blocking).
 */
export async function getUserIdFromApiKey(req: Request): Promise<string | null> {
  const headerKey = req.headers.get("x-api-key");
  const auth = req.headers.get("authorization");
  let key = headerKey?.trim() ?? "";
  if (!key && auth?.toLowerCase().startsWith("bearer ")) key = auth.slice(7).trim();
  if (!key) return null;

  const rec = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: { id: true, userId: true },
  });
  if (!rec) return null;

  void prisma.apiKey
    .update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return rec.userId;
}
