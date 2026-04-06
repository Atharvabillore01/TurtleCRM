import {
  SNSClient,
  PublishCommand,
  CreateTopicCommand,
} from "@aws-sdk/client-sns";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import type { EventBusAdapter } from "../interface.js";

// topic name → SNS ARN env var convention:
// "auth.otp.requested" → AWS_SNS_ARN_AUTH_OTP_REQUESTED
function topicToEnvKey(topic: string): string {
  return `AWS_SNS_ARN_${topic.toUpperCase().replace(/\./g, "_")}`;
}

// Each subscribing service sets one queue URL:
// AWS_SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/123456/my-service-queue
function getQueueUrl(): string {
  const url = process.env["AWS_SQS_QUEUE_URL"];
  if (!url) throw new Error("AWS_SQS_QUEUE_URL is required for aws-sns adapter");
  return url;
}

function makeClients() {
  const region      = process.env["AWS_REGION"] ?? "ap-south-1";
  const credentials = {
    accessKeyId:     process.env["AWS_ACCESS_KEY_ID"]!,
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
  };
  return {
    sns: new SNSClient({ region, credentials }),
    sqs: new SQSClient({ region, credentials }),
  };
}

export class AWSSNSSQSAdapter implements EventBusAdapter {
  private readonly sns: SNSClient;
  private readonly sqs: SQSClient;

  // topic → SNS ARN cache (resolved lazily)
  private readonly arnCache = new Map<string, string>();

  // active polling loops
  private readonly pollers = new Map<string, boolean>();

  constructor() {
    const { sns, sqs } = makeClients();
    this.sns = sns;
    this.sqs = sqs;
  }

  private async resolveTopicArn(topic: string): Promise<string> {
    if (this.arnCache.has(topic)) return this.arnCache.get(topic)!;

    // 1. Check explicit env var first (e.g. AWS_SNS_ARN_AUTH_OTP_REQUESTED)
    const envArn = process.env[topicToEnvKey(topic)];
    if (envArn) {
      this.arnCache.set(topic, envArn);
      return envArn;
    }

    // 2. Derive from account + region + topic slug
    const accountId = process.env["AWS_ACCOUNT_ID"];
    const region    = process.env["AWS_REGION"] ?? "ap-south-1";
    if (accountId) {
      const slug = topic.replace(/\./g, "-");
      const arn  = `arn:aws:sns:${region}:${accountId}:${slug}`;
      this.arnCache.set(topic, arn);
      return arn;
    }

    // 3. Create topic and get ARN (dev/staging only)
    const slug = topic.replace(/\./g, "-");
    const res  = await this.sns.send(new CreateTopicCommand({ Name: slug }));
    if (!res.TopicArn) throw new Error(`Could not resolve SNS ARN for topic: ${topic}`);
    this.arnCache.set(topic, res.TopicArn);
    return res.TopicArn;
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const topicArn = await this.resolveTopicArn(topic);
    await this.sns.send(
      new PublishCommand({
        TopicArn:         topicArn,
        Message:          JSON.stringify(payload),
        MessageAttributes: {
          topic: {
            DataType:    "String",
            StringValue: topic,
          },
        },
      })
    );
  }

  async subscribe(
    topic: string,
    handler: (payload: unknown) => Promise<void>
  ): Promise<void> {
    const queueUrl = getQueueUrl();

    // Verify queue exists and is reachable
    await this.sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl:       queueUrl,
        AttributeNames: ["QueueArn"],
      })
    );

    // Mark this topic as actively polling
    this.pollers.set(topic, true);

    // Long-poll loop (runs in background — intentionally not awaited)
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
            WaitTimeSeconds:     20, // long poll
            MessageAttributeNames: ["All"],
          })
        );

        const messages = res.Messages ?? [];

        await Promise.allSettled(
          messages.map(async (msg) => {
            if (!msg.Body || !msg.ReceiptHandle) return;

            try {
              // SNS wraps the message in an envelope
              const envelope = JSON.parse(msg.Body) as {
                Message?: string;
                TopicArn?: string;
              };

              // Filter: only process messages for this topic
              const msgTopic = envelope.TopicArn?.split(":").pop()?.replace(/-/g, ".");
              if (msgTopic && msgTopic !== topic) return;

              const payload = envelope.Message
                ? JSON.parse(envelope.Message)
                : JSON.parse(msg.Body);

              await handler(payload);

              // Delete from queue after successful processing
              await this.sqs.send(
                new DeleteMessageCommand({
                  QueueUrl:      queueUrl,
                  ReceiptHandle: msg.ReceiptHandle,
                })
              );
            } catch (err) {
              console.error(`[aws-sns-sqs] Handler failed for message on ${topic}:`, err);
              // Do NOT delete — SQS will redeliver after visibility timeout
            }
          })
        );
      } catch (err) {
        if (this.pollers.get(topic)) {
          console.error(`[aws-sns-sqs] Poll error on ${topic}:`, err);
          await new Promise((r) => setTimeout(r, 2000)); // backoff before retry
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    // Signal all polling loops to stop
    for (const topic of this.pollers.keys()) {
      this.pollers.set(topic, false);
    }
    this.sns.destroy();
    this.sqs.destroy();
    console.log("[aws-sns-sqs] disconnected");
  }
}
