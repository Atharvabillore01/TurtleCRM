# Turtle Corporate — Architecture & Flow

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | Python 3.12 + FastAPI |
| Auth | JWT (access 15m, refresh 7d) + bcrypt |
| Message Bus | RabbitMQ (TOPIC exchange) |
| Cache / Sessions | Redis |
| Database | PostgreSQL (via SQLAlchemy async) |
| OTP Delivery | Twilio Verify API |
| Container | Docker + nginx (frontend) |

---

## Service Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                         │
│                                                                 │
│   client-app :3000 (OTP only)    advisor-app :3001 (PW + 2FA)  │
└──────────┬───────────────────────────────┬──────────────────────┘
           │  HTTP (Axios)                 │  HTTP (Axios)
           ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    auth-service :4000                            │
│                                                                  │
│  /auth/client/*   /auth/advisor/*   /auth/oauth/*   /auth/refresh│
└────┬─────────┬──────────────────────────────────────────────────┘
     │         │
     │ HTTP    │ AMQP (publish)
     │         ▼
     │  ┌─────────────┐     ┌──────────────────────────────────┐
     │  │  RabbitMQ   │────►│  otp-service :4001 (consumer)    │
     │  │             │     │  Sends OTP via Twilio Verify API  │
     │  │  Exchange:  │     └──────────────┬───────────────────┘
     │  │turtle.events│                    │ HTTP (verify only)
     │  │             │◄───────────────────┘
     │  │             │
     │  │             │────►  notification-service :4003
     │  │             │       (logs login events)
     │  └─────────────┘
     │
     │ HTTP
     ▼
┌─────────────────────┐      ┌──────────────┐
│  user-service :4002 │─────►│  PostgreSQL  │
│  /users  /advisors  │      │  users table │
└─────────────────────┘      │advisors table│
                             └──────────────┘

         Redis (shared by auth + otp services)
         ┌─────────────────────────────────────┐
         │ otp:pending:{uuid}     TTL 5m        │
         │ advisor:session:{uuid} TTL 5m        │
         │ otp:{channel}:{dest}   TTL 5m        │
         │ otprate:{dest}         TTL 15m       │
         │ refresh:{userId}:{tid} TTL 7d        │
         └─────────────────────────────────────┘
```

---

## Flow 1 — Client OTP Login

```
client-app          auth-service          RabbitMQ        otp-service       Twilio
──────────          ────────────          ────────        ───────────       ──────
    │                    │                    │                │               │
    │ POST /request-otp  │                    │                │               │
    │ {channel, dest}    │                    │                │               │
    │───────────────────►│                    │                │               │
    │                    │ store              │                │               │
    │                    │ otp:pending:{uuid} │                │               │
    │                    │ in Redis           │                │               │
    │                    │                   │                │               │
    │                    │ publish ──────────►│                │               │
    │                    │ auth.otp.requested │                │               │
    │◄───────────────────│                   │ consume ───────►│              │
    │ 202 {requestId}    │                   │                │               │
    │                    │                   │                │ POST Verify   │
    │                    │                   │                │──────────────►│
    │                    │                   │                │               │
    │                    │                   │                │ ← 201 Created │
    │                    │                   │           [OTP arrives in user's inbox/SMS]
    │                    │                   │                │               │
    │ POST /verify-otp   │                   │                │               │
    │ {requestId, otp}   │                   │                │               │
    │───────────────────►│                   │                │               │
    │                    │ lookup Redis       │                │               │
    │                    │ POST /otp/verify ─────────────────►│               │
    │                    │                   │                │ POST Check ──►│
    │                    │                   │                │ ← approved    │
    │                    │ ◄─────────────────────────────────{valid:true}     │
    │                    │ delete otp:pending from Redis       │               │
    │                    │ issue JWT access token (15m)        │               │
    │                    │ issue JWT refresh token (7d)        │               │
    │                    │ store refresh:{userId}:{tid} Redis  │               │
    │                    │ set httpOnly cookie: access_token   │               │
    │◄───────────────────│                   │                │               │
    │ 200 {accessToken,  │                   │                │               │
    │  refreshToken,     │                   │                │               │
    │  sessionId}        │                   │                │               │
```

---

## Flow 2 — Advisor Login (Password + OTP 2FA)

```
advisor-app      auth-service        user-service     RabbitMQ      otp-service
───────────      ────────────        ────────────     ────────      ───────────
    │                 │                   │               │               │
    │ POST /login     │                   │               │               │
    │ {user, pw}      │                   │               │               │
    │────────────────►│                   │               │               │
    │                 │ GET /advisors/by-username/{u}     │               │
    │                 │──────────────────►│               │               │
    │                 │◄── {passwordHash, role, ...}      │               │
    │                 │ bcrypt.checkpw()  │               │               │
    │                 │                   │               │               │
    │                 │ store advisor:session:{uuid}       │               │
    │                 │ in Redis (step: awaiting_otp)      │               │
    │                 │                   │               │               │
    │                 │ publish ──────────────────────────►│              │
    │                 │ auth.otp.requested│               │ send OTP ────►│
    │◄────────────────│                   │               │               │
    │ 200 {sessionId} │                   │               │               │
    │                 │                   │               │               │
    │ [user receives OTP]                 │               │               │
    │                 │                   │               │               │
    │ POST /verify-otp│                   │               │               │
    │ {sessionId, otp}│                   │               │               │
    │────────────────►│                   │               │               │
    │                 │ lookup advisor:session from Redis  │               │
    │                 │ POST /otp/verify ─────────────────────────────────►│
    │                 │◄──────────────────────────────────────── {valid}  │
    │                 │ delete session from Redis          │               │
    │                 │ issue tokens, set cookie           │               │
    │◄────────────────│                   │               │               │
    │ 200 {tokens}    │                   │               │               │
```

---

## Flow 3 — Advisor Register

```
advisor-app       auth-service         user-service
───────────       ────────────         ────────────
    │                  │                    │
    │ POST /register   │                    │
    │ {username, email,│                    │
    │  password,       │                    │
    │  otp_channel}    │                    │
    │─────────────────►│                    │
    │                  │ POST /advisors     │
    │                  │───────────────────►│
    │                  │                    │ bcrypt.hashpw(password)
    │                  │                    │ INSERT INTO advisors
    │                  │ 201 {id, username} │ (unique username+email)
    │                  │◄───────────────────│
    │◄─────────────────│                    │
    │ 201 {id, message}│                    │
    │                  │                    │
    │  [no OTP sent — OTP is only for login]│
```

---

## Flow 4 — Google OAuth (Advisor only)

```
advisor-app        auth-service           Google
───────────        ────────────           ──────
    │                   │                    │
    │ GET /oauth/google  │                    │
    │──────────────────►│                    │
    │◄── 302 redirect ──│                    │
    │                   │                    │
    │────────────────── redirect ───────────►│
    │                                        │ [user consents]
    │◄──────────── redirect with ?code ──────│
    │                   │                    │
    │ GET /callback?code=...                 │
    │──────────────────►│                    │
    │                   │ POST token exchange│
    │                   │───────────────────►│
    │                   │◄── access_token    │
    │                   │ GET /userinfo ─────►│
    │                   │◄── {sub, email}    │
    │                   │ userId = "google:{sub}"
    │                   │ issue JWT tokens   │
    │◄── 302 redirect ──│                    │
    │  to /auth/callback?refresh_token=...   │
```

---

## Flow 5 — Token Refresh (Silent)

```
client/advisor-app           auth-service
──────────────────           ────────────
    │                             │
    │  [AuthContext: 30s before   │
    │   access token expires]     │
    │                             │
    │ POST /auth/refresh          │
    │ {refreshToken: "..."}       │
    │────────────────────────────►│
    │                             │ verify refresh JWT signature
    │                             │ lookup refresh:{userId}:{tid} in Redis
    │                             │ DELETE old Redis key (one-time use)
    │                             │ issue new access token (15m)
    │                             │ issue new refresh token (7d)
    │                             │ store new refresh key in Redis
    │◄────────────────────────────│
    │ 200 {accessToken,           │
    │      refreshToken}          │
```

---

## RabbitMQ Events

| Topic | Publisher | Consumer | Action |
|---|---|---|---|
| `auth.otp.requested` | auth-service | otp-service | Sends OTP via Twilio |
| `auth.otp.verified` | otp-service | — | Audit only |
| `auth.login.success` | auth-service | notification-service | Logged (email pending) |
| `auth.login.failed` | auth-service | notification-service | Logged (email pending) |
| `auth.token.refreshed` | auth-service | — | Audit only |

---

## Security Model

| Mechanism | Detail |
|---|---|
| Access token | JWT, 15min TTL, JS memory only (never localStorage) |
| Refresh token | JWT, 7d TTL, httpOnly cookie + Redis whitelist |
| Refresh rotation | Every use invalidates old token, issues new pair |
| OTP brute-force | 3 attempts max → key deleted; 3 requests per 15min |
| Timing attack | Dummy bcrypt hash checked even when user not found |
| Transport | Cookies: httpOnly, SameSite=Lax, Secure in production |

---

## What's Pending / Can Be Improved

See [improvements.md](improvements.md) for a prioritized list.
