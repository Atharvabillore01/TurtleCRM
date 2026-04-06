import { authAxios } from "./axios.js";
import type { OTPChannel } from "@turtle/types";

export interface RequestOTPResponse {
  requestId: string;
  expiresIn: number;
  message:   string;
}

export interface VerifyOTPResponse {
  accessToken:  string;
  refreshToken: string;
  sessionId:    string;
}

export async function requestOTP(
  channel:     OTPChannel,
  destination: string
): Promise<RequestOTPResponse> {
  const { data } = await authAxios.post<RequestOTPResponse>(
    "/auth/client/request-otp",
    { channel, destination }
  );
  return data;
}

export async function verifyOTP(
  requestId:   string,
  destination: string,
  otp:         string
): Promise<VerifyOTPResponse> {
  const { data } = await authAxios.post<VerifyOTPResponse>(
    "/auth/client/verify-otp",
    { requestId, destination, otp }
  );
  return data;
}
