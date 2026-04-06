import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
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
import type { AdvisorLoginBody, AdvisorVerifyOTPBody } from "../schemas/advisor.schema.js";

const OTP_TTL = otpConfig().expiresSeconds;

// Stub: replace with actual user-service call
async function findAdvisorByUsername(
  username: string
): Promise<{ id: string; username: string; passwordHash: string; role: string; otpChannel: "sms" | "email"; otpTarget: string } | null> {
  void username;
  return null; // user-service will provide this
}

// ─── POST /auth/advisor/login ─────────────────────────────────────────────────

export async function advisorLogin(
  request: FastifyRequest<{ Body: AdvisorLoginBody }>,
  reply:   FastifyReply
): Promise<void> {
  const { username, password } = request.body;
  const ip        = request.ip;
  const userAgent = request.headers["user-agent"] ?? "";

  const advisor = await findAdvisorByUsername(username);

  if (!advisor) {
    await publishEvent({
      topic:      KafkaTopics.LoginFailed,
      userId:     null,
      userType:   "advisor",
      authMethod: "password",
      reason:     "user_not_found",
      ip,
      userAgent,
      failedAt:   new Date().toISOString(),
    });
    // Constant-time response — don't reveal whether user exists
    await bcrypt.compare(password, "$2b$12$invalidhashpadding000000000000000000000000000000000000");
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  const passwordValid = await bcrypt.compare(password, advisor.passwordHash);

  if (!passwordValid) {
    await publishEvent({
      topic:      KafkaTopics.LoginFailed,
      userId:     advisor.id,
      userType:   "advisor",
      authMethod: "password",
      reason:     "invalid_password",
      ip,
      userAgent,
      failedAt:   new Date().toISOString(),
    });
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  // Password valid — trigger OTP 2FA
  const sessionId = randomUUID();
  const redis     = getRedis();

  // Store session pending OTP verification
  const sessionKey = `advisor:session:${sessionId}`;
  await redis.setex(
    sessionKey,
    OTP_TTL,
    JSON.stringify({ advisorId: advisor.id, role: advisor.role, step: "awaiting_otp" })
  );

  // Publish OTP requested — otp-service will send to advisor's registered channel
  await publishEvent({
    topic:       KafkaTopics.OTPRequested,
    userId:      advisor.id,
    channel:     advisor.otpChannel,
    target:      advisor.otpTarget,
    userType:    "advisor",
    requestedAt: new Date().toISOString(),
  });

  return reply.status(200).send({
    sessionId,
    message:   `OTP sent via ${advisor.otpChannel}`,
    expiresIn: OTP_TTL,
  });
}

// ─── POST /auth/advisor/verify-otp ───────────────────────────────────────────

export async function advisorVerifyOTP(
  request: FastifyRequest<{ Body: AdvisorVerifyOTPBody }>,
  reply:   FastifyReply
): Promise<void> {
  const { sessionId, otp } = request.body;
  const redis              = getRedis();
  const ip                 = request.ip;
  const userAgent          = request.headers["user-agent"] ?? "";

  // 1. Load pending session
  const sessionKey = `advisor:session:${sessionId}`;
  const sessionRaw = await redis.get(sessionKey);

  if (!sessionRaw) {
    return reply.status(400).send({ error: "Session not found or expired. Please log in again." });
  }

  const session = JSON.parse(sessionRaw) as {
    advisorId: string;
    role:      string;
    step:      string;
  };

  if (session.step !== "awaiting_otp") {
    return reply.status(400).send({ error: "Invalid session state" });
  }

  // 2. Validate OTP (written by otp-service for this advisorId)
  const otpKey   = `otp:${session.advisorId}`;
  const storedOTP = await redis.get(otpKey);

  if (!storedOTP || storedOTP !== otp) {
    return reply.status(400).send({ error: "Invalid or expired OTP" });
  }

  // 3. Clean up
  await Promise.all([redis.del(otpKey), redis.del(sessionKey)]);

  // 4. Issue tokens
  const newSessionId = randomUUID();
  const accessToken  = signAccessToken({
    userId:    session.advisorId,
    userType:  "advisor",
    role:      session.role,
    sessionId: newSessionId,
  });
  const { token: refreshToken, tokenId } = signRefreshToken({
    userId:    session.advisorId,
    sessionId: newSessionId,
  });

  await redis.setex(
    refreshTokenKey(session.advisorId, tokenId),
    refreshTokenTTLSeconds(),
    newSessionId
  );

  await publishEvent({
    topic:      KafkaTopics.LoginSuccess,
    userId:     session.advisorId,
    userType:   "advisor",
    authMethod: "otp",
    sessionId:  newSessionId,
    ip,
    userAgent,
    loggedInAt: new Date().toISOString(),
  });

  reply.setCookie("access_token", accessToken, {
    httpOnly: true,
    secure:   process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   15 * 60,
  });

  return reply.status(200).send({ accessToken, refreshToken, sessionId: newSessionId });
}
