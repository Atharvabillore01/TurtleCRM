import type { FastifyInstance } from "fastify";
import { requestOTP, verifyOTP } from "../handlers/client.handler.js";
import { otpRequestLimiter } from "../middleware/rateLimit.js";
import { RequestOTPSchema, VerifyOTPSchema } from "../schemas/client.schema.js";
import { z } from "zod";

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/client/request-otp",
    { preHandler: [otpRequestLimiter] },
    async (request, reply) => {
      const body = RequestOTPSchema.parse(request.body);
      request.body = body;
      return requestOTP(request as any, reply);
    }
  );

  app.post(
    "/auth/client/verify-otp",
    async (request, reply) => {
      const body = VerifyOTPSchema.parse(request.body);
      request.body = body;
      return verifyOTP(request as any, reply);
    }
  );
}
