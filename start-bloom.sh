#!/usr/bin/env bash
set -e

# Check if the Galactic daemon is reachable on the Windows host.
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

# Start worker and aggregator as host processes (they need filesystem + git access)
echo "Starting worker service on port 3001..."
cd services/worker
ANTHROPIC_API_KEY="${CLAUDE_API_KEY}" AGGREGATOR_URL="http://localhost:3002" OLLAMA_API_BASE="${OLLAMA_API_BASE}" node index.js &
WORKER_PID=$!
cd ../..

echo "Starting aggregator service on port 3002..."
cd services/aggregator
ANTHROPIC_API_KEY="${CLAUDE_API_KEY}" node aggregator.js &
AGGREGATOR_PID=$!
cd ../..

echo "Worker PID: $WORKER_PID, Aggregator PID: $AGGREGATOR_PID"

# Trap to kill host processes on exit
trap "kill $WORKER_PID $AGGREGATOR_PID 2>/dev/null" EXIT

echo "Starting Bloom Docker services (frontend + atomizer)..."
docker compose up "$@"
