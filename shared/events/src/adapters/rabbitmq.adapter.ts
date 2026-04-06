import amqplib, { type Channel } from "amqplib";
import type { EventBusAdapter } from "../interface.js";

type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>;

const EXCHANGE      = "turtle.events";
const EXCHANGE_TYPE = "topic"; // topic exchange — routes by pattern matching

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

    // Declare durable topic exchange — survives broker restarts
    await this.channel!.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

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

    // routingKey = topic (e.g. "auth.otp.requested")
    channel.publish(EXCHANGE, topic, buffer, {
      persistent:  true,           // survives queue restart
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

    // Durable queue — messages survive broker restart
    const { queue } = await channel.assertQueue(queueName, {
      durable:   true,
      arguments: {
        "x-message-ttl": 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      },
    });

    // Bind queue to exchange with topic routing key
    await channel.bindQueue(queue, EXCHANGE, topic);

    // Fair dispatch — don't send more than 1 unacked message at a time per consumer
    await channel.prefetch(1);

    await channel.consume(queue, async (msg) => {
      if (!msg) return; // consumer cancelled

      try {
        const payload = JSON.parse(msg.content.toString());
        await handler(payload);
        channel.ack(msg);
      } catch (err) {
        console.error(`[rabbitmq] Handler failed on ${topic}:`, err);
        // Nack without requeue after a failure — prevents poison pill loops
        channel.nack(msg, false, false);
      }
    });

    console.log(`[rabbitmq] subscribed to ${topic} via queue ${queue}`);
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
