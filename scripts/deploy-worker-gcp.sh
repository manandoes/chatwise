#!/usr/bin/env bash
#
# End-to-end deploy of the WhatsApp QR worker (Dockerfile.worker) to a single
# GCE VM. Run this from the repo root, on the machine that has your real
# `.env` filled in — nothing secret is ever committed, so this script is what
# gets those values onto the worker instead (docs/Rules.md §3).
#
# What it does, in order:
#   1. Resolves your GCP project (from `gcloud config`, unless overridden).
#   2. Enables the Compute Engine API and opens SSH to the VM (tag-scoped).
#   3. Creates the VM if it doesn't already exist (Debian 12, no Docker
#      pre-baked — installed on first boot).
#   4. Ships the repo source and a *worker-only* env file to it over SSH
#      (never through instance metadata, which isn't access-controlled the
#      way a file on the instance's own disk is).
#   5. Builds Dockerfile.worker on the VM and runs it with
#      `--restart unless-stopped`.
#
# Safe to re-run: it's how you redeploy too — rerunning after changing `.env`
# or the source rebuilds the image and restarts the container in place.
#
# Requires: gcloud CLI, authenticated (`gcloud auth login`), billing enabled
# on the target project. Everything this script creates costs money the
# moment it exists — it prints exactly what it's about to do and asks first.
#
# Usage:
#   ./scripts/deploy-worker-gcp.sh              # deploy / redeploy
#   ./scripts/deploy-worker-gcp.sh --yes        # skip the confirmation prompt
#   ./scripts/deploy-worker-gcp.sh --destroy    # delete the VM
#
# Config (env var overrides):
#   PROJECT_ID     default: whatever `gcloud config get-value project` says
#   ZONE           default: us-central1-a
#   MACHINE_TYPE   default: e2-medium   (~400-600MB per connected customer;
#                                        size this to how many you expect)
#   INSTANCE_NAME  default: chatwise-worker
#   ENV_FILE       default: .env        (read locally only, never committed)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${ZONE:-us-central1-a}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
INSTANCE_NAME="${INSTANCE_NAME:-chatwise-worker}"
ENV_FILE="${ENV_FILE:-.env}"
FIREWALL_RULE="chatwise-allow-ssh"
INSTANCE_TAG="chatwise-worker"
REMOTE_DIR="/opt/chatwise"

# The worker's actual env surface (whatsapp-connectors/web-qr, lib/db.ts,
# lib/redis.ts) — CHROME_PATH and WHATSAPP_SESSION_PATH are already baked
# into Dockerfile.worker, so they're deliberately not re-sent here.
REQUIRED_VARS=(DATABASE_URL REDIS_URL ENCRYPTION_KEY GEMINI_API_KEY)

DO_DESTROY=false
SKIP_CONFIRM=false
for arg in "$@"; do
  case "$arg" in
    --destroy) DO_DESTROY=true ;;
    -y|--yes) SKIP_CONFIRM=true ;;
    -h|--help)
      sed -n '2,32p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (see --help)" >&2
      exit 1
      ;;
  esac
done

# ─── Preflight ───────────────────────────────────────────────────────────────

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud CLI not found. Install it: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
}

if [ -z "$PROJECT_ID" ]; then
  echo "No GCP project set. Run 'gcloud config set project <id>' or pass PROJECT_ID=<id>." >&2
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  echo "No active gcloud login. Run 'gcloud auth login' first." >&2
  exit 1
fi

if [ "$DO_DESTROY" = true ]; then
  echo "About to DELETE instance '$INSTANCE_NAME' in project '$PROJECT_ID' (zone $ZONE)."
  echo "This drops every WhatsApp session currently connected on it."
  if [ "$SKIP_CONFIRM" != true ]; then
    read -r -p "Type the instance name to confirm: " confirm
    [ "$confirm" = "$INSTANCE_NAME" ] || { echo "Aborted."; exit 1; }
  fi
  gcloud compute instances delete "$INSTANCE_NAME" \
    --project="$PROJECT_ID" --zone="$ZONE" --quiet
  echo "Deleted. The firewall rule ($FIREWALL_RULE) was left in place for next time."
  exit 0
fi

[ -f "$ENV_FILE" ] || {
  echo "$ENV_FILE not found. Copy .env.example to $ENV_FILE and fill it in first." >&2
  exit 1
}

# Read a var's value out of ENV_FILE without sourcing it (sourcing an
# arbitrary .env would execute anything shaped like a command substitution).
read_env_var() {
  local key="$1"
  # `|| true` on the whole pipeline: a missing var means grep finds no match
  # and exits 1, which is the case this function exists to report — under
  # `set -o pipefail` that would otherwise abort the entire script right
  # here instead of letting the missing-var check below run.
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

missing=()
for var in "${REQUIRED_VARS[@]}"; do
  val="$(read_env_var "$var")"
  if [ -z "$val" ]; then
    missing+=("$var")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing or empty in $ENV_FILE: ${missing[*]}" >&2
  exit 1
fi

# A real, documented footgun (README.md, .env.example): the pooled Supabase
# URL is for serverless. The worker is a long-lived process and should use
# the direct connection instead.
db_url="$(read_env_var DATABASE_URL)"
if [[ "$db_url" == *":6543"* ]]; then
  echo "Warning: DATABASE_URL in $ENV_FILE looks like the pooled (6543) Supabase"
  echo "  string. The worker is long-lived, not serverless — use the direct"
  echo "  (5432) string for it instead (README.md 'Deploying' §3)."
  echo
fi

echo "About to deploy the WhatsApp worker:"
echo "  Project:   $PROJECT_ID"
echo "  Zone:      $ZONE"
echo "  Instance:  $INSTANCE_NAME ($MACHINE_TYPE)"
echo "  Env file:  $ENV_FILE (${#REQUIRED_VARS[@]} vars, sent over SSH, never as instance metadata)"
echo
echo "This creates or updates billed GCP resources (a running VM)."
if [ "$SKIP_CONFIRM" != true ]; then
  read -r -p "Proceed? [y/N] " reply
  case "$reply" in [yY]|[yY][eE][sS]) ;; *) echo "Aborted."; exit 1 ;; esac
