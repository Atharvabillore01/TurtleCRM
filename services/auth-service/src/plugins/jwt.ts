import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { JWTPayload, RefreshTokenPayload, UserType } from "@turtle/types";
import { jwtConfig } from "@turtle/config";

const cfg = jwtConfig();

// ─── Access Token ─────────────────────────────────────────────────────────────

export interface SignAccessTokenInput {
  userId:   string;
  userType: UserType;
  role:     string;
  sessionId: string;
}

export function signAccessToken(input: SignAccessTokenInput): string {
  const payload: Omit<JWTPayload, "iat" | "exp"> = {
    userId:    input.userId,
    userType:  input.userType,
    role:      input.role,
    sessionId: input.sessionId,
  };
  return jwt.sign(payload, cfg.secret, { expiresIn: cfg.expiresIn } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, cfg.secret) as JWTPayload;
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

export interface SignRefreshTokenInput {
  userId:    string;
  sessionId: string;
}

export interface SignedRefreshToken {
  token:   string;
  tokenId: string;
}

export function signRefreshToken(input: SignRefreshTokenInput): SignedRefreshToken {
  const tokenId = randomUUID();
  const payload: Omit<RefreshTokenPayload, "iat" | "exp"> = {
    userId:    input.userId,
    sessionId: input.sessionId,
    tokenId,
  };
  const token = jwt.sign(payload, cfg.refreshTokenSecret, {
    expiresIn: cfg.refreshTokenExpiresIn,
  } as jwt.SignOptions);
  return { token, tokenId };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, cfg.refreshTokenSecret) as RefreshTokenPayload;
}

// ─── Redis key helper ─────────────────────────────────────────────────────────

export function refreshTokenKey(userId: string, tokenId: string): string {
  return `refresh:${userId}:${tokenId}`;
}

// TTL in seconds parsed from e.g. "7d"
export function refreshTokenTTLSeconds(): number {
  const raw = cfg.refreshTokenExpiresIn;
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 3600;
  const n = parseInt(match[1]!, 10);
  switch (match[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default:  return 7 * 86400;
  }
}
