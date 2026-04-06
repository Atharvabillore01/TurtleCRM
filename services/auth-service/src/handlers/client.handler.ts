import { randomUUID } from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "../plugins/redis.js";
import {
  signAccessToken,
  signRefreshToken,
  refreshTokenKey,
  refreshTokenTTLSeconds,
} from "../plugins/jwt.js";
import { publishEvent } from "../plugins/eventbus.js";
import { KafkaTopics } from "@turtle/types";
import { otpConfig } from "@turtle/config";
import type { RequestOTPBody, VerifyOTPBody } from "../schemas/client.schema.js";

const OTP_TTL = otpConfig().expiresSeconds;

// ─── POST /auth/client/request-otp ───────────────────────────────────────────

export async function requestOTP(
  request: FastifyRequest<{ Body: RequestOTPBody }>,
  reply:   FastifyReply
): Promise<void> {
  const { channel, destination } = request.body;
  const requestId = randomUUID();
  const redis     = getRedis();

  // Store a pending OTP request so verify-otp can look it up by requestId
  // Actual OTP is generated and sent by otp-service after consuming the event
  const pendingKey = `otp:pending:${requestId}`;
  await redis.setex(
    pendingKey,
    OTP_TTL,
    JSON.stringify({ channel, destination, verified: false })
  );

  await publishEvent({
    topic:       KafkaTopics.OTPRequested,
    userId:      destination, // userId not known yet at this stage for clients
    channel,
    target:      destination,
    userType:    "client",
    requestedAt: new Date().toISOString(),
  });

  return reply.status(202).send({
    requestId,
    expiresIn:  OTP_TTL,
    message:    `OTP sent via ${channel}`,
  });
}

// ─── POST /auth/client/verify-otp ────────────────────────────────────────────

export async function verifyOTP(
  request: FastifyRequest<{ Body: VerifyOTPBody }>,
  reply:   FastifyReply
): Promise<void> {
  const { requestId, destination, otp } = request.body;
  const redis = getRedis();

  // 1. Look up stored OTP (written by otp-service after consuming the event)
  const otpKey      = `otp:${destination}`;
  const pendingKey  = `otp:pending:${requestId}`;

  const [storedOTP, pendingRaw] = await Promise.all([
    redis.get(otpKey),
    redis.get(pendingKey),
  ]);

  if (!pendingRaw) {
    return reply.status(400).send({ error: "OTP request not found or expired" });
  }

  if (!storedOTP || storedOTP !== otp) {
    return reply.status(400).send({ error: "Invalid or expired OTP" });
  }

  // 2. OTP valid — clean up
  await Promise.all([
    redis.del(otpKey),
    redis.del(pendingKey),
  ]);

  // 3. Resolve or create user via user-service (simplified: use destination as userId)
  const userId    = destination;
  const sessionId = randomUUID();

  // 4. Issue tokens
  const accessToken              = signAccessToken({ userId, userType: "client", role: "client", sessionId });
  const { token: refreshToken, tokenId } = signRefreshToken({ userId, sessionId });

  // 5. Store refresh token in Redis
  await redis.setex(refreshTokenKey(userId, tokenId), refreshTokenTTLSeconds(), sessionId);

  // 6. Publish login success event
  await publishEvent({
    topic:      KafkaTopics.OTPVerified,
    userId,
    channel:    request.body.destination.includes("@") ? "email" : "sms",
    userType:   "client",
    verifiedAt: new Date().toISOString(),
  });

  // 7. Set httpOnly cookie
  reply.setCookie("access_token", accessToken, {
    httpOnly: true,
    secure:   process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   15 * 60,
  });

  return reply.status(200).send({ accessToken, refreshToken, sessionId });
}
