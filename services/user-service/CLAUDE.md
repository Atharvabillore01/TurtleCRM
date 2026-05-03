# user-service

User profile CRUD — Python/FastAPI + SQLAlchemy + PostgreSQL.

**Runtime:** Python 3.12 + FastAPI + Uvicorn  
**Port:** 4002  
**Dev:** `uvicorn main:app --reload --port 4002`

## Key files

- `main.py` — FastAPI entry, router registration
- `database.py` — async SQLAlchemy engine + session factory (asyncpg driver)
- `models.py` — SQLAlchemy ORM models
- `config.py` — pydantic-settings env loader

## Non-obvious patterns

- Uses SQLAlchemy async (asyncpg driver) — not Prisma, not synchronous SQLAlchemy
- Migrations managed with Alembic: `alembic upgrade head` after model changes
- Other services do not call user-service yet — no inter-service HTTP wired up

## Rules

- All DB access through SQLAlchemy async session only
- Keep route handlers thin — business logic in separate service files
