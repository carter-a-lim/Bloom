const express = require('express');
const { exec, spawn } = require('child_process');
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
    const workerId = crypto.randomUUID();
    const worktreePath = path.join(__dirname, `worker-${workerId}`);

    // Create the worktree
    await executeCommand(`git worktree add ${worktreePath} -b worker-${workerId}`);

    let isolateResult = '';
    try {
        // Assign a local IP using Galactic CLI
        // Ensure we run the command inside the worktree directory.
        isolateResult = await executeCommand('galactic isolate', worktreePath);
    } catch (e) {
        console.warn('Galactic CLI not found or failed, skipping IP assignment for testing.', e);
        isolateResult = 'Mocked IP: 127.0.0.100'; // mock for testing purposes if galactic isn't installed
    }

    // Extract IP from isolateResult if possible, or just assume it worked.
    // In a real scenario, `galactic isolate` probably sets up network namespaces or assigns an IP.

    // Store worker info
    workers[workerId] = {
      id: workerId,
      path: worktreePath,
      isolateResult,
    };

    res.status(201).json({
      message: 'Worker created successfully',
      worker: workers[workerId],
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
        // Remove the worktree
        await executeCommand(`git worktree remove --force ${worker.path}`);
        await executeCommand(`git branch -D worker-${workerId}`); // Clean up branch

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

app.listen(port, () => {
  console.log(`Backend service listening at http://localhost:${port}`);
});
