import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { requestOTP, verifyOTP } from "../api/auth.api.js";
import type { OTPChannel } from "@turtle/types";

function parseApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; retryAfter?: number } | undefined;
    if (error.response?.status === 429) {
      const retry = data?.retryAfter;
      return retry
        ? `Too many requests. Please wait ${Math.ceil(retry / 60)} minute(s) before trying again.`
        : "Too many requests. Please try again later.";
    }
    return data?.error ?? error.message;
  }
  return "An unexpected error occurred. Please try again.";
}

// ─── Request OTP ─────────────────────────────────────────────────────────────

export interface RequestOTPVars {
  channel:     OTPChannel;
  destination: string;
}

export function useRequestOTP() {
  return useMutation({
    mutationFn: ({ channel, destination }: RequestOTPVars) =>
      requestOTP(channel, destination),
    onError: () => {}, // errors surfaced via mutation.error
  });
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export interface VerifyOTPVars {
  requestId:   string;
  destination: string;
  otp:         string;
}

export function useVerifyOTP() {
  return useMutation({
    mutationFn: ({ requestId, destination, otp }: VerifyOTPVars) =>
      verifyOTP(requestId, destination, otp),
    onError: () => {},
  });
}

export { parseApiError };
