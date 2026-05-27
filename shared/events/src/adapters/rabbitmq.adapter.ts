import amqplib, { type Channel } from "amqplib";
import type { EventBusAdapter } from "../interface.js";

type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>;

const EXCHANGE      = "turtle.events";
const DLX_EXCHANGE  = "turtle.dlx";
const EXCHANGE_TYPE = "topic";
const MAX_RETRY_COUNT = 3;
const PREFETCH_COUNT  = 10;

export class RabbitMQAdapter implements EventBusAdapter {
  private connection: AmqpConnection | null = null;
  private channel:    Channel        | null = null;
  private readonly url: string;
  private readonly queuePrefix: string;

  constructor(queuePrefix: string) {
    this.url         = process.env["RABBITMQ_URL"] ?? "amqp://guest:guest@localhost:5672";
    this.queuePrefix = queuePrefix;
  }

  private async getChannel(): Promise<Channel> {
    if (this.channel) return this.channel;

    this.connection = await amqplib.connect(this.url);
    this.channel    = await this.connection.createChannel();

    await this.channel!.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
    await this.channel!.assertExchange(DLX_EXCHANGE, EXCHANGE_TYPE, { durable: true });

    this.connection.on("error", (err: Error) => {
      console.error("[rabbitmq] connection error:", err);
      this.channel    = null;
      this.connection = null;
    });

    console.log("[rabbitmq] channel ready");
    return this.channel!;
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const channel = await this.getChannel();
    const buffer  = Buffer.from(JSON.stringify(payload));

    channel.publish(EXCHANGE, topic, buffer, {
      persistent:  true,
      contentType: "application/json",
      timestamp:   Date.now(),
    });
  }

  async subscribe(
    topic: string,
    handler: (payload: unknown) => Promise<void>
  ): Promise<void> {
    const channel   = await this.getChannel();
    const queueName = `${this.queuePrefix}.${topic}`;
    const dlqName   = `${queueName}.dlq`;

    // Declare DLQ bound to dead-letter exchange
    await channel.assertQueue(dlqName, { durable: true, arguments: { "x-queue-mode": "lazy" } });
    await channel.bindQueue(dlqName, DLX_EXCHANGE, `${topic}.failed`);

    // Main queue with DLX routing
    const { queue } = await channel.assertQueue(queueName, {
      durable:   true,
      arguments: {
        "x-message-ttl":              7 * 24 * 60 * 60 * 1000,
        "x-dead-letter-exchange":     DLX_EXCHANGE,
        "x-dead-letter-routing-key":  `${topic}.failed`,
      },
    });

    await channel.bindQueue(queue, EXCHANGE, topic);
    await channel.prefetch(PREFETCH_COUNT);

    await channel.consume(queue, async (msg) => {
      if (!msg) return;

      const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

      try {
        const payload = JSON.parse(msg.content.toString());
        await handler(payload);
        channel.ack(msg);
      } catch (err) {
        console.error(`[rabbitmq] handler failed on ${topic} (attempt ${retryCount + 1}):`, err);

        if (retryCount < MAX_RETRY_COUNT) {
          channel.publish(EXCHANGE, topic, msg.content, {
            ...msg.properties,
            headers: { ...msg.properties.headers, "x-retry-count": retryCount + 1 },
          });
          channel.ack(msg);
          console.log(`[rabbitmq] requeued ${topic} (retry ${retryCount + 1}/${MAX_RETRY_COUNT})`);
        } else {
          console.error(`[rabbitmq] max retries reached for ${topic}, routing to DLQ`);
          channel.nack(msg, false, false); // nack without requeue → DLX routes to DLQ
        }
      }
    });

    console.log(`[rabbitmq] subscribed to ${topic} via queue ${queue} (DLQ: ${dlqName})`);
  }

  async disconnect(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch { /* ignore close errors */ }
    this.channel    = null;
    this.connection = null;
    console.log("[rabbitmq] disconnected");
  }
}
