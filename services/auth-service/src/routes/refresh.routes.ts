import type { FastifyInstance } from "fastify";
import { refreshTokens, logout } from "../handlers/refresh.handler.js";
import { z } from "zod";

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

const LogoutBodySchema = z.object({
  refreshToken: z.string().optional(),
});

export async function refreshRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/refresh", async (request, reply) => {
    const body = RefreshBodySchema.parse(request.body);
    request.body = body;
    return refreshTokens(request as any, reply);
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = LogoutBodySchema.parse(request.body);
    request.body = body;
    return logout(request as any, reply);
  });
}
