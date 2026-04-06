import bcrypt from "bcrypt";
import type Redis from "ioredis";
import type { OTPChannel } from "@turtle/types";
import {
  getStoredOTP,
  updateStoredOTP,
  deleteStoredOTP,
} from "./store.js";

const MAX_ATTEMPTS = 3;

export interface ValidateResult {
  valid:        boolean;
  attemptsLeft: number;
  reason?:      "invalid_otp" | "max_attempts" | "not_found" | "expired";
}

export async function validateOTP(
  redis:       Redis,
  channel:     OTPChannel,
  destination: string,
  otp:         string
): Promise<ValidateResult> {
  const record = await getStoredOTP(redis, channel, destination);

  if (!record) {
    return { valid: false, attemptsLeft: 0, reason: "not_found" };
  }

  // Constant-time compare via bcrypt
  const match = await bcrypt.compare(otp, record.hash);

  if (match) {
    await deleteStoredOTP(redis, channel, destination);
    return { valid: true, attemptsLeft: 0 };
  }

  // Wrong OTP — increment attempts
  record.attempts += 1;

  if (record.attempts >= MAX_ATTEMPTS) {
    // Invalidate entirely after 3 failures
    await deleteStoredOTP(redis, channel, destination);
    return { valid: false, attemptsLeft: 0, reason: "max_attempts" };
  }

  await updateStoredOTP(redis, channel, destination, record);

  return {
    valid:        false,
    attemptsLeft: MAX_ATTEMPTS - record.attempts,
    reason:       "invalid_otp",
  };
}
