import type { UserType } from "@turtle/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function requiredInt(key: string): number {
  const value = required(key);
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${key} must be an integer`);
  return parsed;
}

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface JWTConfig {
  secret:                  string;
  expiresIn:               string;
  refreshTokenSecret:      string;
  refreshTokenExpiresIn:   string;
}

export interface RedisConfig {
  url:      string;
  password: string;
}

export interface DBConfig {
  url: string;
}

export type EventBus = "kafka" | "rabbitmq";

export interface KafkaConfig {
  brokers:   string[];
  clientId:  string;
  groupId:   string;
}

export interface RabbitMQConfig {
  url: string;
}

export interface EventBusConfig {
  provider:  EventBus;
  kafka:     KafkaConfig;
  rabbitmq:  RabbitMQConfig;
}

export type OTPProvider =
  | "twilio"
  | "aws"
  | "msg91"
  | "haptic"
  | "infobip"
  | "mock";

export interface TwilioConfig {
  accountSid:  string;
  authToken:   string;
  fromNumber:  string;
}

export interface AWSConfig {
  accessKeyId:     string;
  secretAccessKey: string;
  region:          string;
  snsEndpoint?:    string;
}

export interface MSG91Config {
  authKey:    string;
  senderId:   string;
  templateId: string;
}

export interface HapticConfig {
  apiKey:   string;
  senderId: string;
  baseUrl:  string;
}

export interface InfobipConfig {
  apiKey:   string;
  senderId: string;
  baseUrl:  string;
}

export interface OTPConfig {
  provider:       OTPProvider;
  expiresSeconds: number;
  length:         number;
  twilio:         Partial<TwilioConfig>;
  aws:            Partial<AWSConfig>;
  msg91:          Partial<MSG91Config>;
  haptic:         Partial<HapticConfig>;
  infobip:        Partial<InfobipConfig>;
}

export interface OAuthConfig {
  google: {
    clientId:     string;
    clientSecret: string;
    callbackUrl:  string;
  };
}

export interface SendGridConfig {
  apiKey:    string;
  fromEmail: string;
  fromName:  string;
}

export interface AppConfig {
  nodeEnv:   string;
  port:      number;
  userType?: UserType;
  jwt:       JWTConfig;
  redis:     RedisConfig;
  db:        DBConfig;
  eventBus:  EventBusConfig;
  otp:       OTPConfig;
  oauth:     OAuthConfig;
  sendgrid:  SendGridConfig;
}

// ─── Individual Config Loaders ────────────────────────────────────────────────

export function jwtConfig(): JWTConfig {
  return {
    secret:                required("JWT_SECRET"),
    expiresIn:             optional("JWT_EXPIRES_IN", "15m"),
    refreshTokenSecret:    required("REFRESH_TOKEN_SECRET"),
    refreshTokenExpiresIn: optional("REFRESH_TOKEN_EXPIRES_IN", "7d"),
  };
}

export function redisConfig(): RedisConfig {
  return {
    url:      required("REDIS_URL"),
    password: optional("REDIS_PASSWORD", ""),
  };
}

export function dbConfig(): DBConfig {
  return {
    url: required("DATABASE_URL"),
  };
}

export function kafkaConfig(clientId: string, groupId: string): KafkaConfig {
  return {
    brokers:  required("KAFKA_BROKERS").split(","),
    clientId,
    groupId,
  };
}

export function eventBusConfig(clientId: string, groupId: string): EventBusConfig {
  const provider = optional("EVENT_BUS", "kafka") as EventBus;
  return {
    provider,
    kafka:    kafkaConfig(clientId, groupId),
    rabbitmq: { url: optional("RABBITMQ_URL", "amqp://localhost:5672") },
  };
}

export function otpConfig(): OTPConfig {
  const provider = optional("OTP_PROVIDER", "infobip") as OTPProvider;
  return {
    provider,
    expiresSeconds: parseInt(optional("OTP_EXPIRES_IN_SECONDS", "300"), 10),
    length:         parseInt(optional("OTP_LENGTH", "6"), 10),
    twilio: {
      accountSid:  process.env["TWILIO_ACCOUNT_SID"],
      authToken:   process.env["TWILIO_AUTH_TOKEN"],
      fromNumber:  process.env["TWILIO_FROM_NUMBER"],
    },
    aws: {
      accessKeyId:     process.env["AWS_ACCESS_KEY_ID"],
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"],
      region:          process.env["AWS_REGION"],
    },
    msg91: {
      authKey:    process.env["MSG91_AUTH_KEY"],
      senderId:   process.env["MSG91_SENDER_ID"],
      templateId: process.env["MSG91_TEMPLATE_ID"],
    },
    haptic: {
      apiKey:   process.env["HAPTIC_API_KEY"],
      senderId: process.env["HAPTIC_SENDER_ID"],
      baseUrl:  process.env["HAPTIC_BASE_URL"],
    },
    infobip: {
      apiKey:   process.env["INFOBIP_API_KEY"],
      senderId: process.env["INFOBIP_SENDER_ID"],
      baseUrl:  process.env["INFOBIP_BASE_URL"],
    },
  };
}

export function oauthConfig(): OAuthConfig {
  return {
    google: {
      clientId:    required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
      callbackUrl:  required("GOOGLE_CALLBACK_URL"),
    },
  };
}

export function sendgridConfig(): SendGridConfig {
  return {
    apiKey:    required("SENDGRID_API_KEY"),
    fromEmail: optional("SENDGRID_FROM_EMAIL", "noreply@turtlecorporate.com"),
    fromName:  optional("SENDGRID_FROM_NAME", "Turtle Corporate"),
  };
}

// ─── loadEnv ─────────────────────────────────────────────────────────────────
// Call this once at service startup. Pass which optional sections you need.

export interface LoadEnvOptions {
  requireDB?:       boolean;
  requireRedis?:    boolean;
  requireKafka?:    boolean;
  requireOAuth?:    boolean;
  requireSendgrid?: boolean;
  clientId:         string;  // Kafka client ID, e.g. "auth-service"
  groupId:          string;  // Kafka consumer group ID
  port?:            number;
}

export function loadEnv(opts: LoadEnvOptions): AppConfig {
  const port = opts.port ?? parseInt(optional("PORT", "3000"), 10);

  if (opts.requireDB)    required("DATABASE_URL");
  if (opts.requireRedis) required("REDIS_URL");
  if (opts.requireKafka) required("KAFKA_BROKERS");

  return {
    nodeEnv:  optional("NODE_ENV", "development"),
    port,
    jwt:      jwtConfig(),
    redis:    redisConfig(),
    db:       dbConfig(),
    eventBus: eventBusConfig(opts.clientId, opts.groupId),
    otp:      otpConfig(),
    oauth:    opts.requireOAuth    ? oauthConfig()    : { google: { clientId: "", clientSecret: "", callbackUrl: "" } },
    sendgrid: opts.requireSendgrid ? sendgridConfig() : { apiKey: "", fromEmail: "", fromName: "" },
  };
}
