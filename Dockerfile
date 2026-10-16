# ChatWise — Full deployment on GCP (Option A)
#
# Everything runs here: Next.js app + WhatsApp worker in a single container.
# No Redis, no BullMQ, no Vercel. Zero idle traffic, zero cross-host latency.

FROM node:24-bookworm-slim

# Chromium for whatsapp-web.js
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    WHATSAPP_SESSION_PATH=/data/whatsapp-sessions \
    PORT=3000

WORKDIR /app

# Create the worker user once (separate RUN layers for unambiguous failures).
RUN addgroup --system worker 2>/dev/null || true
RUN adduser --system --ingroup worker --home /app worker 2>/dev/null || true

# Install production dependencies (skip postinstall: prisma generate runs later
# with proper env vars, and avoids a failed generate here where DATABASE_URL
# is unset).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

# Install devDependencies so prisma CLI is available for the build step.
RUN npm ci --include=dev --ignore-scripts

# Source code
COPY . .

# Build with dummy env vars (runtime uses real values from .env).
# prisma generate is run explicitly here after the dummy DATABASE_URL is set.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost/dummy" \
    AUTH_SECRET="dummy-secret-for-build-only" \
    npm run build

# Set up permissions before switching away from root
RUN mkdir -p "$WHATSAPP_SESSION_PATH" && \
    chown -R worker:worker /app "$WHATSAPP_SESSION_PATH"

# Copy and make entrypoint executable BEFORE switching user
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000 8080

USER worker

ENTRYPOINT ["/app/entrypoint.sh"]
