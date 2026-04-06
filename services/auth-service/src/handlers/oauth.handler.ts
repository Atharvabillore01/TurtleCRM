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
import { oauthConfig } from "@turtle/config";

interface GoogleProfile {
  id:          string;
  email:       string;
  displayName: string;
  photos?:     Array<{ value: string }>;
}

// Build Google OAuth redirect URL manually (no passport dependency at handler level)
export async function googleRedirect(
  _request: FastifyRequest,
  reply:    FastifyReply
): Promise<void> {
  const cfg    = oauthConfig();
  const params = new URLSearchParams({
    client_id:     cfg.google.clientId,
    redirect_uri:  cfg.google.callbackUrl,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "offline",
    prompt:        "consent",
  });
  return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// ─── GET /auth/oauth/google/callback ─────────────────────────────────────────

export async function googleCallback(
  request: FastifyRequest<{ Querystring: { code?: string; error?: string } }>,
  reply:   FastifyReply
): Promise<void> {
  const { code, error } = request.query;
  const cfg             = oauthConfig();
  const ip              = request.ip;
  const userAgent       = request.headers["user-agent"] ?? "";

  if (error || !code) {
    return reply.redirect(`${process.env["ADVISOR_APP_URL"] ?? "http://localhost:3001"}/auth/error?reason=oauth_denied`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     cfg.google.clientId,
      client_secret: cfg.google.clientSecret,
      redirect_uri:  cfg.google.callbackUrl,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return reply.status(502).send({ error: "Failed to exchange OAuth code" });
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch Google profile
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileRes.ok) {
    return reply.status(502).send({ error: "Failed to fetch Google profile" });
  }

  const profile = (await profileRes.json()) as {
    sub: string; email: string; name: string;
  };

  const googleProfile: GoogleProfile = {
    id:          profile.sub,
    email:       profile.email,
    displayName: profile.name,
  };

  // Resolve advisor by Google ID (stub — replace with user-service call)
  const userId    = `google:${googleProfile.id}`;
  const sessionId = randomUUID();
  const redis     = getRedis();

  // Issue tokens
  const accessToken = signAccessToken({
    userId,
    userType:  "advisor",
    role:      "advisor",
    sessionId,
  });
  const { token: refreshToken, tokenId } = signRefreshToken({ userId, sessionId });

  await redis.setex(refreshTokenKey(userId, tokenId), refreshTokenTTLSeconds(), sessionId);

  await publishEvent({
    topic:      KafkaTopics.LoginSuccess,
    userId,
    userType:   "advisor",
    authMethod: "oauth",
    sessionId,
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

  // Redirect back to advisor app with refresh token in query (app stores it)
  const redirectUrl = new URL(`${process.env["ADVISOR_APP_URL"] ?? "http://localhost:3001"}/auth/callback`);
  redirectUrl.searchParams.set("refresh_token", refreshToken);
  return reply.redirect(redirectUrl.toString());
}
