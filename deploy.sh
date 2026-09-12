#!/usr/bin/env bash
set -euo pipefail

# Run this ON the GCP VM, inside a clone of this repo, to (re)deploy the
# whatsapp-web.js worker (Dockerfile.worker). The Next.js app deploys to
# Vercel and is untouched by this script (docs/Architecture.md §1).

IMAGE=chatwise-worker
CONTAINER=chatwise-worker

if [ ! -f .env ]; then
  echo "Missing .env — copy the worker's vars from .env.example and fill them in." >&2
  exit 1
fi

git pull --ff-only

docker build -f Dockerfile.worker -t "$IMAGE" .

docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network chatwise-net \
  --env-file .env \
  "$IMAGE"

docker image prune -f

echo "Deployed. Logs: docker logs -f $CONTAINER"
