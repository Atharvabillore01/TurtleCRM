import { getEventBus } from "@turtle/events";
import type { OTPRequestedEvent, OTPChannel } from "@turtle/types";
import { KafkaTopics } from "@turtle/types";
import { getRedis } from "../redis.js";
import { generateOTP } from "../otp/generate.js";
import { storeOTP } from "../otp/store.js";
import { checkRateLimit } from "../otp/rateLimit.js";
import { getOTPProvider } from "../providers/factory.js";
import { publishEvent } from "./eventbus.producer.js";

async function handleOTPRequested(raw: unknown): Promise<void> {
  const event    = raw as OTPRequestedEvent;
  const redis    = getRedis();
  const channel  = event.channel as OTPChannel;
  const target   = event.target;
  const userId   = event.userId;
  const userType = event.userType;

  const rateCheck = await checkRateLimit(redis, target);
  if (!rateCheck.allowed) {
    console.warn(`[otp-consumer] rate limit hit for ${target}, retry in ${rateCheck.retryAfter}s`);
    await publishEvent({
      topic:      KafkaTopics.OTPVerified,
      userId,
      channel,
      userType,
      verifiedAt: new Date().toISOString(),
    });
    return;
  }

  const { otp, hash } = await generateOTP();
  await storeOTP(redis, channel, target, hash);

  const provider = getOTPProvider();
  try {
    if (channel === "sms") {
      await provider.sendSMS(target, otp);
    } else {
      await provider.sendEmail(target, otp);
    }
    console.log(`[otp-consumer] OTP dispatched via ${channel} to ${target}`);
  } catch (err) {
    console.error(`[otp-consumer] Provider error (${channel} → ${target}):`, err);
  }
}

export async function startConsumer(): Promise<void> {
  const bus = getEventBus({ clientId: "otp-service-consumer", groupId: "otp-service-group" });
  await bus.subscribe(KafkaTopics.OTPRequested, handleOTPRequested);
  console.log(`[events] subscribed to ${KafkaTopics.OTPRequested}`);
}
