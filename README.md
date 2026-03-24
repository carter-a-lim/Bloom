# Bloom 
**Bloom ** is an open-source, AI-native "Visual Factory" for software engineering. Instead of chatting with an AI, you map your project on an infinite canvas where tasks recursively split into atomic nodes and "bubble up" to a final merge.

## 🛠 Tech Stack
- **Frontend:** Next.js 16 (App Router), React Flow (Canvas engine), Tailwind CSS.
- **Orchestration:** ROMA Framework (Recursive Open Meta-Agents) for split/merge logic.
- **Isolation:** Galactic CLI for managing Git Worktrees and network-isolated dev environments.
- **Brain:** MCP (Model Context Protocol) to swap between Claude 3.5, GPT-5, and Local Llama.
- **Sandbox:** E2B for secure code execution and automated testing.

## 🌀 The "Bubble Up" Workflow
1. **The Root:** User enters a high-level goal (e.g., "Build a Stripe integration").
2. **The Atomizer:** A ROMA-based agent decides if the task is "Atomic" (one-file fix) or "Complex."
3. **The Planner:** If complex, it spawns child nodes (e.g., "Webhooks", "Frontend UI", "Database").
4. **The Execution:** Each node runs in a **Galactic Git Worktree**. It codes, tests, and validates.
5. **The Aggregator:** Parent nodes act as "Managers." Once all children are Green (Passed), the Manager merges the worktree diffs and validates the parent state.

## 🎨 Visual States
- **Thinking (Blue):** Agent is using ROMA Planner to map sub-tasks.
- **Coding (Yellow):** Active write operations in a Galactic Worktree.
- **Success (Green):** All unit tests passed in E2B; ready to bubble up.
- **Blocked (Red):** Error detected or human intervention required.
