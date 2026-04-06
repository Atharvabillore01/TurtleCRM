import Fastify from "fastify";
import { ZodError } from "zod";
import { z } from "zod";
import { loadEnv } from "@turtle/config";
import { KafkaTopics } from "@turtle/types";
import type { OTPChannel } from "@turtle/types";
import { getRedis, closeRedis } from "./redis.js";
import { generateOTP } from "./otp/generate.js";
import { storeOTP, deleteStoredOTP } from "./otp/store.js";
import { validateOTP } from "./otp/validate.js";
import { checkRateLimit } from "./otp/rateLimit.js";
import { getOTPProvider } from "./providers/factory.js";
import { initProducer, disconnectEventBus, publishEvent } from "./consumer/eventbus.producer.js";
import { startConsumer } from "./consumer/eventbus.consumer.js";

const cfg = loadEnv({
  clientId:     "otp-service",
  groupId:      "otp-service-group",
  requireRedis: true,
  requireKafka: true,
  port:         parseInt(process.env["OTP_SERVICE_PORT"] ?? "4001", 10),
});

const app = Fastify({
  logger: {
    level: cfg.nodeEnv === "production" ? "info" : "debug",
    transport: cfg.nodeEnv !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
});

// ─── Validation schemas ───────────────────────────────────────────────────────

const SendOTPSchema = z.object({
  channel:     z.enum(["sms", "email"]),
  destination: z.string().min(1),
  userId:      z.string().min(1),
  userType:    z.enum(["client", "advisor"]),
});

const VerifyOTPSchema = z.object({
  channel:     z.enum(["sms", "email"]),
  destination: z.string().min(1),
  otp:         z.string().length(6).regex(/^\d{6}$/),
  userId:      z.string().min(1),
  userType:    z.enum(["client", "advisor"]),
});

// ─── HTTP routes (internal — called by auth-service) ─────────────────────────

/**
 * POST /otp/send
 * Called by auth-service when it needs to dispatch an OTP directly over HTTP
 * (fallback if event-driven flow is not used).
 */
app.post("/otp/send", async (request, reply) => {
  const body    = SendOTPSchema.parse(request.body);
  const redis   = getRedis();
  const channel = body.channel as OTPChannel;

  const rateCheck = await checkRateLimit(redis, body.destination);
  if (!rateCheck.allowed) {
    return reply.status(429).send({ error: "Too many OTP requests", retryAfter: rateCheck.retryAfter });
  }

  const { otp, hash } = await generateOTP();
  await storeOTP(redis, channel, body.destination, hash);

  const provider = getOTPProvider();
  if (channel === "sms") {
    await provider.sendSMS(body.destination, otp);
  } else {
    await provider.sendEmail(body.destination, otp);
  }

  return reply.status(202).send({ message: "OTP sent", expiresIn: cfg.otp.expiresSeconds });
});

/**
 * POST /otp/verify
 * Called by auth-service to validate an OTP. Returns result + publishes Kafka event.
 */
app.post("/otp/verify", async (request, reply) => {
  const body    = VerifyOTPSchema.parse(request.body);
  const redis   = getRedis();
  const channel = body.channel as OTPChannel;

  const result = await validateOTP(redis, channel, body.destination, body.otp);

  // Publish verified event regardless of outcome
  await publishEvent({
    topic:      KafkaTopics.OTPVerified,
    userId:     body.userId,
    channel,
    userType:   body.userType,
    verifiedAt: new Date().toISOString(),
  });

  if (!result.valid) {
    const status = result.reason === "max_attempts" ? 429 : 400;
    return reply.status(status).send({
      error:        result.reason === "max_attempts"
        ? "Maximum attempts exceeded. Please request a new OTP."
        : "Invalid or expired OTP",
      attemptsLeft: result.attemptsLeft,
      reason:       result.reason,
    });
  }

  return reply.status(200).send({ valid: true });
});

app.get("/health", async () => ({ status: "ok", service: "otp-service", provider: cfg.otp.provider }));

// ─── Global error handler ─────────────────────────────────────────────────────

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(422).send({
      error:  "Validation failed",
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  app.log.error(error);
  return reply.status(error.statusCode ?? 500).send({
    error: cfg.nodeEnv === "production" ? "Internal server error" : error.message,
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

app.addHook("onClose", async () => {
  await Promise.all([disconnectEventBus(), closeRedis()]);
});

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down…`);
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ─── Start ────────────────────────────────────────────────────────────────────

void (async () => {
  try {
    initProducer();
    await startConsumer();
    await app.listen({ port: cfg.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
