import { randomInt } from "crypto";
import bcrypt from "bcrypt";
import { otpConfig } from "@turtle/config";

const BCRYPT_ROUNDS = 10;

export interface GeneratedOTP {
  otp:  string;
  hash: string;
}

export async function generateOTP(): Promise<GeneratedOTP> {
  const { length } = otpConfig();
  const max = Math.pow(10, length);
  const otp = randomInt(0, max).toString().padStart(length, "0");
  const hash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  return { otp, hash };
}
