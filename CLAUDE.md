# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Vidicy (Vidicy) — AI Assistant Guidelines

## Project Overview

**Vidicy** is an AI-powered SaaS application that analyzes visa application documents, generates document checklists, scores applications, and provides an AI assistant ("Atlas") to help users strengthen their visa applications. It runs on Cloudflare Workers with OpenNext.

The app was bootstrapped from a Next.js/Cloudflare SaaS template. Team management, billing, and credit systems from the original template have been **fully removed**.

## Essential Development Commands

```bash
# Install dependencies
pnpm install

# Start development server (never run unless the user explicitly asks; assume it's already running)
pnpm dev

# Run tests
pnpm test

# Run a single test file
pnpm vitest run src/__tests__/<file>.test.ts

# Lint
pnpm lint

# Build for local preview (analyze bundle)
pnpm build:analyze
```

### Database Operations

```bash
# Generate migration after schema changes (always provide a name)
pnpm db:generate <MIGRATION_NAME>

# Apply migrations locally
pnpm db:migrate:dev

# Clean D1 cache (remote)
pnpm d1:cache:clean
```

### Cloudflare Operations

```bash
# Regenerate TypeScript types for Cloudflare bindings (run after wrangler.jsonc changes)
pnpm cf-typegen

# Build + deploy to Cloudflare Workers
pnpm deploy

# Preview deployment
pnpm preview
```

### Email Development

```bash
pnpm email:dev   # Preview server at http://localhost:3001
```

## Architecture Overview

### Core Product: The Workspace Workflow

The main product lives at `(workspace)/dashboard/[appId]/`. A **Visa Application** (`visaApplicationTable`) is the central entity. Within each application the user works through three workflow steps:

1. **Checklist** (`/checklist`) — AI generates a required-document checklist; user uploads PDFs to R2
2. **Evaluation** (`/evaluation`) — AI evaluates uploaded documents, produces a risk score and recommendations
3. **Atlas** (`/atlas`) — Perplexity-powered AI chat assistant using Vectorize for semantic document search

Workflow state is defined in `src/app/(workspace)/dashboard/[appId]/_workspace-types.ts`.

### Application-Level Multi-tenancy

Applications support collaborators via `applicationMembershipTable` and `applicationRoleTable`. Permission resolution is in `src/utils/application-auth.ts`, which exports three helpers:

- `hasApplicationMembership` — check if user is owner or active member
- `hasApplicationPermission` — check a specific `APPLICATION_PERMISSIONS` constant
- `requireApplicationPermission` — throws `ZSAError` if unauthorized (use in server actions)

Owners (creator) always have all permissions. Members get permissions from their system role (`viewer`, `editor`, `admin`) or a custom role stored in `applicationRoleTable`.

### Authentication

Auth logic lives in `src/utils/auth.ts` (Lucia Auth pattern). Sessions are stored in Cloudflare KV via `src/infra/kv-session.ts`. Max 5 sessions per user.

- **Server components**: `getSessionFromCookie()` from `src/utils/auth.ts`
- **Server actions**: `requireVerifiedEmail()` from `src/utils/auth.ts`
- **Client components**: `useSessionStore()` from `src/state/session.ts`

Auth methods: email/password and Google OAuth.

### CSRF Protection

Middleware (`src/middleware.ts`) sets an `httpOnly` `csrf-token` cookie on every non-API request. Server actions read the token via `getCsrfToken()` from `src/infra/csrf.ts`. The `<CsrfProvider>` in the workspace layout passes the token to client components.

### AI & Document Pipeline

- **PDF parsing**: `src/services/pdf-parser.ts` (uses `unpdf`/`pdfjs-dist`)
- **Processing pipeline**: `src/services/pdf-pipeline.ts` — chunks text, generates OpenAI embeddings, upserts into Cloudflare Vectorize
- **OpenAI client**: `src/lib/openai.ts` — `getOpenAIClient()` / `getPerplexityClient()`
- **Atlas prompts**: `src/services/atlas-prompt.ts`
- Document files are stored in Cloudflare R2 (`src/lib/r2.ts`); chunked embeddings in Vectorize index `visa-document-chunks`

