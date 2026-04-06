import type { FastifyInstance } from "fastify";
import { googleRedirect, googleCallback } from "../handlers/oauth.handler.js";

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/oauth/google", googleRedirect);

  app.get(
    "/auth/oauth/google/callback",
    async (request, reply) => {
      return googleCallback(request as any, reply);
    }
  );
}
