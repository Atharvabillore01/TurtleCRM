import { authAxios } from "./axios.js";
import type { OTPChannel } from "@turtle/types";

export interface RequestOTPResponse {
  requestId: string;
  expiresIn: number;
  message:   string;
}

export interface VerifyOTPResponse {
  accessToken: string;
  sessionId:   string;
}

export async function requestAdvisorOTP(
  channel:     OTPChannel,
  destination: string
): Promise<RequestOTPResponse> {
  const { data } = await authAxios.post<RequestOTPResponse>(
    "/auth/advisor/request-otp",
    { channel, destination }
  );
  return data;
}

export async function verifyAdvisorOTP(
  requestId:   string,
  destination: string,
  otp:         string
): Promise<VerifyOTPResponse> {
  const { data } = await authAxios.post<VerifyOTPResponse>(
    "/auth/advisor/verify-otp",
    { requestId, destination, otp }
  );
  return data;
}
