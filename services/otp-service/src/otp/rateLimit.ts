import type Redis from "ioredis";

const MAX_REQUESTS  = 3;
const WINDOW_SECS   = 15 * 60; // 15 minutes

export interface RateLimitResult {
  allowed:     boolean;
  retryAfter?: number; // seconds
}

export async function checkRateLimit(
  redis:       Redis,
  destination: string
): Promise<RateLimitResult> {
  const key     = `otprate:${destination}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, WINDOW_SECS);
  }

  if (current > MAX_REQUESTS) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: ttl };
  }

  return { allowed: true };
}
