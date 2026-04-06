import Redis from "ioredis";
import { redisConfig } from "@turtle/config";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const cfg = redisConfig();
    client = new Redis(cfg.url, {
      password:           cfg.password || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) return null; // stop retrying
        return Math.min(times * 100, 3000);
      },
      lazyConnect: false,
    });

    client.on("connect", () => console.log("[redis] connected"));
    client.on("error",   (err) => console.error("[redis] error", err));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
