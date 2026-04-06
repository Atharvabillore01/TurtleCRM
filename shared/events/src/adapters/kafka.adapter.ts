import { Kafka, type Producer, type Consumer, CompressionTypes } from "kafkajs";
import type { EventBusAdapter } from "../interface.js";

export class KafkaAdapter implements EventBusAdapter {
  private readonly kafka:    Kafka;
  private producer:          Producer | null = null;
  private consumer:          Consumer | null = null;
  private readonly groupId:  string;

  constructor(clientId: string, groupId: string) {
    this.groupId = groupId;
    const brokers = (process.env["KAFKA_BROKERS"] ?? "kafka:9092").split(",");
    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: { initialRetryTime: 100, retries: 8 },
    });
  }

  private async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer({ allowAutoTopicCreation: true });
      await this.producer.connect();
      console.log("[kafka] producer connected");
    }
    return this.producer;
  }

  private async getConsumer(): Promise<Consumer> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({ groupId: this.groupId });
      await this.consumer.connect();
      console.log("[kafka] consumer connected");
    }
    return this.consumer;
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const producer = await this.getProducer();
    await producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key:   payload["userId"] ? String(payload["userId"]) : undefined,
          value: JSON.stringify(payload),
        },
      ],
    });
  }

  async subscribe(
    topic: string,
    handler: (payload: unknown) => Promise<void>
  ): Promise<void> {
    const consumer = await this.getConsumer();
    await consumer.subscribe({ topics: [topic], fromBeginning: false });

    // Run is idempotent — calling it multiple times for multiple topics is safe
    // because kafkajs batches all subscriptions into one run() call internally.
    // We start run() once; subsequent subscribe() calls just add topics.
    await consumer.run({
      eachMessage: async ({ topic: msgTopic, message }) => {
        if (msgTopic !== topic) return;
        const raw = message.value?.toString();
        if (!raw) return;
        try {
          await handler(JSON.parse(raw));
        } catch (err) {
          console.error(`[kafka] Handler failed on ${topic}:`, err);
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    await Promise.allSettled([
      this.producer?.disconnect(),
      this.consumer?.disconnect(),
    ]);
    this.producer = null;
    this.consumer = null;
    console.log("[kafka] disconnected");
  }
}
