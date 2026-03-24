#!/usr/bin/env bash
set -e

# Check if the Galactic daemon is reachable on the Windows host.
# In WSL, the Windows host is accessible via the gateway IP (typically the first
# address in /etc/resolv.conf nameserver, or via $(ip route show | awk '/default/ {print $3}') ).
WINDOWS_HOST=$(ip route show | awk '/default/ { print $3; exit }')
GALACTIC_PORT=${GALACTIC_PORT:-7777}

echo "Checking Galactic daemon at ${WINDOWS_HOST}:${GALACTIC_PORT}..."
if ! nc -z -w3 "${WINDOWS_HOST}" "${GALACTIC_PORT}" 2>/dev/null; then
  echo "ERROR: Galactic daemon not reachable at ${WINDOWS_HOST}:${GALACTIC_PORT}."
  echo "Please start the Galactic daemon on Windows before running Bloom."
  exit 1
fi
echo "Galactic daemon is running ✓"

# Load env vars if .env exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "Starting Bloom services..."
docker compose up "$@"
