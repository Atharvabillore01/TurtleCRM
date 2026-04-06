import type { FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "../plugins/redis.js";

interface RateLimitOptions {
  /**  max requests allowed in the window */
  max:        number;
  /** window size in seconds */
  windowSecs: number;
  /** key prefix, e.g. "otp_req" */
  prefix:     string;
  /** pull the limiting key from the body field (e.g. "destination") in addition to IP */
  bodyField?: string;
}

export function createRateLimiter(opts: RateLimitOptions) {
  return async function rateLimitHook(
    request: FastifyRequest,
    reply:   FastifyReply
  ): Promise<void> {
    const redis = getRedis();
    const ip    = request.ip;

    const keys: string[] = [`rl:${opts.prefix}:ip:${ip}`];

    if (opts.bodyField) {
      const body = request.body as Record<string, unknown> | undefined;
      const field = body?.[opts.bodyField];
      if (typeof field === "string" && field) {
        keys.push(`rl:${opts.prefix}:dest:${field}`);
      }
    }

    for (const key of keys) {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, opts.windowSecs);
      }
      if (current > opts.max) {
        const ttl = await redis.ttl(key);
        reply.header("Retry-After", String(ttl));
        return reply.status(429).send({
          error:      "Too many requests",
          retryAfter: ttl,
        });
      }
    }
  };
}

// Pre-built limiters
export const otpRequestLimiter = createRateLimiter({
  prefix:     "otp_req",
  max:        5,
  windowSecs: 60 * 10, // 5 requests per 10 min per IP + per destination
  bodyField:  "destination",
});

export const loginLimiter = createRateLimiter({
  prefix:     "login",
  max:        10,
  windowSecs: 60 * 5, // 10 attempts per 5 min per IP
});
