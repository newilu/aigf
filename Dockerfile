# ─── STAGE 1: сборка ────────────────────────────────────────────
FROM node:18 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ─── STAGE 2: production ────────────────────────────────────────
FROM node:18-alpine

# Чистый production-режим
ENV NODE_ENV=production
WORKDIR /app

# Копируем манифесты для prod-зависимостей
COPY --from=builder /app/package*.json ./

# Устанавливаем prod-зависимости,
# предварительно поставив Python и компиляторы, а затем убрав их
RUN apk add --no-cache python3 make g++ \
 && npm ci --omit=dev \
 && apk del python3 make g++

# Копируем собранный код
COPY --from=builder /app/dist ./dist

# Если есть статические файлы:
# COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "dist/server.js"]
