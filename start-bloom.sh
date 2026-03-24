#!/usr/bin/env bash
set -e

# Load env vars if .env exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Start worker and aggregator as host processes (they need filesystem + git access)
echo "Starting worker service on port 3001..."
cd services/worker
ANTHROPIC_API_KEY="${CLAUDE_API_KEY}" AGGREGATOR_URL="http://localhost:3002" OLLAMA_API_BASE="${OLLAMA_API_BASE}" GROQ_API_KEY="${GROQ_API_KEY}" node index.js &
WORKER_PID=$!
cd ../..

echo "Starting aggregator service on port 3002..."
cd services/aggregator
ANTHROPIC_API_KEY="${CLAUDE_API_KEY}" OLLAMA_API_BASE="${OLLAMA_API_BASE}" GROQ_API_KEY="${GROQ_API_KEY}" MODEL="${MODEL}" node aggregator.js &
AGGREGATOR_PID=$!
cd ../..

echo "Worker PID: $WORKER_PID, Aggregator PID: $AGGREGATOR_PID"

trap "kill $WORKER_PID $AGGREGATOR_PID 2>/dev/null" EXIT

echo "Starting Bloom Docker services (frontend + atomizer)..."
docker compose up "$@"
