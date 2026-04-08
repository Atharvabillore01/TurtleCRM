import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { requestAdvisorOTP } from "../api/auth.api.js";
import type { OTPChannel } from "@turtle/types";

export function parseApiError(error: unknown): string {
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

export function useAdvisorRequestOTP() {
  return useMutation({
    mutationFn: ({ channel, destination }: { channel: OTPChannel; destination: string }) =>
      requestAdvisorOTP(channel, destination),
    onError: () => {},
  });
}
