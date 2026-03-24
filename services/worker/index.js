const express = require('express');
const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const { executeTask, detectTestCommand } = require('./executor');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = 3000;

app.use(express.json());

const workers = {};
const parentGroups = {};
// repoUrl -> local clone path
const repoCache = {};

const AGGREGATOR_URL = process.env.AGGREGATOR_URL || 'http://localhost:3002';
const REPOS_DIR = path.resolve(__dirname, '../../.repos');

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(data);
  });
}

wss.on('connection', (ws) => {
  console.log('Canvas connected via WebSocket');
  ws.on('error', console.error);
});

// Clone repo once, reuse for all nodes in a task
async function ensureRepo(repoUrl) {
  if (repoCache[repoUrl]) return repoCache[repoUrl];
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const repoName = repoUrl.split('/').pop().replace('.git', '') + '-' + Date.now();
  const repoPath = path.join(REPOS_DIR, repoName);
  await executeCommand(`git clone ${repoUrl} ${repoPath}`);
  repoCache[repoUrl] = repoPath;
  return repoPath;
}

app.post('/workers', async (req, res) => {
  try {
    const { nodeId, taskLabel, taskDescription, parentId, siblingCount, repoUrl } = req.body;
    if (!nodeId || !taskLabel) return res.status(400).json({ error: 'Missing nodeId or taskLabel' });

    const branchName = `bloom-${nodeId}`;
    workers[nodeId] = { id: nodeId, taskLabel, parentId, branchName, status: 'yellow' };

    if (parentId && siblingCount) {
      if (!parentGroups[parentId]) parentGroups[parentId] = { total: siblingCount, completed: 0, branches: [], repoUrl };
      parentGroups[parentId].branches.push(branchName);
    }

    res.status(201).json({ workerId: nodeId, status: 'yellow' });

    // Run async: clone repo, create worktree, execute task, test
    (async () => {
      try {
        let worktreePath;

        if (repoUrl) {
          const baseRepo = await ensureRepo(repoUrl);
          worktreePath = path.join(REPOS_DIR, `worktree-${nodeId}`);
          await executeCommand(`git worktree add -b ${branchName} ${worktreePath}`, baseRepo);
          await executeTask(worktreePath, taskLabel, taskDescription);
        } else {
          // Fallback: no repo, just run existing tests
          worktreePath = path.resolve(__dirname, '../../');
        }

        const testCmd = repoUrl ? (detectTestCommand(worktreePath) || 'echo "no tests"') : 'npm test';
        await executeCommand(testCmd, worktreePath);

        workers[nodeId].status = 'green';
        broadcast({ type: 'TASK_COMPLETE', nodeId, status: 'Success' });
        if (parentId) checkAndAggregate(parentId);
      } catch (err) {
        console.error(`Node ${nodeId} failed:`, err.message);
        workers[nodeId].status = 'red';
        broadcast({ type: 'TASK_FAILED', nodeId, status: 'Blocked', error: err.message });
      }
    })();

  } catch (error) {
    console.error('Failed to create worker:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/workers', (req, res) => {
  res.json(Object.values(workers));
});

app.delete('/workers/:id', async (req, res) => {
  const workerId = req.params.id;
  const worker = workers[workerId];
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  try {
    const projectRoot = path.resolve(__dirname, '../../');
    const args = ['-File', './bloom-daemon.ps1', '-Action', 'kill', '-TaskID', String(workerId)];
    try {
      await executeFileCommand('powershell.exe', args, projectRoot);
    } catch (e) {
      console.warn('PowerShell kill failed, removing from memory anyway:', e.message);
    }
    delete workers[workerId];
    res.json({ message: 'Worker removed successfully' });
  } catch (error) {
    console.error('Failed to remove worker:', error);
    res.status(500).json({ error: error.message });
  }
});

function checkAndAggregate(parentId) {
  const group = parentGroups[parentId];
  if (!group) return;
  group.completed++;
  if (group.completed < group.total) return;

  const repoPath = group.repoUrl ? repoCache[group.repoUrl] : null;
  const body = JSON.stringify({ parentBranch: `bloom-${parentId}`, childBranches: group.branches, repoPath });
  const url = new URL(`${AGGREGATOR_URL}/aggregate`);
  const reqLib = url.protocol === 'https:' ? https : http;
  const req = reqLib.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        const type = result.status === 'success' ? 'TASK_COMPLETE' : 'TASK_FAILED';
        broadcast({ type, nodeId: parentId, status: result.status === 'success' ? 'Success' : 'Blocked' });
      } catch (e) { console.error('Aggregator response parse error', e); }
    });
  });
  req.on('error', (e) => console.error('Aggregator call failed:', e.message));
  req.write(body);
  req.end();
  delete parentGroups[parentId];
}

function executeCommand(command, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(`Command failed: ${command}\n${stderr}`));
      else resolve(stdout.trim());
    });
  });
}

server.listen(port, () => {
  console.log(`Worker service listening at http://localhost:${port}`);
});
