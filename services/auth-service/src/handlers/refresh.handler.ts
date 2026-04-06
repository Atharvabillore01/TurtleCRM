import { randomUUID } from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "../plugins/redis.js";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
  refreshTokenKey,
  refreshTokenTTLSeconds,
} from "../plugins/jwt.js";
import { publishEvent } from "../plugins/eventbus.js";
import { KafkaTopics } from "@turtle/types";

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

export async function refreshTokens(
  request: FastifyRequest<{ Body: { refreshToken: string } }>,
  reply:   FastifyReply
): Promise<void> {
  const { refreshToken } = request.body;

  if (!refreshToken) {
    return reply.status(400).send({ error: "refreshToken is required" });
  }

  // 1. Verify signature + expiry
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return reply.status(401).send({ error: "Invalid or expired refresh token" });
  }

  const { userId, sessionId, tokenId } = payload;
  const redis = getRedis();
  const key   = refreshTokenKey(userId, tokenId);

  // 2. Check token exists in Redis (guards against reuse after logout or rotation)
  const stored = await redis.get(key);
  if (!stored) {
    return reply.status(401).send({ error: "Refresh token revoked or already used" });
  }

  // 3. Delete old token (rotation — one-time use)
  await redis.del(key);

  // 4. Issue new pair
  const newSessionId = randomUUID();

  // Fetch user role — stub: read from old session or user-service
  // For now carry the same role from the stored session value
  const newAccessToken = signAccessToken({
    userId,
    userType:  sessionId.includes("advisor") ? "advisor" : "client", // stub
    role:      "client",
    sessionId: newSessionId,
  });

  const { token: newRefreshToken, tokenId: newTokenId } = signRefreshToken({
    userId,
    sessionId: newSessionId,
  });

  await redis.setex(refreshTokenKey(userId, newTokenId), refreshTokenTTLSeconds(), newSessionId);

  await publishEvent({
    topic:       KafkaTopics.TokenRefreshed,
    userId,
    sessionId:   newSessionId,
    refreshedAt: new Date().toISOString(),
  });

  reply.setCookie("access_token", newAccessToken, {
    httpOnly: true,
    secure:   process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   15 * 60,
  });

  return reply.status(200).send({
    accessToken:  newAccessToken,
    refreshToken: newRefreshToken,
  });
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────

export async function logout(
  request: FastifyRequest<{ Body: { refreshToken: string } }>,
  reply:   FastifyReply
): Promise<void> {
  const { refreshToken } = request.body;

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const key     = refreshTokenKey(payload.userId, payload.tokenId);
      await getRedis().del(key);
    } catch {
      // Token already invalid — still clear cookie
    }
  }

  reply.clearCookie("access_token", { path: "/" });
  return reply.status(200).send({ message: "Logged out" });
}
