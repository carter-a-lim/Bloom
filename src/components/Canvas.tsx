'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TaskNode, { TaskNodeData } from './TaskNode';

const nodeTypes = { task: TaskNode };
type TaskState = 'Thinking' | 'Coding' | 'Success' | 'Blocked';

export default function Canvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const rootIdRef = useRef<string | null>(null);

  // Worker WebSocket — maps TASK_COMPLETE/TASK_FAILED to node colors
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'TASK_COMPLETE' || msg.type === 'TASK_FAILED') {
          const newState: TaskState = msg.status === 'Success' ? 'Success' : 'Blocked';
          setNodes((nds) =>
            nds.map((n) => n.id === msg.nodeId ? { ...n, data: { ...n.data, state: newState } } : n)
          );
        }
      } catch (e) {
        console.error('Failed to parse worker message', e);
      }
    };
    ws.onerror = (e) => console.warn('Worker WebSocket error', e);
    return () => ws.close();
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)), []
  );

  const runTask = () => {
    if (!prompt.trim() || running) return;
    setRunning(true);

    const ws = new WebSocket('ws://localhost:8000/ws/atomizer');

    ws.onopen = () => ws.send(JSON.stringify({ prompt }));

    // Track nodes added so we can pass siblingCount to worker
    const childNodes: { id: string; label: string }[] = [];

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'node') {
        const { id, label, parentId } = msg.data;
        const isRoot = !parentId;

        if (isRoot) rootIdRef.current = id;

        const newNode: Node<TaskNodeData> = {
          id,
          type: 'task',
          position: { x: isRoot ? 400 : 200 + childNodes.length * 220, y: isRoot ? 50 : 250 },
          data: { label, state: 'Thinking' },
        };

        setNodes((nds) => [...nds, newNode]);

        if (parentId) {
          setEdges((eds) => [...eds, { id: `e-${parentId}-${id}`, source: parentId, target: id }]);
          childNodes.push({ id, label });
        }
      }

      if (msg.type === 'done') {
        ws.close();
        // Spawn a worker for each leaf node (children of root)
        for (const child of childNodes) {
          setNodes((nds) =>
            nds.map((n) => n.id === child.id ? { ...n, data: { ...n.data, state: 'Coding' } } : n)
          );
          fetch('http://localhost:3001/workers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: child.id,
              taskLabel: child.label,
              parentId: rootIdRef.current,
              siblingCount: childNodes.length,
            }),
          }).catch((e) => console.error('Worker spawn failed:', e));
        }
        setRunning(false);
      }
    };

    ws.onerror = () => setRunning(false);
  };

  return (
    <div className="w-full h-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <Panel position="top-right">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runTask()}
              placeholder="Describe your task..."
              className="px-3 py-2 rounded shadow text-sm text-black w-64"
              disabled={running}
            />
            <button
              onClick={runTask}
              disabled={running || !prompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded shadow-lg transition-colors"
            >
              {running ? 'Running...' : 'Run'}
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
