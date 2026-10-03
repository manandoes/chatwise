#!/bin/bash
# Clean up old WhatsApp session cache files (older than 14 days).
# Designed to run inside the container via cron — the path comes from the env var.
set -euo pipefail

SESSION_PATH="${WHATSAPP_SESSION_PATH:-/data/whatsapp-sessions}"

if [ ! -d "$SESSION_PATH" ]; then
  echo "Session path $SESSION_PATH does not exist — skipping."
  exit 0
fi

echo "Cleaning session cache older than 14 days in $SESSION_PATH"
find "$SESSION_PATH" -type f -mtime +14 -delete 2>/dev/null || true
find "$SESSION_PATH" -type d -empty -delete 2>/dev/null || true
echo "Done."
