const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY not set — executor will fail on real tasks');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Detect test command from project files
function detectTestCommand(repoPath) {
  if (fs.existsSync(path.join(repoPath, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
    if (pkg.scripts?.test) return 'npm test';
  }
  if (fs.existsSync(path.join(repoPath, 'pytest.ini')) ||
      fs.existsSync(path.join(repoPath, 'setup.py')) ||
      fs.existsSync(path.join(repoPath, 'pyproject.toml'))) return 'pytest';
  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) return 'cargo test';
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) return 'go test ./...';
  return null;
}

// Build a file tree string (depth-limited, ignores noise)
function getFileTree(dir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return '';
  const ignore = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', 'build', 'target', '.venv']);
  let result = '';
  for (const entry of fs.readdirSync(dir)) {
    if (ignore.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    result += '  '.repeat(depth) + entry + (stat.isDirectory() ? '/' : '') + '\n';
    if (stat.isDirectory()) result += getFileTree(full, depth + 1, maxDepth);
  }
  return result;
}

// Read files the LLM deems relevant (up to ~50KB total)
function readRelevantFiles(repoPath, filePaths) {
  let out = '';
  let total = 0;
  for (const f of filePaths) {
    const full = path.join(repoPath, f);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (total + content.length > 50000) break;
    out += `\n--- ${f} ---\n${content}\n`;
    total += content.length;
  }
  return out;
}

function runCommand(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || stdout));
      else resolve(stdout);
    });
  });
}

async function executeTask(repoPath, taskLabel, taskDescription, model) {
  model = model || process.env.MODEL || 'claude-3-5-sonnet-20241022';
  const fileTree = getFileTree(repoPath);

  // Step 1: Ask LLM which files are relevant
  const planResp = await client.messages.create({
    model,
    max_tokens: 1024,
    system: 'You are a senior software engineer. Given a file tree and a task, return ONLY a JSON array of file paths (relative to repo root) that need to be read or modified. No explanation.',
    messages: [{ role: 'user', content: `Task: ${taskLabel}\n${taskDescription || ''}\n\nFile tree:\n${fileTree}` }],
  });

  let relevantFiles = [];
  try {
    relevantFiles = JSON.parse(planResp.content[0].text.trim());
  } catch {
    // fallback: no files
  }

  const fileContents = readRelevantFiles(repoPath, relevantFiles);

  // Step 2: Ask LLM to implement the task
  const codeResp = await client.messages.create({
    model,
    max_tokens: 4096,
    system: `You are a senior software engineer implementing a task in an existing codebase.
Output ONLY a JSON array of file changes, each with "path" (relative) and "content" (full file content).
Do not include explanations or markdown. Example: [{"path":"src/foo.js","content":"..."}]`,
    messages: [{
      role: 'user',
      content: `Task: ${taskLabel}\n${taskDescription || ''}\n\nExisting files:\n${fileContents}\n\nFile tree:\n${fileTree}`,
    }],
  });

  let changes = [];
  try {
    changes = JSON.parse(codeResp.content[0].text.trim());
  } catch {
    throw new Error('LLM did not return valid JSON file changes');
  }

  // Step 3: Write files
  for (const { path: filePath, content } of changes) {
    const full = path.join(repoPath, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }

  // Step 4: Git commit in the worktree
  await runCommand('git add -A', repoPath);
  await runCommand(`git commit -m "feat: ${taskLabel}"`, repoPath);

  return changes.map((c) => c.path);
}

module.exports = { executeTask, detectTestCommand };
