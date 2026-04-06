import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { loadEnv } from "@turtle/config";
import { initEventBus, disconnectEventBus } from "./plugins/eventbus.js";
import { closeRedis } from "./plugins/redis.js";
import { clientRoutes }  from "./routes/client.routes.js";
import { advisorRoutes } from "./routes/advisor.routes.js";
import { oauthRoutes }   from "./routes/oauth.routes.js";
import { refreshRoutes } from "./routes/refresh.routes.js";

const cfg = loadEnv({
  clientId:       "auth-service",
  groupId:        "auth-service-group",
  requireDB:      false, // auth-service talks to user-service for DB ops
  requireRedis:   true,
  requireKafka:   true,
  requireOAuth:   true,
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

// ─── Bootstrap ────────────────────────────────────────────────────────────────

void (async () => {
  // ─── Plugins ────────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin:      [
      process.env["CLIENT_APP_URL"]  ?? "http://localhost:3000",
      process.env["ADVISOR_APP_URL"] ?? "http://localhost:3001",
    ],
    credentials: true,
  });

  await app.register(cookie, {
    secret: process.env["JWT_SECRET"]!, // signs cookies
  });

  // ─── Global error handler ──────────────────────────────────────────────────

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

  // ─── Routes ─────────────────────────────────────────────────────────────────

  await app.register(clientRoutes);
  await app.register(advisorRoutes);
  await app.register(oauthRoutes);
  await app.register(refreshRoutes);

  app.get("/health", async () => ({ status: "ok", service: "auth-service" }));

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

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

  // ─── Start ──────────────────────────────────────────────────────────────────

  try {
    initEventBus();
    await app.listen({ port: cfg.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
