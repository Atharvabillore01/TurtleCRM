import type { EventBusAdapter } from "./interface.js";
import { KafkaAdapter }        from "./adapters/kafka.adapter.js";
import { RabbitMQAdapter }     from "./adapters/rabbitmq.adapter.js";
import { AWSSNSSQSAdapter }    from "./adapters/aws-sns-sqs.adapter.js";
import { RedisStreamsAdapter }  from "./adapters/redis-streams.adapter.js";
import { EventBridgeAdapter }  from "./adapters/eventbridge.adapter.js";

export type EventBusType =
  | "kafka"
  | "rabbitmq"
  | "aws-sns"
  | "redis-streams"
  | "eventbridge";

export interface EventBusOptions {
  /**
   * Unique identifier for this service instance.
   * Used as Kafka clientId, RabbitMQ queue prefix, and EventBridge source.
   * Example: "auth-service"
   */
  clientId: string;

  /**
   * Consumer group name (Kafka consumer group / Redis stream group).
   * All replicas of the same service should share the same groupId
   * so only one instance processes each message.
   * Example: "auth-service-group"
   */
  groupId: string;
}

export function createEventBus(opts: EventBusOptions): EventBusAdapter {
  const type = (process.env["EVENT_BUS"] ?? "kafka") as EventBusType;

  switch (type) {
    case "kafka":
      return new KafkaAdapter(opts.clientId, opts.groupId);

    case "rabbitmq":
      return new RabbitMQAdapter(opts.clientId);

    case "aws-sns":
      return new AWSSNSSQSAdapter();

    case "redis-streams":
      return new RedisStreamsAdapter(opts.groupId);

    case "eventbridge":
      return new EventBridgeAdapter(`turtle.${opts.clientId}`);

    default:
      console.warn(`[events] Unknown EVENT_BUS="${type}", falling back to kafka`);
      return new KafkaAdapter(opts.clientId, opts.groupId);
  }
}

// ─── Process-level singleton ──────────────────────────────────────────────────
// Each service calls getEventBus() everywhere — same instance reused.

let _instance: EventBusAdapter | null = null;
let _opts: EventBusOptions | null = null;

export function getEventBus(opts?: EventBusOptions): EventBusAdapter {
  if (!_instance) {
    if (!opts) throw new Error("getEventBus() requires opts on first call");
    _opts     = opts;
    _instance = createEventBus(opts);
  }
  return _instance;
}

/** Call during graceful shutdown */
export async function disconnectEventBus(): Promise<void> {
  if (_instance) {
    await _instance.disconnect();
    _instance = null;
  }
}
