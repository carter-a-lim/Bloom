const express = require('express');
const { exec, execFile } = require('child_process');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = 3000;

app.use(express.json());

const workers = {};

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

    const projectRoot = path.resolve(__dirname, '../../');
    const args = ['-File', './bloom-daemon.ps1', '-Action', 'spawn', '-TaskID', String(nodeId), '-Branch', String(taskLabel)];
    const result = await executeFileCommand('powershell.exe', args, projectRoot);

    const match = result.match(/http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/);
    if (!match) throw new Error('Failed to extract IP from PowerShell output: ' + result);

    const isolatedIp = match[0];
    workers[nodeId] = { id: nodeId, isolatedIp, taskLabel, status: 'yellow' };

    res.status(201).json({ workerId: nodeId, status: 'yellow', isolatedIp });

    // Run tests in the worktree async, broadcast result
    const worktreePath = path.join(projectRoot, '.trees', nodeId);
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
