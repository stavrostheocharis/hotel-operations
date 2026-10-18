# The console and its worker, one image. Build context: app/.
#
#   docker build -t hotel-ops ./app
#   docker run --env-file .env.production -p 3000:3000 hotel-ops                 # web
#   docker run --env-file .env.production hotel-ops pnpm jobs:worker             # worker
#   docker run --env-file .env.production hotel-ops pnpm db:migrate              # migrations
#
# The worker and the migrator run from src/ with tsx, so the runtime stage
# keeps src/, drizzle/ and the full node_modules. See docs/deploy.md.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.7 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --chown=app:app package.json next.config.ts tsconfig.json ./
COPY --chown=app:app public ./public
COPY --chown=app:app src ./src
COPY --chown=app:app drizzle ./drizzle
USER app
ENV UPLOADS_DIR=/data/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["pnpm", "start"]
