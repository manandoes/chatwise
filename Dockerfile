# ChatWise — Full deployment on GCP (Option A)
#
# Everything runs here: Next.js app + WhatsApp worker in a single container.
# No Redis, no BullMQ, no Vercel. Zero idle traffic, zero cross-host latency.
#
# This replaces the old Dockerfile.worker which only ran the session manager.
# The app is built with `next build` and served with `next start`.

FROM node:24-bookworm-slim

# Debian's `chromium` package pulls in every shared library the headless
# browser needs, which is more reliable across container base-image updates
# than letting Puppeteer download its own binary at install time.
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

# Copied ahead of the rest of the source so `npm ci` is only re-run when a
# dependency, or the Prisma schema its postinstall hook generates from,
# actually changes.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY . .

# Build the Next.js app once at image-creation time. `next start` then serves
# from the .next output without re-compiling on every invocation.
RUN npm run build

# Runs as its own user rather than root. whatsapp-web.js already launches
# Chromium with --no-sandbox (worker.ts), which is what makes a non-root
# container user compatible with Chromium's sandboxing in the first place.
RUN groupadd --system worker \
    && useradd --system --gid worker --home-dir /app worker \
    && mkdir -p "$WHATSAPP_SESSION_PATH" \
    && chown -R worker:worker /app "$WHATSAPP_SESSION_PATH"
USER worker

EXPOSE 3000 8080

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
