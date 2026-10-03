#!/bin/sh
# Start both the Next.js app and the WhatsApp session manager.
# They run as sibling processes in the same container.
set -e

# Start the session manager in the background (port 8080)
node --conditions=react-server whatsapp-connectors/web-qr/session-manager.ts &
MANAGER_PID=$!

# Give it a moment to bind the port
sleep 1

# Start Next.js on port 3000
exec node node_modules/.bin/next start -p 3000

# If the manager dies, shut down the container
wait $MANAGER_PID
