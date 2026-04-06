import { authAxios } from "./axios.js";

export interface AdvisorLoginResponse {
  sessionId: string;
  message:   string;
  expiresIn: number;
}

export interface VerifyOTPResponse {
  accessToken:  string;
  refreshToken: string;
  sessionId:    string;
}

export interface RefreshResponse {
  accessToken: string;
}

export async function advisorLogin(
  username: string,
  password: string
): Promise<AdvisorLoginResponse> {
  const { data } = await authAxios.post<AdvisorLoginResponse>(
    "/auth/advisor/login",
    { username, password }
  );
  return data;
}

export async function verifyAdvisorOTP(
  sessionId: string,
  otp:       string
): Promise<VerifyOTPResponse> {
  const { data } = await authAxios.post<VerifyOTPResponse>(
    "/auth/advisor/verify-otp",
    { sessionId, otp }
  );
  return data;
}

/** Exchanges a refresh token (from OAuth callback URL) for an access token */
export async function exchangeRefreshToken(
  refreshToken: string
): Promise<RefreshResponse> {
  const { data } = await authAxios.post<RefreshResponse>(
    "/auth/refresh",
    { refreshToken }
  );
  return data;
}

export async function logoutAdvisor(): Promise<void> {
  await authAxios.post("/auth/logout", {});
}

/** Returns the Google OAuth redirect URL — browser navigates there directly */
export function getGoogleOAuthUrl(): string {
  const base = import.meta.env["VITE_AUTH_SERVICE_URL"] ?? "http://localhost:4000";
  return `${base}/auth/oauth/google`;
}
