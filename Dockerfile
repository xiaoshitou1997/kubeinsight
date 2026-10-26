# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts vitest.config.ts ./
COPY server ./server
COPY web ./web
RUN npm run build

FROM node:24-alpine AS runtime
LABEL org.opencontainers.image.title="KubeInsight" \
      org.opencontainers.image.description="A lightweight, self-hosted Kubernetes console" \
      org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8090 \
    KUBEINSIGHT_WEB_DIR=/app/dist/public \
    TMPDIR=/tmp

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
