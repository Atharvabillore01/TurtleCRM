import Fastify from "fastify";

const app = Fastify({
  logger: { level: process.env["NODE_ENV"] === "production" ? "info" : "debug" },
});

app.get("/health", async () => ({ status: "ok", service: "user-service" }));

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

const port = parseInt(process.env["PORT"] ?? "4002", 10);
void (async () => {
  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
