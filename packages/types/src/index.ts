// ─── Enums ────────────────────────────────────────────────────────────────────

export enum KafkaTopics {
  OTPRequested     = "auth.otp.requested",
  OTPVerified      = "auth.otp.verified",
  LoginSuccess     = "auth.login.success",
  LoginFailed      = "auth.login.failed",
  TokenRefreshed   = "auth.token.refreshed",
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export type UserType   = "client" | "advisor";
export type OTPChannel = "sms" | "email";
export type AuthMethod = "otp" | "password" | "oauth";

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId:    string;
  userType:  UserType;
  role:      string;
  sessionId: string;
  iat:       number;
  exp:       number;
}

export interface RefreshTokenPayload {
  userId:    string;
  sessionId: string;
  tokenId:   string;
  iat:       number;
  exp:       number;
}

// ─── OTP ─────────────────────────────────────────────────────────────────────

export interface OTPRequest {
  userId:    string;
  channel:   OTPChannel;
  target:    string; // phone number or email address
  userType:  UserType;
  expiresIn: number; // seconds
}

export interface OTPResponse {
  success:   boolean;
  message:   string;
  expiresAt: string; // ISO timestamp
}

// ─── Kafka Event Payloads ─────────────────────────────────────────────────────

export interface OTPRequestedEvent {
  topic:     KafkaTopics.OTPRequested;
  userId:    string;
  channel:   OTPChannel;
  target:    string;
  userType:  UserType;
  requestedAt: string; // ISO timestamp
}

export interface OTPVerifiedEvent {
  topic:      KafkaTopics.OTPVerified;
  userId:     string;
  channel:    OTPChannel;
  userType:   UserType;
  verifiedAt: string;
}

export interface LoginSuccessEvent {
  topic:      KafkaTopics.LoginSuccess;
  userId:     string;
  userType:   UserType;
  authMethod: AuthMethod;
  sessionId:  string;
  ip:         string;
  userAgent:  string;
  loggedInAt: string;
}

export interface LoginFailedEvent {
  topic:      KafkaTopics.LoginFailed;
  userId:     string | null;
  userType:   UserType;
  authMethod: AuthMethod;
  reason:     string;
  ip:         string;
  userAgent:  string;
  failedAt:   string;
}

export interface TokenRefreshedEvent {
  topic:       KafkaTopics.TokenRefreshed;
  userId:      string;
  sessionId:   string;
  refreshedAt: string;
}

// ─── AuthEvent union ─────────────────────────────────────────────────────────

export type AuthEvent =
  | OTPRequestedEvent
  | OTPVerifiedEvent
  | LoginSuccessEvent
  | LoginFailedEvent
  | TokenRefreshedEvent;
