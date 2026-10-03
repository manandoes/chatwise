#!/usr/bin/env bash
set -euo pipefail

# Deploy ChatWise to the GCP VM (Option A):
#   - Next.js app (port 3000)
#   - WhatsApp session manager + workers (in same process, no Redis)
#
# Run this ON the GCP VM, inside a clone of this repo.
# The app is built once at Docker image build time and served by `next start`.

IMAGE=chatwise
CONTAINER=chatwise

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example and fill in the vars." >&2
  exit 1
fi

git pull --ff-only

docker build -t "$IMAGE" .

docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network chatwise-net \
  --publish 3000:3000 \
  --log-opt max-size=50m \
  --log-opt max-file=3 \
  --env-file .env \
  "$IMAGE"

docker image prune -f

echo "Deployed. App on :3000, logs: docker logs -f $CONTAINER"
