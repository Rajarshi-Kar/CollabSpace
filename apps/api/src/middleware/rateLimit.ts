import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../lib/redis.js';

// Redis-backed rather than in-memory so the limit is shared across API
// instances behind a load balancer — an in-memory limiter would let a
// client get N requests per instance instead of N requests total.
function redisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as never,
  });
}

// Auth endpoints are the primary brute-force / credential-stuffing surface,
// so they get a tighter window than general API traffic.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:auth:'),
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:api:'),
});
