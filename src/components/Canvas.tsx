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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TaskNode, { TaskNodeData } from './TaskNode';

const nodeTypes = { task: TaskNode };
type TaskState = 'Thinking' | 'Coding' | 'Success' | 'Blocked';

type TaskEntry = {
  id: string;
  prompt: string;
  status: 'running' | 'done' | 'failed';
  nodeIds: string[];
};

export default function Canvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [prompt, setPrompt] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const taskCounter = useRef(0);

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
          setTasks((ts) =>
            ts.map((t) =>
              t.nodeIds.includes(msg.nodeId)
                ? { ...t, status: newState === 'Success' ? 'done' : 'failed' }
                : t
            )
          );
        }
      } catch (e) {
        console.error('Worker WS error', e);
      }
    };
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
    if (!prompt.trim()) return;
    const taskPrompt = prompt;
    setPrompt('');

    const taskId = `task-${++taskCounter.current}`;
    const childNodeIds: string[] = [];
    let rootId: string | null = null;
    const yOffset = tasks.length * 400;

    setTasks((ts) => [...ts, { id: taskId, prompt: taskPrompt, status: 'running', nodeIds: [] }]);

    const ws = new WebSocket('ws://localhost:8000/ws/atomizer');
    ws.onopen = () => ws.send(JSON.stringify({ prompt: taskPrompt }));

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'node') {
        const { id, label, parentId } = msg.data;
        const isRoot = !parentId;
        if (isRoot) rootId = id;

        const newNode: Node<TaskNodeData> = {
          id,
          type: 'task',
          position: {
            x: isRoot ? 400 : 150 + childNodeIds.length * 240,
            y: yOffset + (isRoot ? 0 : 160),
          },
          data: { label, state: 'Thinking' },
        };

        setNodes((nds) => [...nds, newNode]);
        if (parentId) {
          setEdges((eds) => [...eds, { id: `e-${parentId}-${id}`, source: parentId, target: id }]);
          childNodeIds.push(id);
        }

        setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, nodeIds: [...t.nodeIds, id] } : t));
      }

      if (msg.type === 'done') {
        ws.close();
        for (const child of childNodeIds) {
          setNodes((nds) =>
            nds.map((n) => n.id === child ? { ...n, data: { ...n.data, state: 'Coding' } } : n)
          );
          fetch('http://localhost:3001/workers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: child,
              taskLabel: nodes.find((n) => n.id === child)?.data.label ?? child,
              taskDescription: (nodes.find((n) => n.id === child)?.data as TaskNodeData & { description?: string })?.description,
              parentId: rootId,
              siblingCount: childNodeIds.length,
              repoUrl: repoUrl || undefined,
            }),
          }).catch(console.error);
        }
      }
    };

    ws.onerror = () => {
      setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, status: 'failed' } : t));
    };
  };

  const statusColor = (s: TaskEntry['status']) =>
    s === 'running' ? 'bg-yellow-400' : s === 'done' ? 'bg-green-400' : 'bg-red-400';

  return (
    <div className="flex w-full h-screen bg-gray-950">
      {/* Canvas */}
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#334155" />
          <Controls />
        </ReactFlow>
      </div>

      {/* Sidebar */}
      <div className="w-80 h-full flex flex-col bg-gray-900 border-l border-gray-700 text-white">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold text-white">🌸 Bloom</h1>
          <p className="text-xs text-gray-400 mt-1">Visual AI task factory</p>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tasks.length === 0 && (
            <p className="text-gray-500 text-sm text-center mt-8">No tasks yet. Start one below.</p>
          )}
          {tasks.map((t) => (
            <div key={t.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${statusColor(t.status)}`} />
                <span className="text-xs text-gray-400 uppercase font-semibold">{t.status}</span>
              </div>
              <p className="text-sm text-white leading-snug">{t.prompt}</p>
              <p className="text-xs text-gray-500 mt-1">{t.nodeIds.length} nodes</p>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-700">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="GitHub repo URL (optional)"
            className="w-full bg-gray-800 text-white text-sm rounded-lg p-2 mb-2 border border-gray-600 focus:outline-none focus:border-blue-500 placeholder-gray-500"
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTask(); } }}
            placeholder="Describe a task... (Enter to run)"
            className="w-full bg-gray-800 text-white text-sm rounded-lg p-3 resize-none border border-gray-600 focus:outline-none focus:border-blue-500 placeholder-gray-500"
            rows={3}
          />
          <button
            onClick={runTask}
            disabled={!prompt.trim()}
            className="mt-2 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
          >
            Run Task
          </button>
        </div>
      </div>
    </div>
  );
}
