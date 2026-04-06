import type Redis from "ioredis";
import type { OTPChannel } from "@turtle/types";
import { otpConfig } from "@turtle/config";

export interface StoredOTP {
  hash:      string;
  attempts:  number;
  expiresAt: string; // ISO
}

export function otpKey(channel: OTPChannel, destination: string): string {
  return `otp:${channel}:${destination}`;
}

export async function storeOTP(
  redis:       Redis,
  channel:     OTPChannel,
  destination: string,
  hash:        string
): Promise<void> {
  const { expiresSeconds } = otpConfig();
  const record: StoredOTP = {
    hash,
    attempts:  0,
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
  };
  await redis.setex(otpKey(channel, destination), expiresSeconds, JSON.stringify(record));
}

export async function getStoredOTP(
  redis:       Redis,
  channel:     OTPChannel,
  destination: string
): Promise<StoredOTP | null> {
  const raw = await redis.get(otpKey(channel, destination));
  if (!raw) return null;
  return JSON.parse(raw) as StoredOTP;
}

export async function updateStoredOTP(
  redis:       Redis,
  channel:     OTPChannel,
  destination: string,
  record:      StoredOTP
): Promise<void> {
  const ttl = await redis.ttl(otpKey(channel, destination));
  if (ttl > 0) {
    await redis.setex(otpKey(channel, destination), ttl, JSON.stringify(record));
  }
}

export async function deleteStoredOTP(
  redis:       Redis,
  channel:     OTPChannel,
  destination: string
): Promise<void> {
  await redis.del(otpKey(channel, destination));
}
