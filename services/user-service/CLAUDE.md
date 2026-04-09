# user-service

User profile CRUD — Fastify + Prisma + PostgreSQL. Currently a skeleton with only `/health`.

**Port:** 4002 | **Dev:** `npm run dev` (`tsx watch src/index.ts`)

## Key files
- `src/index.ts` — Fastify entry, only `/health` route exists
- `prisma/schema.prisma` — data model (add models here)

## Non-obvious patterns
- Uses Prisma for DB access — run `npx prisma migrate dev` after schema changes
- Fastify (not Express) — use `fastify.register()` for plugins, `fastify.get/post()` for routes
- Other services do NOT call user-service yet — no inter-service HTTP wired up

## Rules
- All DB access through Prisma client only
- Keep route handlers thin — business logic in separate service files
