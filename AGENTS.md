# AGENTS.md

Always use ASD-STE100 Simplified Technical English when you talk to the user.

## Scope and working rules

- These instructions apply to the whole repository. Paths are relative to the root.
- Preserve unrelated local edits. Change only files needed for the requested task.
- Do not commit, rewrite history, push, or create a pull request unless the user asks.
- Do not start a development server, deploy, or change live services without user authorization.
- Do not create documentation files unless the user asks.

## Project context

The active application is `apps/agency` (`@vidicy/agency`), a Next.js application
on Node.js and Cloud Run with PostgreSQL. Do not restore the removed Traveler,
billing, or credit systems unless requested.

Read [README.md](README.md) for setup and
[apps/agency/README.md](apps/agency/README.md) for architecture when relevant.
`apps/agency/src/infra/runtime-context.ts` retains names such as `R2`, `APP_KV`,
and `VECTORIZE`; these use Google services. Cloudflare scripts and D1 schemas
are legacy tooling, not the production runtime.

## Commands and verification

Use pnpm. Run these commands from the repository root:

| Task                        | Command                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| Install dependencies        | `pnpm install --frozen-lockfile`                                            |
| Run one test file           | `pnpm --filter @vidicy/agency exec vitest run src/__tests__/<file>.test.ts` |
| Run the standard test suite | `pnpm test`                                                                 |
| Lint                        | `pnpm lint`                                                                 |
| Check types                 | `pnpm typecheck`                                                            |
| Build the application       | `pnpm build:agency`                                                         |

- Run checks that cover the change. For code changes, run the relevant tests,
  lint, and type checks. Build when the change affects build or runtime configuration.
- `pnpm test` excludes the model evaluation suites. Do not treat it as an AI quality check.
- Database workflow tests use `apps/agency/src/__tests__/helpers/postgres.ts`.
  They need `pg_config` on PATH and `initdb` and `pg_ctl` in its binary directory.
  Use the temporary test cluster; do not connect tests to an application database.
- Mock cloud access through `@/infra/runtime-context`, not the retired OpenNext module.
- Report checks run, failures, and checks not run. Do not claim browser or live-service
  verification from unit tests or a successful build.

## Database and job constraints

- Generate schema migrations with `pnpm db:generate:agency <migration_name>`.
  Do not hand-write SQL migration files. Keep PostgreSQL and legacy D1 migrations separate.
- `pnpm db:migrate:dev:agency` uses the configured database; it does not select a local target.
- Use `db.batch` or `db.withTransaction` from `apps/agency/src/db/index.ts` for
  atomic database work. They reject nested transactions. Keep network and AI calls outside them.
- Let schema defaults generate IDs on normal inserts. Import the schema through `@/db/schema`.
- Await Cloud Tasks acceptance before returning upload success. Reserve `ctx.waitUntil`
  for short, noncritical work; it is not a durable job queue.

## Access and code conventions

- Reuse page authentication in `apps/agency/src/utils/auth-page.ts`, case permissions
  in `apps/agency/src/utils/application-auth.ts`, and staff checks in
  `apps/agency/src/server/agency-team.ts`. Public signup must not grant agency admin access.
- Check case access and file ownership on the server; a supplied document ID or storage key
  is not proof of permission. Preserve CSRF checks in mutation paths.
- Use functions rather than new classes. Use `function` for pure functions and a named
  object when a new function needs more than one parameter. Prefer interfaces for object contracts.
- Add `import "server-only"` to server-only modules, except pages. Use `useServerAction`
  from `zsa-react` in client consumers of server actions.
- Put custom environment types in `apps/agency/custom-env.d.ts`, not generated
  `apps/agency/cloudflare-env.d.ts`. Run `pnpm cf-typegen` after legacy binding changes.
- Use existing UI components and `nuqs` for URL state. Preserve form drafts when an action fails.

## Maintaining this file

Keep durable project rules and known traps here. Keep service inventories, model IDs,
deployment observations, tutorials, and task progress in their existing source or README.
Check commands and paths before adding a rule. Let formatters and linters enforce formatting.
