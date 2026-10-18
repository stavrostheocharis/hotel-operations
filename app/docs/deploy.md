# Deploying the console

One image (`app/Dockerfile`) runs three things: the web app (`pnpm start`),
the worker service (`pnpm jobs:worker`) and, once per release, the
migrations (`pnpm db:migrate`). `docker-compose.prod.yml` at the repository
root wires them to Postgres on one host; a PaaS runs the same image as two
services plus a release command.

```bash
cp app/.env.example .env.production      # then fill it in, see below
alias dc='docker compose --env-file .env.production -f docker-compose.prod.yml'
dc build
dc run --rm migrate
dc up -d
curl -s http://127.0.0.1:3000/api/health   # {"ok":true}
```

Put a reverse proxy with TLS in front of port 3000 (Caddy, nginx, the
platform's load balancer); the app sends HSTS, `frame-ancestors 'none'`
and the other response headers itself (`next.config.ts`). Set
`SESSION_COOKIE_SECURE=true` when the proxy terminates TLS.

## What the environment must hold

The app refuses to start in production when any of the first three is
wrong (`src/db/index.ts`, `src/db/scripts/lib/stay-ref.ts`,
`src/db/scripts/lib/paths.ts`).

| Variable | Web | Worker | Migrate | Notes |
|---|---|---|---|---|
| `DATABASE_URL_APP` | ✓ | | | `app_user` with a **rotated** password; row-level security applies |
| `DATABASE_URL` | | ✓ | ✓ | `app_migrator` (or the superuser) with a rotated password; bypasses RLS |
| `STAY_REF_SECRET` | ✓ | ✓ | | 32+ random bytes; changing it later breaks the join between stays and surveys |
| `UPLOADS_DIR` | ✓ | ✓ | | the same shared folder for both (a volume, an NFS mount, a bucket mount) |
| `SESSION_COOKIE_SECURE` | ✓ | | | `true` behind TLS |
| `OPENAI_API_KEY`, `OPENAI_MODEL_*` | | ✓ | | the worker calls the model; the web app only reads `Boolean(OPENAI_API_KEY)` for the switch |
| `DATA_DIR` | ✓ | ✓ | | leave empty: it is what "Import the demo folder" offers |
| `DEMO_PASSWORD` | | | | not used in production; create real users in Settings → Users |
| `POSTGRES_PASSWORD` | | | | the compose file's Postgres superuser |

Rotating the roles that migration 0002 created with their own names as
passwords, once, on the production database:

```sql
ALTER ROLE app_user PASSWORD '…';
ALTER ROLE app_migrator PASSWORD '…';
ALTER ROLE pii_admin PASSWORD '…';
```

## Day-two

- **Migrations** run before the new web and worker start (`run --rm
  migrate`, a release phase). They are forward-only.
- **Backups**: `pg_dump` the database nightly (it holds `pii.stay_keys`
  too: encrypt the dump) and snapshot the uploads volume; test a restore
  before the pilot.
- **Logs**: the worker prints one line per job and per log line to stdout;
  the web app logs to stdout; ship both. A failed job also lands as
  `job.finished` with `status: failed` in `events`.
- **Scaling**: several web replicas are fine (sessions are in the
  database); several workers are fine (claims use `FOR UPDATE SKIP
  LOCKED`); one Postgres with ~10 connections per web replica and 3 per
  worker (`createDb` sets `max`).
- **The nightly export** is uploaded through `/imports` or placed in a
  folder `DATA_DIR` points at; the worker does the rest. Nothing is
  scheduled by the app yet; a cron can call `pnpm jobs:once` after
  dropping files and creating a batch.
- **First users**: seed nothing; sign in once with a group admin created
  by `pnpm db:seed` on an empty database (then change that password), add
  the GM in Settings → Users, and deactivate the seed accounts you do not
  need.
