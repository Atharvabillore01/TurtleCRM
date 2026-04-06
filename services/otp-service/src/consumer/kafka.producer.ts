import { Kafka, Producer, CompressionTypes } from "kafkajs";
import type { AuthEvent } from "@turtle/types";
import { eventBusConfig } from "@turtle/config";

let producer: Producer | null = null;

function getKafka(): Kafka {
  const cfg = eventBusConfig("otp-service", "otp-service-group");
  return new Kafka({
    clientId: cfg.kafka.clientId,
    brokers:  cfg.kafka.brokers,
    retry: { initialRetryTime: 100, retries: 8 },
  });
}

export async function connectProducer(): Promise<void> {
  if (producer) return;
  producer = getKafka().producer({ allowAutoTopicCreation: true });
  await producer.connect();
  console.log("[kafka:otp-service] producer connected");
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}

export async function publishEvent(event: AuthEvent): Promise<void> {
  if (!producer) throw new Error("Kafka producer not connected");
  await producer.send({
    topic:       event.topic,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key:   "userId" in event && event.userId ? event.userId : undefined,
        value: JSON.stringify(event),
      },
    ],
  });
}
