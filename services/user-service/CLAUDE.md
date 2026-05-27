# user-service

User profile CRUD — Python/FastAPI. All DB access goes through stored procedure stubs.

**Runtime:** Python 3.12 + FastAPI + Uvicorn  
**Port:** 4002  
**Dev:** `uvicorn main:app --reload --port 4002`

## Key files

- `main.py` — FastAPI entry, router registration, lifespan (mock registration)
- `db/user_procs.py` — proc stubs: `proc_create_user`, `proc_get_user`, `proc_create_advisor`, `proc_get_advisor_by_username`, `proc_save_transcript_extraction`
- `config.py` — pydantic-settings env loader

## Non-obvious patterns

- No ORM, no migrations — backend team owns all DB schema and stored procedures
- `DB_MODE=mock` (default): in-memory dicts serve as the "DB" for local dev
- `DB_MODE=real`: set `DB_URL` — `call_proc` will use asyncpg pool with `CALL sp_<name>(...)`
- `register_user_mocks()` must be called in lifespan before any route handles a request

## Rules

- Never write SQL or ORM code here — only call procs via `call_proc()`
- Keep route handlers thin — no business logic beyond HTTP marshalling
