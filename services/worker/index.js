const express = require('express');
const { exec, execFile, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(express.json());

// In-memory store for workers
const workers = {};

app.post('/workers', async (req, res) => {
  try {
    const { nodeId, taskLabel } = req.body;

    if (!nodeId || !taskLabel) {
      return res.status(400).json({ error: 'Missing nodeId or taskLabel in request body' });
    }

    // Use execFile with arguments array to prevent OS command injection
    const projectRoot = path.resolve(__dirname, '../../');
    const args = ['-File', './bloom-daemon.ps1', '-Action', 'spawn', '-TaskID', String(nodeId), '-Branch', String(taskLabel)];

    const result = await executeFileCommand('powershell.exe', args, projectRoot);

    // Capture the IP: The PowerShell script outputs a line like [Bloom] Node {id} is isolated at http://127.0.0.x:3000
    const ipRegex = /http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/;
    const match = result.match(ipRegex);

    if (!match) {
      throw new Error('Failed to extract IP address from powershell output. Output was: ' + result);
    }

    const isolatedIp = match[0];
    const workerId = nodeId;

    // Store worker info
    workers[workerId] = {
      id: workerId,
      isolatedIp,
      status: 'yellow',
      taskLabel
    };

    res.status(201).json({
      workerId,
      status: 'yellow',
      isolatedIp,
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
        const projectRoot = path.resolve(__dirname, '../../');
        const args = ['-File', './bloom-daemon.ps1', '-Action', 'kill', '-TaskID', String(workerId)];

        try {
          await executeFileCommand('powershell.exe', args, projectRoot);
        } catch (e) {
          console.warn("Could not execute kill via powershell, proceeding to remove from memory", e.message);
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
      if (error) {
        console.error(`Error executing ${file}:`, stderr);
        reject(new Error(`Command failed: ${file}\n${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

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

app.listen(port, () => {
  console.log(`Backend service listening at http://localhost:${port}`);
});