### Cloudflare Bindings (wrangler.jsonc)

| Binding             | Type      | Purpose                                                |
| ------------------- | --------- | ------------------------------------------------------ |
| `NEXT_TAG_CACHE_D1` | D1        | Application database (also used for Next.js tag cache) |
| `APP_KV`            | KV        | Session storage, caching                               |
| `NEXT_INC_CACHE_KV` | KV        | Next.js ISR cache                                      |
| `R2`                | R2        | Document file storage (bucket: `visa-documents`)       |
| `VECTORIZE`         | Vectorize | Semantic search index (`visa-document-chunks`)         |

Always use the existing `APP_KV` namespace — never create a new one. After any `wrangler.jsonc` change, run `pnpm cf-typegen`.

## Project Structure

```
src/
├── actions/          # ZSA server actions (domain-split)
│   ├── application.action.ts
│   ├── applicant.action.ts
│   ├── checklist.action.ts
│   ├── document.action.ts
│   ├── evaluation.action.ts
│   ├── chat.action.ts
│   ├── support.action.ts
│   └── sign-out.action.ts
├── app/
│   ├── (admin)/      # Admin dashboard (users, support inbox, enterprise inquiries)
│   ├── (auth)/       # Sign-in, sign-up, OAuth, verify-email, reset-password
│   ├── (dashboard)/  # App-list dashboard (post-login home)
│   ├── (marketing)/  # Public landing pages and blog
│   ├── (settings)/   # User profile and session settings
│   ├── (workspace)/  # Core product: dashboard/[appId]/ workspace
│   │   └── dashboard/[appId]/
│   │       ├── checklist/    evaluation/    atlas/    members/    settings/
│   │       ├── _workspace-content.tsx   # Main workspace page content
│   │       ├── _step-checklist.tsx      # Checklist step UI
│   │       ├── _step-evaluation.tsx     # Evaluation step UI
│   │       └── _workspace-types.ts      # Workflow step types and helpers
│   └── api/
│       ├── upload-document/       # Handles PDF upload → R2
│       ├── process-document/      # Triggers PDF pipeline (parse → embed → vectorize)
│       ├── chat-with-pdf/         # Atlas AI chat endpoint
│       ├── document-preview/[documentId]/
│       ├── upload-support-screenshot/
│       └── support-screenshot/
├── components/
│   ├── admin/         # Admin-specific components
│   ├── applications/  # Application management components (add/edit/delete applicant)
│   ├── support/       # Support ticket components
│   ├── visa/          # Core product components (document upload, chat, evaluation, etc.)
│   ├── sections/      # Marketing page sections
│   ├── magicui/       # Animation/visual components
│   └── ui/            # Shadcn UI primitives
├── config/
│   └── pricing.ts
├── db/
│   ├── index.ts       # getDB() — cached Drizzle instance via getCloudflareContext()
│   ├── schema.ts      # Re-exports from ./schema/index (import from here)
│   ├── schema/        # Domain schema files: user, visa-application, applicant,
│   │                  #   checklist, document, chat, collaboration, support,
│   │                  #   enterprise, permissions, relations
│   └── migrations/    # SQL migration files (applied by wrangler in filename order)
├── infra/             # Infrastructure/platform abstractions
│   ├── kv-session.ts  # KV session CRUD (createKVSession, getKVSession, etc.)
│   ├── csrf.ts        # CSRF token generation and validation
│   ├── rate-limit.ts  # Core rate limiting against KV
│   ├── action-rate-limit.ts
│   ├── with-rate-limit.ts
│   ├── password-hasher.ts
│   ├── validate-captcha.ts
│   └── logger.ts / logger-dev.ts
├── lib/
│   ├── openai.ts      # getOpenAIClient() / getPerplexityClient()
│   ├── r2.ts          # R2 bucket helpers (getFromR2, getR2Bucket, etc.)
│   ├── stripe.ts
│   ├── blog.ts
│   ├── config.tsx
│   ├── sso/google-sso.ts
│   └── try-catch.ts
├── react-email/       # Email templates (verify-email, reset-password, support tickets)
├── schemas/           # Zod validation schemas (one per auth/settings form)
├── server/            # Server-only DB query helpers
│   ├── application-server.ts
│   ├── stats.ts
│   ├── support.ts
│   └── unread-counts.ts
├── services/          # Business logic services
│   ├── pdf-parser.ts
│   ├── pdf-pipeline.ts  # Chunk → embed → vectorize
│   └── atlas-prompt.ts
├── state/             # Zustand client stores
│   ├── session.ts
│   ├── applications.ts
│   ├── config.ts
│   └── nav.ts
├── utils/
│   ├── auth.ts              # getSessionFromCookie, requireVerifiedEmail, getUserFromDB
│   ├── auth-utils.ts
│   ├── application-auth.ts  # requireApplicationPermission, hasApplicationMembership
│   ├── email.tsx
│   └── with-kv-cache.ts
├── __tests__/         # Vitest unit tests
├── constants.ts       # All app-wide constants and limits
├── flags.ts           # Feature flags
└── types.ts           # Shared TypeScript types
```

