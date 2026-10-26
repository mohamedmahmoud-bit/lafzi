# syntax=docker/dockerfile:1
# Multi-stage build producing a small Next.js standalone image (ECS Fargate / App Runner / EB).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders only; real values are injected at runtime.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build SESSION_SECRET=build-time-placeholder-secret npm run build
# Bundle the migration runner so the runtime image can migrate without dev dependencies.
RUN npx esbuild src/db/migrate.ts --bundle --platform=node --target=node22 --outfile=dist/migrate.cjs \
  --external:pg-native

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist/migrate.cjs ./migrate.cjs
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Run migrations as a separate one-off task in production: `node migrate.cjs`
CMD ["node", "server.js"]
