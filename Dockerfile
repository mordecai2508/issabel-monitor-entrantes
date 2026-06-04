# ── Stage 1: build frontend ──────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: production ───────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=builder /app/frontend/dist ../frontend/dist

EXPOSE 4000
CMD ["node", "server.js"]
