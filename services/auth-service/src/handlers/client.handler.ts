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
const OTP_SERVICE_URL = process.env["OTP_SERVICE_URL"] ?? "http://otp-service:4001";

async function verifyOTPWithService(body: {
  channel: "sms" | "email";
  destination: string;
  otp: string;
  userId: string;
  userType: "client" | "advisor";
}): Promise<{ valid: boolean; error?: string; attemptsLeft?: number; reason?: string }> {
  const res = await fetch(`${OTP_SERVICE_URL}/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { valid?: boolean; error?: string; attemptsLeft?: number; reason?: string };
  if (res.ok) {
    return { valid: true };
  }

  return {
    valid: false,
    error: data.error ?? "Invalid or expired OTP",
    attemptsLeft: data.attemptsLeft,
    reason: data.reason,
  };
}

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

  const pendingKey  = `otp:pending:${requestId}`;

  const pendingRaw = await redis.get(pendingKey);

  if (!pendingRaw) {
    return reply.status(400).send({ error: "OTP request not found or expired" });
  }

  const pending = JSON.parse(pendingRaw) as {
    channel: "sms" | "email";
    destination: string;
    verified: boolean;
  };

  if (pending.destination !== destination) {
    return reply.status(400).send({ error: "Destination does not match OTP request" });
  }

  const verification = await verifyOTPWithService({
    channel: pending.channel,
    destination,
    otp,
    userId: destination,
    userType: "client",
  });

  if (!verification.valid) {
    return reply.status(
      verification.reason === "max_attempts" ? 429 : 400
    ).send({
      error: verification.error ?? "Invalid or expired OTP",
      attemptsLeft: verification.attemptsLeft,
      reason: verification.reason,
    });
  }

  // 2. OTP valid — clean up
  await redis.del(pendingKey);

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
    channel:    pending.channel,
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
