import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../plugins/jwt.js";
import type { JWTPayload } from "@turtle/types";

declare module "fastify" {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const cookieToken = (request as any).cookies?.access_token as string | undefined;

  const raw = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : cookieToken;

  if (!raw) {
    return reply.status(401).send({ error: "Missing access token" });
  }

  try {
    request.user = verifyAccessToken(raw);
  } catch {
    return reply.status(401).send({ error: "Invalid or expired access token" });
  }
}
