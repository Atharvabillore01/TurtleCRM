import { useMutation } from "@tanstack/react-query";
import { verifyAdvisorOTP } from "../api/auth.api.js";

export function useOTPVerify() {
  return useMutation({
    mutationFn: ({ sessionId, otp }: { sessionId: string; otp: string }) =>
      verifyAdvisorOTP(sessionId, otp),
  });
}
