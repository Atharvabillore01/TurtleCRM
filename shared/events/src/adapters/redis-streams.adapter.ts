import Redis from "ioredis";
import type { EventBusAdapter } from "../interface.js";

// Stream key: topic name as-is (e.g. "auth.otp.requested")
// Consumer group: groupId passed at construction
// Consumer name: hostname + PID for uniqueness across replicas

const CONSUMER_NAME = `${process.env["HOSTNAME"] ?? "worker"}-${process.pid}`;
const BLOCK_MS      = 5_000; // block for 5s waiting for new messages
const BATCH_SIZE    = 10;

export class RedisStreamsAdapter implements EventBusAdapter {
  private readonly redis:    Redis;
  private readonly readRedis: Redis; // separate connection for blocking XREADGROUP
  private readonly groupId:  string;
  private readonly pollers:  Map<string, boolean> = new Map();

  constructor(groupId: string) {
    this.groupId = groupId;
    const url    = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    const pass   = process.env["REDIS_PASSWORD"] || undefined;

    this.redis     = new Redis(url, { password: pass, lazyConnect: false });
    this.readRedis = new Redis(url, { password: pass, lazyConnect: false });
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    // XADD stream * field value
    await this.redis.xadd(
      topic,
      "*",              // auto-generate entry ID
      "payload",        // single field
      JSON.stringify(payload)
    );
  }

  async subscribe(
    topic: string,
    handler: (payload: unknown) => Promise<void>
  ): Promise<void> {
    // Create consumer group if it doesn't exist
    // "$" means start from new messages only
    try {
      await this.redis.xgroup("CREATE", topic, this.groupId, "$", "MKSTREAM");
      console.log(`[redis-streams] created consumer group "${this.groupId}" on stream "${topic}"`);
    } catch (err: unknown) {
      // BUSYGROUP error = group already exists, safe to ignore
      if (!(err instanceof Error && err.message.includes("BUSYGROUP"))) throw err;
    }

    this.pollers.set(topic, true);
    void this.readLoop(topic, handler);
  }

  private async readLoop(
    topic:   string,
    handler: (payload: unknown) => Promise<void>
  ): Promise<void> {
    while (this.pollers.get(topic)) {
      try {
        // XREADGROUP GROUP groupId consumerName COUNT 10 BLOCK 5000 STREAMS topic >
        const results = await this.readRedis.xreadgroup(
          "GROUP", this.groupId,
          CONSUMER_NAME,
          "COUNT", String(BATCH_SIZE),
          "BLOCK", String(BLOCK_MS),
          "STREAMS", topic,
          ">"  // ">" = only undelivered messages
        ) as Array<[string, Array<[string, string[]]>]> | null;

        if (!results) continue; // BLOCK timeout — loop again

        for (const [, entries] of results) {
          for (const [entryId, fields] of entries) {
            const payloadIdx = fields.indexOf("payload");
            const raw        = payloadIdx !== -1 ? fields[payloadIdx + 1] : undefined;

            if (!raw) {
              await this.ack(topic, entryId);
              continue;
            }

            try {
              await handler(JSON.parse(raw));
              await this.ack(topic, entryId);
            } catch (err) {
              console.error(`[redis-streams] Handler failed on ${topic} entry ${entryId}:`, err);
              // Leave unacked — Redis will redeliver via XAUTOCLAIM after PEL timeout
            }
          }
        }
      } catch (err) {
        if (this.pollers.get(topic)) {
          console.error(`[redis-streams] Read error on ${topic}:`, err);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  private async ack(topic: string, entryId: string): Promise<void> {
    await this.redis.xack(topic, this.groupId, entryId);
  }

  async disconnect(): Promise<void> {
    for (const topic of this.pollers.keys()) this.pollers.set(topic, false);
    await Promise.allSettled([this.redis.quit(), this.readRedis.quit()]);
    console.log("[redis-streams] disconnected");
  }
}
