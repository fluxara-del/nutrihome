FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN apt-get -o APT::Update::Error-Mode=any update && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm run build
# Assemble one runtime tree to avoid repeatedly copying the full dependency tree
# into successive image layers (especially costly with VFS storage drivers).
RUN mkdir -p /runtime/.next /runtime/src \
    && cp -a .next/standalone/. /runtime/ \
    && cp -a .next/static /runtime/.next/ \
    && cp -a public prisma prisma.config.ts scripts package.json /runtime/ \
    && cp -a src/lib /runtime/src/ \
    && rm -rf /runtime/node_modules \
    && cp -a node_modules /runtime/

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 TZ=Europe/Zagreb
RUN apt-get -o APT::Update::Error-Mode=any update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /app/data /app/backups && chown -R node:node /app
# Prisma CLI, tsx and helpers remain available for migrations, owner and backups.
COPY --from=builder --chown=node:node /runtime/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "./node_modules/.bin/tsx scripts/prepare-db.ts && ./node_modules/.bin/prisma migrate deploy && exec node server.js"]
