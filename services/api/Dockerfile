# syntax=docker/dockerfile:1.7
# ---------- 1. deps ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
COPY prisma ./prisma
RUN npm install --frozen-lockfile || npm install

# ---------- 2. build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- 3. runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache openssl tini && addgroup -S nodejs && adduser -S nestjs -G nodejs
WORKDIR /app

COPY --from=build /app/dist            ./dist
COPY --from=build /app/node_modules    ./node_modules
COPY --from=build /app/package.json    ./package.json
COPY --from=build /app/prisma          ./prisma

USER nestjs
EXPOSE 4000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/main.js"]
