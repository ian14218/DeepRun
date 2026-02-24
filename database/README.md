# Database Setup

## Prerequisites
- PostgreSQL installed and running locally.
- `psql` CLI available.

## Create Databases

```bash
psql -U postgres -c "CREATE DATABASE mmfantasy;"
psql -U postgres -c "CREATE DATABASE mmfantasy_test;"
```

## Run Migrations

```bash
psql -U postgres -d mmfantasy -f database/migrations/001_initial_schema.sql
psql -U postgres -d mmfantasy_test -f database/migrations/001_initial_schema.sql
```

## Run Seeds (optional placeholder data)

```bash
psql -U postgres -d mmfantasy -f database/seed.sql
```

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in your values:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/mmfantasy
DATABASE_URL_TEST=postgresql://postgres:password@localhost:5432/mmfantasy_test
JWT_SECRET=your-secret-key-here
PORT=3001
SYNC_ENABLED=false
```

## Notes
- The test database (`mmfantasy_test`) is truncated between test suites automatically.
- Never run seed data against the test database — tests create their own fixtures.
