# Single image used by three services (migrate / web / worker). Debian-slim base so
# Prisma's default engine + OpenSSL "just work", and ca-certificates are present for
# the crawler's outbound HTTPS fetches. Multi-stage to cache the dependency install.

FROM node:26-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- dependencies (incl. dev: needed for next build, prisma CLI, tsx worker) ---
FROM base AS deps
# Skip Playwright's browser download here — binaries are installed in the runner stage.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

# --- build: generate Prisma client + compile Next.js ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- runtime: full build output so the same image can run web OR worker OR migrate ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/worker ./worker

# Note: the bot-protection bypass connects to a SEPARATE Playwright browser server
# (PLAYWRIGHT_WS_ENDPOINT / per-crawl connection), so no browser binaries are bundled
# here — only the Playwright client (in node_modules) is needed to connect.

EXPOSE 3000
# Default command runs the web server; compose overrides it for worker/migrate.
CMD ["npm", "run", "start"]
