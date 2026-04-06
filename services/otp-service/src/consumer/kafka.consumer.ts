import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import type { OTPRequestedEvent, OTPChannel } from "@turtle/types";
import { KafkaTopics } from "@turtle/types";
import { eventBusConfig } from "@turtle/config";
import { getRedis } from "../redis.js";
import { generateOTP } from "../otp/generate.js";
import { storeOTP } from "../otp/store.js";
import { checkRateLimit } from "../otp/rateLimit.js";
import { getOTPProvider } from "../providers/factory.js";
import { publishEvent } from "./kafka.producer.js";

let consumer: Consumer | null = null;

function getKafka(): Kafka {
  const cfg = eventBusConfig("otp-service-consumer", "otp-service-group");
  return new Kafka({
    clientId: cfg.kafka.clientId,
    brokers:  cfg.kafka.brokers,
    retry: { initialRetryTime: 100, retries: 8 },
  });
}

async function handleOTPRequested(event: OTPRequestedEvent): Promise<void> {
  const redis    = getRedis();
  const channel  = event.channel as OTPChannel;
  const target   = event.target;
  const userId   = event.userId;
  const userType = event.userType;

  // 1. Rate limit check — BEFORE generation
  const rateCheck = await checkRateLimit(redis, target);
  if (!rateCheck.allowed) {
    console.warn(`[otp-consumer] rate limit hit for ${target}, retry in ${rateCheck.retryAfter}s`);
    // Publish a failed verification so auth-service knows the request was blocked
    await publishEvent({
      topic:      KafkaTopics.OTPVerified,
      userId,
      channel,
      userType,
      verifiedAt: new Date().toISOString(),
    });
    return;
  }

  // 2. Generate OTP + hash
  const { otp, hash } = await generateOTP();

  // 3. Store hash in Redis (never the raw OTP)
  await storeOTP(redis, channel, target, hash);

  // 4. Send via configured provider
  const provider = getOTPProvider();
  try {
    if (channel === "sms") {
      await provider.sendSMS(target, otp);
    } else {
      await provider.sendEmail(target, otp);
    }
    console.log(`[otp-consumer] OTP sent via ${channel} to ${target}`);
  } catch (err) {
    console.error(`[otp-consumer] Failed to send OTP via ${channel} to ${target}:`, err);
    // Don't re-throw — already stored in Redis, user can retry verify
  }
}

async function processMessage(payload: EachMessagePayload): Promise<void> {
  const { topic, message } = payload;
  const raw = message.value?.toString();
  if (!raw) return;

  try {
    const event = JSON.parse(raw) as { topic: string };

    if (topic === KafkaTopics.OTPRequested) {
      await handleOTPRequested(event as OTPRequestedEvent);
    }
  } catch (err) {
    console.error(`[otp-consumer] Failed to process message on ${topic}:`, err);
  }
}

export async function startConsumer(): Promise<void> {
  const kafka = getKafka();
  consumer    = kafka.consumer({ groupId: "otp-service-group" });

  await consumer.connect();
  await consumer.subscribe({
    topics:    [KafkaTopics.OTPRequested],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: processMessage,
  });

  console.log("[kafka:otp-service] consumer started, listening on auth.otp.requested");
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
}