fi

# ─── Infra: API, firewall, VM ───────────────────────────────────────────────

echo "==> Enabling Compute Engine API (no-op if already on)"
gcloud services enable compute.googleapis.com --project="$PROJECT_ID"

echo "==> Ensuring an SSH firewall rule exists (scoped to this instance's tag)"
if ! gcloud compute firewall-rules describe "$FIREWALL_RULE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$FIREWALL_RULE" \
    --project="$PROJECT_ID" \
    --network=default \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:22 \
    --target-tags="$INSTANCE_TAG"
fi

INSTANCE_EXISTS=false
if gcloud compute instances describe "$INSTANCE_NAME" --project="$PROJECT_ID" --zone="$ZONE" >/dev/null 2>&1; then
  INSTANCE_EXISTS=true
fi

if [ "$INSTANCE_EXISTS" = false ]; then
  echo "==> Creating $INSTANCE_NAME"
  gcloud compute instances create "$INSTANCE_NAME" \
    --project="$PROJECT_ID" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=20GB \
    --tags="$INSTANCE_TAG"

  echo "==> Waiting for SSH to come up"
  for _ in $(seq 1 20); do
    if gcloud compute ssh "$INSTANCE_NAME" --project="$PROJECT_ID" --zone="$ZONE" \
         --command="true" >/dev/null 2>&1; then
      break
    fi
    sleep 10
  done
else
  echo "==> $INSTANCE_NAME already exists — redeploying onto it"
fi

# ─── Ship source + secrets, build, run ──────────────────────────────────────

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Packing the repo (excluding what the container regenerates or never needs)"
tar -czf "$WORKDIR/chatwise-src.tar.gz" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.next' \
  --exclude='lib/generated' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.whatsapp-sessions*' \
  --exclude='.wwebjs_auth' \
  --exclude='.wwebjs_cache' \
  --exclude='tmp' \
  --exclude='temp' \
  --exclude='*.log' \
  --exclude='*.tsbuildinfo' \
  --exclude='docs' \
  --exclude='.claude' \
  --exclude='.agents' \
  --exclude='.windsurf' \
  --exclude='.codegraph' \
  -C "$REPO_ROOT" .

echo "==> Writing the worker's own env file (only the ${#REQUIRED_VARS[@]} vars it needs)"
{
  for var in "${REQUIRED_VARS[@]}"; do
    echo "${var}=$(read_env_var "$var")"
  done
} > "$WORKDIR/worker.env"

echo "==> Copying source and env file to the VM over SSH"
gcloud compute scp "$WORKDIR/chatwise-src.tar.gz" "$WORKDIR/worker.env" \
  "$INSTANCE_NAME:/tmp/" \
  --project="$PROJECT_ID" --zone="$ZONE"

cat > "$WORKDIR/remote-deploy.sh" <<'REMOTE'
set -euo pipefail

REMOTE_DIR=__REMOTE_DIR__

sudo mkdir -p "$REMOTE_DIR"
sudo tar -xzf /tmp/chatwise-src.tar.gz -C "$REMOTE_DIR"
sudo mv /tmp/worker.env "$REMOTE_DIR/worker.env"
sudo chmod 600 "$REMOTE_DIR/worker.env"
rm -f /tmp/chatwise-src.tar.gz

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io
  sudo systemctl enable --now docker
fi

cd "$REMOTE_DIR"
echo "Building image (first run installs Chromium — a few minutes)..."
sudo docker build -f Dockerfile.worker -t chatwise-worker:latest .

sudo docker rm -f chatwise-worker >/dev/null 2>&1 || true
sudo docker run -d \
  --name chatwise-worker \
  --restart unless-stopped \
  --env-file "$REMOTE_DIR/worker.env" \
  chatwise-worker:latest

sleep 3
echo "--- container status ---"
sudo docker ps --filter name=chatwise-worker --format "{{.Names}}: {{.Status}}"
REMOTE

sed -i "s|__REMOTE_DIR__|$REMOTE_DIR|" "$WORKDIR/remote-deploy.sh"

echo "==> Building and starting the worker on the VM"
gcloud compute ssh "$INSTANCE_NAME" --project="$PROJECT_ID" --zone="$ZONE" \
  --command="$(cat "$WORKDIR/remote-deploy.sh")"

echo
echo "Done. Useful follow-ups:"
echo "  Logs:   gcloud compute ssh $INSTANCE_NAME --project=$PROJECT_ID --zone=$ZONE --command='sudo docker logs -f chatwise-worker'"
echo "  Shell:  gcloud compute ssh $INSTANCE_NAME --project=$PROJECT_ID --zone=$ZONE"
echo "  Teardown: $0 --destroy"
