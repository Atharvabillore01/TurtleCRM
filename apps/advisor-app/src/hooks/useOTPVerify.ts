import { useMutation } from "@tanstack/react-query";
import { verifyAdvisorOTP } from "../api/auth.api.js";

export function useOTPVerify() {
  return useMutation({
    mutationFn: ({ requestId, destination, otp }: { requestId: string; destination: string; otp: string }) =>
      verifyAdvisorOTP(requestId, destination, otp),
    onError: () => {},
  });
}
