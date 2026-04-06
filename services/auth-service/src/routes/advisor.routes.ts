import type { FastifyInstance } from "fastify";
import { advisorLogin, advisorVerifyOTP } from "../handlers/advisor.handler.js";
import { loginLimiter } from "../middleware/rateLimit.js";
import { AdvisorLoginSchema, AdvisorVerifyOTPSchema } from "../schemas/advisor.schema.js";

export async function advisorRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/advisor/login",
    { preHandler: [loginLimiter] },
    async (request, reply) => {
      const body = AdvisorLoginSchema.parse(request.body);
      request.body = body;
      return advisorLogin(request as any, reply);
    }
  );

  app.post(
    "/auth/advisor/verify-otp",
    async (request, reply) => {
      const body = AdvisorVerifyOTPSchema.parse(request.body);
      request.body = body;
      return advisorVerifyOTP(request as any, reply);
    }
  );
}