## Code Style and Structure

### General Principles

- Use functional and declarative programming patterns; avoid classes.
- Use descriptive variable names with auxiliary verbs (e.g., `isLoading`, `hasError`).
- Never delete comments unless they are no longer relevant.
- When a function has more than 1 parameter, always pass them as a named object.
- Use the `function` keyword for pure functions.

### Import Guidelines

- Add `import "server-only"` at the top of any file intended exclusively for server use (except `page.tsx` files).
- When creating React server actions, always use `import { useServerAction } from "zsa-react"`.

### Type Definitions

- Prefer `interface` over `type`.
- Avoid enums; use maps or `as const` objects instead.
- Add global types to `custom-env.d.ts` — not `cloudflare-env.d.ts` (overwritten by `pnpm cf-typegen`).

### Package Management

- Check `package.json` before adding packages to avoid duplicates.
- Always use `pnpm`.

## Database Patterns

- **Schema entry point**: import from `src/db/schema.ts` (barrel); domain files live in `src/db/schema/`
- **Never use Drizzle ORM Transactions** — Cloudflare D1 doesn't support them
- **Never pass an `id`** to `db.insert().values()` — IDs are auto-generated in the schema
- **Never hand-write SQL migration files** — run `pnpm db:generate <NAME>` after schema changes

### D1 Migration: Critical Pattern

`PRAGMA foreign_keys=OFF` is ignored by D1 remote. For create-copy-drop-rename migrations, `DROP TABLE` and `ALTER TABLE ... RENAME TO` must be in the same batch (no `-->statement-breakpoint` between them):

```sql
INSERT INTO `__new_X`(...) SELECT ... FROM `X`;--> statement-breakpoint
DROP TABLE `X`;
ALTER TABLE `__new_X` RENAME TO `X`;--> statement-breakpoint
```

## UI and Styling

- Use Shadcn UI, Hero-UI, and Tailwind CSS.
- Mobile-first responsive design; optimize for light and dark mode.
- When using a `container` class, pair it with `mx-auto`.
- Minimize `use client`, `useEffect`, and `setState`; favor React Server Components.
- Wrap client components in `Suspense` with a fallback.

## Next.js Patterns

- Use `nuqs` for URL search parameter state management.
- Use `dynamic loading` for non-critical components.

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
NEVER commit changes to git unless explicitly asked by the user. Do not run `git commit`, `git push`, or create PRs unless the user requests it.
