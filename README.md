# Finance Tracker Service

Express 5 + TypeScript API, backed by Postgres. Schema changes are managed with Liquibase.

## Prerequisites

- Node 24+
- Docker (with Docker Compose)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local env file and fill in the values:

   ```bash
   cp .env.example .env
   ```

   The `POSTGRES_*` values are used to create the database the first time it starts, so
   `DATABASE_URL` must use the same user, password and database name.

   `OIDC_CLIENT_SECRET` and `WEB_ORIGIN` must match `API_CLIENT_SECRET` and `WEB_ORIGIN`
   in the identity repo's `.env`.

   All config is read and validated once at startup in `src/config.ts`. If anything is
   missing or invalid, the service exits and lists every problem. Nothing else reads
   `process.env`.

3. Start Postgres:

   ```bash
   npm run db:up
   ```

4. Apply database migrations:

   ```bash
   npm run db:migrate
   ```

   The first run builds a small Liquibase image (Liquibase 5.x ships without database
   drivers), so it takes a little longer.

5. Start the service:

   ```bash
   npm run dev
   ```

## Run in Docker

The service can also run as a container next to its database. It is behind the `app`
profile, so `npm run db:up` still starts only Postgres.

1. Start identity first. Its compose file creates the shared `finance-tracker` network,
   which the service and client join to reach Keycloak and each other.
2. Complete steps 2 and 4 of Getting started (`.env` and migrations).
3. Build and start:

   ```bash
   docker compose --profile app up -d --build
   ```

4. Check `docker logs finance-tracker-service` shows "OIDC issuer discovered".

Stop `npm run dev` first: both use port 3000.

Inside the container, two values differ from `.env` (set in `docker-compose.yml`):

- `DATABASE_URL` points at `finance-tracker-service-db:5432`, the database's name and
  port on the Docker network, not `localhost:5434`.
- `OIDC_INTERNAL_URL` is `http://keycloak:8080`. The issuer stays
  `http://localhost:8080/...` because that is what the browser uses and what ID tokens
  contain, but inside a container `localhost` is the container itself. The service sends
  its own requests to Keycloak (discovery, code exchange, keys) to the internal URL
  instead. Keycloak's `KC_HOSTNAME` keeps the issuer the same whichever address is used.

## API contract

`openapi.yaml` is the hand-written source of truth for the API. Every request and response
is validated against it at runtime (`src/api-contract.ts`), and CI lints it with Redocly.

To regenerate the web client's API code after changing the spec:

```bash
npm run generate:client -- ../finance-tracker-web/src/api/generated
```

The output directory is required, because the service can't know where the web repo is
cloned. The example assumes both repos are cloned side by side.

The generator ([OpenAPI Generator](https://openapi-generator.tech), `typescript-fetch`) is a
Java program, so `scripts/generate-client.ts` runs its official Docker image instead of
needing Java installed. You only need Docker running. The image version is pinned in that
script. Never edit the generated files: change the spec and regenerate.

## Scripts

| Script                             | What it does                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                      | Run the service with file watching, loading `.env`                                 |
| `npm test`                         | Run the tests (no database needed)                                                 |
| `npm run lint:api`                 | Lint `openapi.yaml` with Redocly                                                   |
| `npm run generate:client -- <dir>` | Generate a TypeScript fetch client from `openapi.yaml` into `<dir>` (needs Docker) |
| `npm run lint`                     | Lint with oxlint                                                                   |
| `npm run fmt`                      | Format with oxfmt                                                                  |
| `npm run build`                    | Compile TypeScript to `dist/`                                                      |
| `npm run db:up`                    | Start Postgres in the background                                                   |
| `npm run db:down`                  | Stop and remove the containers (data is kept in the volume)                        |
| `npm run db:migrate`               | Apply Liquibase changesets, then regenerate the Drizzle schema                     |

## Database

- Postgres 17 runs in Docker on host port **5434** (inside the container it is 5432).
  5432 is avoided because a local Postgres install often uses it.
- Connect with a GUI such as DBeaver using host `localhost`, port `5434`, and the
  database, user and password from your `.env`.
- Data lives in the named Docker volume `finance_tracker_service_db_data`, so it survives
  `npm run db:down`.

### Migrations

Liquibase changelogs live in `db/changelog/`. `db.changelog-master.xml` is the entry
point. Liquibase records what it has applied in the `databasechangelog` table, so
running `npm run db:migrate` again is safe.

If you change `db/Dockerfile.liquibase`, rebuild the image:

```bash
docker compose build liquibase
```

### Drizzle schema

Liquibase is the single source of truth for the database structure. The Drizzle
schema is **generated** from the live database, never edited by hand:

1. `npm run db:migrate` applies the Liquibase changesets.
2. `drizzle-kit pull` (configured in `drizzle.config.ts`) regenerates
   `src/db/schema.ts` and `src/db/relations.ts`. Liquibase's own
   `databasechangelog*` tables are filtered out.
3. `scripts/fix-generated-schema.ts` patches output drizzle-kit gets wrong: it adds the
   `.ts` extension to imports (`nodenext` requires it) and turns `bytea` columns into
   typed `bytea()` columns (drizzle-kit emits an untyped `customType`). Each fix is a
   workaround to delete once drizzle-kit handles the case itself.

Commit the regenerated `schema.ts` and `relations.ts` so builds and type checks don't
need a running database. Any hand edits to them are overwritten on the next
`db:migrate`, and they are excluded from linting and formatting.

`drizzle-kit pull` also writes a timestamped migration folder under `src/db/`. It is
git-ignored, because Liquibase owns migrations.

`drizzle.config.ts` loads `.env` when it exists, and otherwise uses `DATABASE_URL` from
the environment, so the same command works locally and in CI.

### Reset the database

This deletes all local data and starts from scratch:

```bash
docker compose down -v
npm run db:up
npm run db:migrate
```

## Troubleshooting

- **"database does not exist" in your GUI, but the container is healthy:** another
  Postgres is probably answering on the port you are connecting to. Check the port
  matches the one in `docker-compose.yml`.
- **Changed `POSTGRES_USER`, `POSTGRES_PASSWORD` or `POSTGRES_DB` and nothing changed:**
  those are only read when the volume is first created. Reset the database (above).
