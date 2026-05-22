# Prisma migrations

- **`20260520180500_init_schema`** is a **squashed baseline** that creates the schema from scratch. Use this when starting a fresh PostgreSQL instance.

## If your database already has tables before this migration landed

Applying the baseline blindly will conflict. Options:

1. **Baseline-only (recommended for existing Neon/Prod)**  
   `prisma migrate resolve --applied "20260520180500_init_schema"` after aligning the live DB manually to this schema (`prisma db push` previously, or DDL out of band), so Prisma treats the migration as already applied without re-running DDL.

2. **Generate incremental SQL** instead of applying the baseline, using `migrate diff --from-schema-datasource --to-schema-datamodel` against your actual database.

For greenfield setups, run from `server/`:  

`npm run prisma:migrate` (or `npx prisma migrate deploy` in CI).

