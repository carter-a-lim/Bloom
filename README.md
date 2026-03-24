# Bloom
An open-source, AI-native "Visual Factory" for software engineering. Map your project on an infinite canvas — tasks recursively split into atomic nodes and bubble up to a final merge.

## What's Actually Working
- Canvas UI (React Flow) with color-coded node states
- Atomizer: WebSocket service that generates a task tree *(simulated, no real AI yet)*
- Worker: REST API that creates/deletes Git worktrees via Galactic CLI *(mocked if Galactic isn't installed)*
- Aggregator: Uses Claude to resolve merge conflicts across child branches

> The services run independently. End-to-end orchestration (canvas → atomizer → worker → aggregator) is not yet wired up.

## Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- A Claude API key from [console.anthropic.com](https://console.anthropic.com)
- **WSL users only:** [Galactic CLI](https://github.com/idolaman/galactic-ide) daemon running on Windows

## Setup

```bash
git clone https://github.com/your-org/bloom.git
cd bloom
cp .env.example .env
# Add your CLAUDE_API_KEY to .env
```

**WSL users — run this in a Windows PowerShell window first:**
```powershell
galactic daemon start
```

**Generate lockfiles before first run** (only needed once):
```bash
cd services/worker && npm install && cd ../..
cd services/aggregator && npm install && cd ../..
```

**Start all services:**
```bash
./start-bloom.sh -d
```

**Open the canvas:** http://localhost:3000

## Services
| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React Flow canvas UI |
| Worker | 3001 | Git worktree manager |
| Atomizer | 8000 | Task splitting via WebSocket |
| Aggregator | — | Claude-powered diff merger |

## Visual States
| Color | Meaning |
|-------|---------|
| 🔵 Blue | Planning sub-tasks |
| 🟡 Yellow | Active write operations |
| 🟢 Green | Tests passed, ready to bubble up |
| 🔴 Red | Error or human intervention required |

## Running Services Individually
```bash
# Frontend
npm install && npm run dev

# Worker
cd services/worker && npm install && node index.js

# Aggregator
cd services/aggregator && npm install && node aggregator.js

# Atomizer
cd services/atomizer && pip install -r requirements.txt && uvicorn main:app --reload
```

## Common Issues

**`ERROR: Galactic daemon not reachable`**
Start the Galactic daemon on Windows before running `./start-bloom.sh`. If you don't have Galactic, run `docker compose up -d` directly — the worker will mock the IP isolation automatically.

**`npm ci` fails during Docker build**
You need `package-lock.json` files in `services/worker` and `services/aggregator`. Run `npm install` in each directory first (see Setup above).

**`CLAUDE_API_KEY` warning on startup**
The aggregator won't resolve merge conflicts without it. Add `CLAUDE_API_KEY=sk-ant-...` to your `.env` file.

## Roadmap
- 🚧 Real AI in the atomizer (currently hardcoded simulation)
- 🚧 End-to-end orchestration across all services
- 🚧 MCP model swapping (Claude / GPT-4o / Local Llama)
- 🚧 E2B sandbox for secure code execution
