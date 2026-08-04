import { Redis } from "ioredis";

// Redis connections. BullMQ requires `maxRetriesPerRequest: null` on its connection.
// We keep separate clients for: BullMQ (queue/worker), a shared command client
// (control flags / publishing), and lazily-created subscriber clients (pub/sub is
// blocking, so each SSE subscription gets its own connection).

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const globalForRedis = globalThis as unknown as {
  redisCmd?: Redis;
  redisBull?: Redis;
};

/** General command client: SET/GET/PUBLISH. Safe to share. */
export const redis =
  globalForRedis.redisCmd ?? new Redis(REDIS_URL, { maxRetriesPerRequest: null });

/** Dedicated connection for BullMQ Queue/Worker. */
export const bullConnection =
  globalForRedis.redisBull ?? new Redis(REDIS_URL, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisCmd = redis;
  globalForRedis.redisBull = bullConnection;
}

/** Create a fresh subscriber connection (caller is responsible for quitting it). */
export function createSubscriber(): Redis {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
}
