# packages/config

Typed env loaders for all services. Centralizes env var validation — no service should do ad-hoc `process.env.X` access.

## Key exports (`src/index.ts`)
- `loadEnv(flags)` — main entry, call with flags for what you need: `{ requireRedis, requireKafka, requireOtp, requireOauth, ... }`
- `jwtConfig()`, `redisConfig()`, `kafkaConfig()`, `otpConfig()`, `oauthConfig()`, `sendgridConfig()`
- `required(key)` — throws if missing; `optional(key, default)` — returns default; `requiredInt(key)` — parses int

## Usage pattern
```ts
import { loadEnv } from "@turtle/config";
const config = loadEnv({ requireRedis: true, requireKafka: true });
```

## Non-obvious patterns
- Supports Kafka and RabbitMQ for event bus — `kafkaConfig()` returns the right shape based on `EVENT_BUS` env
- Multiple OTP provider configs coexist — `otpConfig()` loads only the active provider's vars
