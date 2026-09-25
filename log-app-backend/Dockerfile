# syntax=docker/dockerfile:1
# Production image for the Log API (param-api).
# No secrets are baked in — runtime config comes from the VPS .env file
# via docker-compose `env_file`.

FROM node:22-alpine AS build
WORKDIR /app
# OpenSSL is required by the Prisma engines (generate).
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
# DATABASE_URL is a dummy here: `prisma generate` needs the schema only and
# never connects. The real URL is supplied at deploy/run time via .env.
RUN npm run build \
  && DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy npx prisma generate \
  && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# OpenSSL for `prisma migrate deploy`; wget for the HEALTHCHECK.
RUN apk add --no-cache openssl wget
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" > /dev/null || exit 1
CMD ["node", "dist/index.js"]
