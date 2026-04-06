import {
  EventBridgeClient,
  PutEventsCommand,
  type PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import type { EventBusAdapter } from "../interface.js";

// EventBridge publish → SQS subscribe pattern:
//
//   publish("auth.otp.requested", payload)
//     → EventBridge bus "turtle-corporate"
//     → EventBridge Rule: DetailType = "auth.otp.requested" → SQS target
//     → subscribe() polls the SQS queue assigned to this service
//
// Rules must be created in AWS console or via CDK/Terraform.
// Each service gets one SQS queue (AWS_SQS_QUEUE_URL).

function makeClients() {
  const region      = process.env["AWS_REGION"] ?? "ap-south-1";
  const credentials = {
    accessKeyId:     process.env["AWS_ACCESS_KEY_ID"]!,
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
  };
  return {
    eb:  new EventBridgeClient({ region, credentials }),
    sqs: new SQSClient({ region, credentials }),
  };
}

export class EventBridgeAdapter implements EventBusAdapter {
  private readonly eb:       EventBridgeClient;
  private readonly sqs:      SQSClient;
  private readonly busName:  string;
  private readonly source:   string;
  private readonly pollers:  Map<string, boolean> = new Map();

  constructor(source: string) {
    const { eb, sqs } = makeClients();
    this.eb      = eb;
    this.sqs     = sqs;
    this.busName = process.env["AWS_EVENTBRIDGE_BUS_NAME"] ?? "turtle-corporate";
    this.source  = source; // e.g. "turtle.auth-service"
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const entry: PutEventsRequestEntry = {
      EventBusName: this.busName,
      Source:       this.source,
      DetailType:   topic,               // used by EventBridge rules to route
      Detail:       JSON.stringify(payload),
      Time:         new Date(),
    };

    const res = await this.eb.send(new PutEventsCommand({ Entries: [entry] }));

    const failed = res.FailedEntryCount ?? 0;
    if (failed > 0) {
      const reason = res.Entries?.[0]?.ErrorMessage ?? "unknown";
      throw new Error(`EventBridge publish failed for ${topic}: ${reason}`);
    }
  }

  async subscribe(
    topic: string,
    handler: (payload: unknown) => Promise<void>
  ): Promise<void> {
    const queueUrl = process.env["AWS_SQS_QUEUE_URL"];
    if (!queueUrl) throw new Error("AWS_SQS_QUEUE_URL is required for eventbridge adapter");

    console.log(`[eventbridge] subscribing to DetailType="${topic}" via SQS ${queueUrl}`);

    this.pollers.set(topic, true);
    void this.pollLoop(topic, queueUrl, handler);
  }

  private async pollLoop(
    topic:    string,
    queueUrl: string,
    handler:  (payload: unknown) => Promise<void>
  ): Promise<void> {
    while (this.pollers.get(topic)) {
      try {
        const res = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl:            queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds:     20,
            MessageAttributeNames: ["All"],
          })
        );

        await Promise.allSettled(
          (res.Messages ?? []).map(async (msg) => {
            if (!msg.Body || !msg.ReceiptHandle) return;

            try {
              // EventBridge → SQS envelope:
              // { "version": "0", "source": "...", "detail-type": "auth.otp.requested", "detail": {...} }
              const envelope = JSON.parse(msg.Body) as {
                "detail-type"?: string;
                detail?:        Record<string, unknown>;
              };

              // Only process messages matching this topic subscription
              if (envelope["detail-type"] && envelope["detail-type"] !== topic) return;

              const payload = envelope.detail ?? JSON.parse(msg.Body);
              await handler(payload);

              await this.sqs.send(
                new DeleteMessageCommand({
                  QueueUrl:      queueUrl,
                  ReceiptHandle: msg.ReceiptHandle,
                })
              );
            } catch (err) {
              console.error(`[eventbridge] Handler failed on ${topic}:`, err);
              // Do NOT delete — SQS redelivers after visibility timeout
            }
          })
        );
      } catch (err) {
        if (this.pollers.get(topic)) {
          console.error(`[eventbridge] Poll error on ${topic}:`, err);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    for (const topic of this.pollers.keys()) this.pollers.set(topic, false);
    this.eb.destroy();
    this.sqs.destroy();
    console.log("[eventbridge] disconnected");
  }
}
