const express = require('express');
const { exec, execFile } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = 3000;

app.use(express.json());

const workers = {};
// parentId -> { total, completed, branches[] }
const parentGroups = {};

const AGGREGATOR_URL = process.env.AGGREGATOR_URL || 'http://localhost:3002';

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

app.post('/workers', async (req, res) => {
  try {
    const { nodeId, taskLabel, parentId, siblingCount } = req.body;
    if (!nodeId || !taskLabel) {
      return res.status(400).json({ error: 'Missing nodeId or taskLabel' });
    }

    const projectRoot = path.resolve(__dirname, '../../');
    const args = ['-File', './bloom-daemon.ps1', '-Action', 'spawn', '-TaskID', String(nodeId), '-Branch', String(taskLabel)];
    const result = await executeFileCommand('powershell.exe', args, projectRoot);

    const match = result.match(/http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/);
    if (!match) throw new Error('Failed to extract IP from PowerShell output: ' + result);

    const isolatedIp = match[0];
    const branchName = `worker-${nodeId}`;
    workers[nodeId] = { id: nodeId, isolatedIp, taskLabel, parentId, branchName, status: 'yellow' };

    // Register in parent group for aggregation tracking
    if (parentId && siblingCount) {
      if (!parentGroups[parentId]) {
        parentGroups[parentId] = { total: siblingCount, completed: 0, branches: [] };
      }
      parentGroups[parentId].branches.push(branchName);
    }

    res.status(201).json({ workerId: nodeId, status: 'yellow', isolatedIp });

    // Run tests async, broadcast result, trigger aggregator if all siblings done
    const worktreePath = path.join(projectRoot, '.trees', nodeId);
    executeCommand('npm test', worktreePath)
      .then(() => {
        workers[nodeId].status = 'green';
        broadcast({ type: 'TASK_COMPLETE', nodeId, status: 'Success' });
        if (parentId) checkAndAggregate(parentId);
      })
      .catch((err) => {
        workers[nodeId].status = 'red';
        broadcast({ type: 'TASK_FAILED', nodeId, status: 'Blocked', error: err.message });
      });

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

  // All siblings done — call aggregator
  const body = JSON.stringify({ parentBranch: `worker-${parentId}`, childBranches: group.branches });
  const url = new URL(`${AGGREGATOR_URL}/aggregate`);
  const reqLib = url.protocol === 'https:' ? https : http;
  const req = reqLib.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      const result = JSON.parse(data);
      const type = result.status === 'success' ? 'TASK_COMPLETE' : 'TASK_FAILED';
      broadcast({ type, nodeId: parentId, status: result.status === 'success' ? 'Success' : 'Blocked' });
    });
  });
  req.on('error', (e) => console.error('Aggregator call failed:', e.message));
  req.write(body);
  req.end();
  delete parentGroups[parentId];
}

function executeFileCommand(file, args, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(`Command failed: ${file}\n${stderr}`));
      else resolve(stdout.trim());
    });
  });
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
