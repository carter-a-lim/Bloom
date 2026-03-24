const express = require('express');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = 3000;

app.use(express.json());

// In-memory store for workers
const workers = {};

// Broadcast a message to all connected WebSocket clients
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
    const { nodeId, taskLabel } = req.body;
    if (!nodeId || !taskLabel) {
      return res.status(400).json({ error: 'Missing nodeId or taskLabel' });
    }

    const worktreePath = path.join(__dirname, `worker-${nodeId}`);

    // Create the worktree
    await executeCommand(`git worktree add ${worktreePath} -b worker-${nodeId}`);

    let isolatedIp = '127.0.0.100';
    try {
      const result = await executeCommand('galactic isolate', worktreePath);
      const match = result.match(/http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/);
      if (match) isolatedIp = match[0];
    } catch (e) {
      console.warn('Galactic not available, using mock IP');
    }

    workers[nodeId] = { id: nodeId, path: worktreePath, isolatedIp, taskLabel, status: 'yellow' };

    // Respond immediately — tests run async
    res.status(201).json({ workerId: nodeId, status: 'yellow', isolatedIp });

    // Run tests in background and broadcast result
    executeCommand('npm test', worktreePath)
      .then(() => {
        workers[nodeId].status = 'green';
        broadcast({ type: 'TASK_COMPLETE', nodeId, status: 'Success' });
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

    if (!worker) {
        return res.status(404).json({ error: 'Worker not found' });
    }

    try {
        await executeCommand(`git worktree remove --force ${worker.path}`);
        await executeCommand(`git branch -D worker-${workerId}`);
        delete workers[workerId];
        res.json({ message: 'Worker removed successfully' });
    } catch (error) {
        console.error('Failed to remove worker:', error);
        res.status(500).json({ error: error.message });
    }
});

function executeCommand(command, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ${command}:`, stderr);
        reject(new Error(`Command failed: ${command}\n${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

server.listen(port, () => {
  console.log(`Worker service listening at http://localhost:${port}`);
});
