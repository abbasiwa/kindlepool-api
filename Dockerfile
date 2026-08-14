# KindlePool unified backend — one image, four services (indexer/relayer/notifier/monitor)
FROM node:20-alpine AS build
WORKDIR /app

# Dependencies first for layer caching
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY services/indexer/package.json services/indexer/
COPY services/relayer/package.json services/relayer/
COPY services/notifier/package.json services/notifier/
COPY services/monitor/package.json services/monitor/
RUN npm install --no-audit --no-fund

# Sources
COPY . .

# Type-check + build the unified backend (compiles api + all services)
RUN npm --workspace api run build

# ── Production ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/package.json ./api/

# Better-sqlite3 native binding + data dir for the SQLite hot cache
RUN mkdir -p /app/data

EXPOSE 3001 3002 3003

CMD ["node", "api/dist/api/src/index.js"]
