# Bloom
An open-source, AI-native "Visual Factory" for software engineering. Describe a task, point it at a GitHub repo, and watch it split into parallel subtasks on an infinite canvas — each one coded, tested, and merged automatically.

## What's Working
- **Canvas UI** — React Flow canvas with glassmorphism design, animated nodes
- **Atomizer** — LLM decomposes your prompt into a tree of atomic subtasks (streams nodes live)
- **Worker** — Clones your repo, creates a Git worktree per node, LLM writes code, runs tests
- **Aggregator** — Merges all passing branches with LLM conflict resolution
- **WebSocket orchestration** — Nodes flip blue → yellow → green/red in real time
- **Model picker** — Claude 3.5 Sonnet, Claude 3 Haiku, or local Llama 3 / Mistral / CodeLlama via Ollama
- **Repo selector** — Point at any GitHub repo; add multiple

## Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [Galactic CLI](https://github.com/idolaman/galactic-ide) daemon running on Windows *(WSL users)*
- One of:
  - A Claude API key from [console.anthropic.com](https://console.anthropic.com)
  - [Ollama](https://ollama.com/download/windows) installed on Windows with a model pulled

## Setup

```bash
git clone https://github.com/your-org/bloom.git
cd bloom
cp .env.example .env
```

Edit `.env`:
```env
# If using Claude:
CLAUDE_API_KEY=sk-ant-...

# If using Ollama (set OLLAMA_HOST=0.0.0.0 in Windows env vars first):
OLLAMA_API_BASE=http://<windows-host-ip>:11434
```

**WSL users — find your Windows host IP:**
```bash
ip route show | awk '/default/ { print $3; exit }'
```

**Generate lockfiles before first run** (only needed once):
```bash
cd services/worker && npm install && cd ../..
cd services/aggregator && npm install && cd ../..
```

**WSL users — start the Galactic daemon on Windows first:**
```powershell
galactic daemon start
```

**Start all services:**
```bash
./start-bloom.sh -d
```

**Open the canvas:** http://localhost:3000

## Using Ollama (free, no API key)

1. Install [Ollama for Windows](https://ollama.com/download/windows)
2. Set `OLLAMA_HOST=0.0.0.0` as a Windows environment variable (so WSL can reach it)
3. Pull a model in PowerShell:
   ```powershell
   ollama pull llama3
   ```
4. Add `OLLAMA_API_BASE=http://<your-windows-host-ip>:11434` to `.env`
5. Start Bloom and select **Llama 3** in the model dropdown

## Services
| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React Flow canvas UI |
| Worker | 3001 | Git worktree manager + code executor |
| Atomizer | 8000 | Task splitting via WebSocket |
| Aggregator | 3002 | LLM-powered diff merger |

> Worker and Aggregator run as host processes (not Docker) so they can access the filesystem and Git.

## Visual States
| Color | Meaning |
|-------|---------|
| 🔵 Blue | Planning sub-tasks |
| 🟡 Yellow | Writing code in a worktree |
| 🟢 Green | Tests passed, merged |
| 🔴 Red | Error or test failure |

## Common Issues

**`ERROR: Galactic daemon not reachable`**
Start the Galactic daemon on Windows before running `./start-bloom.sh`.

**`npm ci` fails during Docker build**
Run `npm install` in `services/worker` and `services/aggregator` first (see Setup).

**Ollama not reachable from WSL**
Make sure `OLLAMA_HOST=0.0.0.0` is set as a Windows environment variable and Ollama has been restarted. Verify with:
```bash
curl http://<windows-host-ip>:11434/api/tags
```

## Roadmap
- 🚧 MCP model swapping
- 🚧 E2B sandbox for secure code execution
- 🚧 Diff viewer before aggregator merges
- 🚧 Cancel running tasks
