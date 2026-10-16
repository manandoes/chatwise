
# ChatWise — GCP deployment
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

# Create worker user
RUN addgroup --system worker && \
    adduser --system --ingroup worker --home /app worker

# Install dependencies from the lockfile
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev --ignore-scripts

# Copy application source
COPY . .

# Generate Prisma client and build Next.js
RUN DATABASE_URL="postgresql://dummy:dummy@localhost/dummy" \
    AUTH_SECRET="dummy-secret-for-build-only" \
    npx prisma generate && npm run build

# Prepare persistent session directory and permissions
RUN mkdir -p "$WHATSAPP_SESSION_PATH" && \
    chown -R worker:worker /app "$WHATSAPP_SESSION_PATH"

# Configure entrypoint
COPY --chmod=755 entrypoint.sh /app/entrypoint.sh

EXPOSE 3000 8080

USER worker

ENTRYPOINT ["/app/entrypoint.sh"]
