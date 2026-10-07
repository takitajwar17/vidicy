# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/agency/package.json ./apps/agency/package.json
RUN pnpm install --frozen-lockfile --filter @vidicy/agency

FROM dependencies AS builder
ARG NEXT_PUBLIC_SITE_URL=https://vidicy-agency-vw6akohvja-as.a.run.app
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAACY3QEqdhpl26JyY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
COPY apps/agency ./apps/agency
RUN pnpm --filter @vidicy/agency run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# The monorepo tracing root retains apps/agency inside standalone output.
COPY --from=builder --chown=node:node /app/apps/agency/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/agency/public ./apps/agency/public
COPY --from=builder --chown=node:node /app/apps/agency/.next/static ./apps/agency/.next/static

COPY --from=builder --chown=node:node /app/apps/agency/scripts/google-copy-kv.mjs ./apps/agency/scripts/google-copy-kv.mjs

USER node
EXPOSE 8080
CMD ["node", "apps/agency/server.js"]
