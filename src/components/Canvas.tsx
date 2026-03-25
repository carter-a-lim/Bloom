'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
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
import { motion, AnimatePresence } from 'framer-motion';
import TaskNode, { TaskNodeData } from './TaskNode';
import GlassSelect from './GlassSelect';

const nodeTypes = { task: TaskNode };
type TaskState = 'Thinking' | 'Coding' | 'Success' | 'Blocked';

type TaskEntry = {
  id: string;
  prompt: string;
  repoUrl: string;
  status: 'running' | 'done' | 'failed';
  nodeIds: string[];
  error?: string;
};

const nodeMetaMap: Record<string, { label: string; description: string }> = {};

const MODELS = [
  { group: 'Groq', options: [
    { value: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { value: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
    { value: 'groq/mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
  ]},
];

export default function Canvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [prompt, setPrompt] = useState('');
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [newRepo, setNewRepo] = useState('');
  const [model, setModel] = useState('groq/llama-3.3-70b-versatile');
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const taskCounter = useRef(0);

  useEffect(() => {
    const connect = () => {
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
                  ? { ...t, status: newState === 'Success' ? 'done' : 'failed', error: msg.error }
                  : t
              )
            );
          }
        } catch (e) { console.error('Worker WS error', e); }
      };
      ws.onclose = () => setTimeout(connect, 2000);
      ws.onerror = () => ws.close();
      return ws;
    };
    const ws = connect();
    return () => { ws.onclose = null; ws.close(); };
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

  const addRepo = () => {
    const url = newRepo.trim();
    if (!url || repos.includes(url)) return;
    setRepos((r) => [...r, url]);
    setSelectedRepo(url);
    setNewRepo('');
    setAddingRepo(false);
  };

  const runTask = () => {
    if (!prompt.trim()) return;
    const taskPrompt = prompt;
    const taskRepoUrl = selectedRepo;
    const taskModel = model;
    setPrompt('');

    const taskId = `task-${++taskCounter.current}`;
    let rootId: string | null = null;
    const yOffset = taskCounter.current * 420;

    setTasks((ts) => [...ts, { id: taskId, prompt: taskPrompt, repoUrl: taskRepoUrl, status: 'running', nodeIds: [] }]);

    const ws = new WebSocket('ws://localhost:8000/ws/atomizer');
    ws.onopen = () => ws.send(JSON.stringify({ prompt: taskPrompt, model: taskModel }));

    const parentMap: Record<string, string | null> = {};
    const childrenMap: Record<string, string[]> = {};
    const depthMap: Record<string, number> = {};
    const leafNodes: { id: string; label: string; description: string; atomic: boolean }[] = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const processNode = (id: string, label: string, description: string, parentId: string | null, atomic: boolean) => {
        const isRoot = !parentId;
        if (isRoot) rootId = id;
        nodeMetaMap[id] = { label, description: description || '' };
        parentMap[id] = parentId ?? null;
        depthMap[id] = parentId ? (depthMap[parentId] ?? 0) + 1 : 0;
        if (parentId) {
          childrenMap[parentId] = [...(childrenMap[parentId] || []), id];
        }
        const depth = depthMap[id] ?? 0;
        const siblings = parentId ? (childrenMap[parentId] || []) : [];
        const sibIdx = siblings.length - 1;
        const tempX = isRoot ? 400 : 400 + sibIdx * 260;
        return {
          node: { id, type: 'task', position: { x: tempX, y: yOffset + depth * 220 }, data: { label, state: 'Thinking' as const, description: description || '' } } as Node<TaskNodeData>,
          edge: parentId ? { id: `e-${parentId}-${id}`, source: parentId, target: id } : null,
          isLeaf: atomic !== false,
          nodeId: id, label, description: description || '',
        };
      };

      if (msg.type === 'node') {
        const { id, label, description, parentId, atomic } = msg.data;
        const { node, edge, isLeaf } = processNode(id, label, description, parentId, atomic);
        setNodes((nds) => [...nds, node]);
        if (edge) setEdges((eds) => [...eds, edge]);
        if (isLeaf) leafNodes.push({ id, label, description: description || '', atomic: true });
        setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, nodeIds: [...t.nodeIds, id] } : t));
      }
      if (msg.type === 'nodes') {
        const newNodes: Node<TaskNodeData>[] = [];
        const newEdges: any[] = [];
        for (const n of msg.data) {
          const { id, label, description, parentId, atomic } = n;
          const { node, edge, isLeaf } = processNode(id, label, description, parentId, atomic);
          newNodes.push(node);
          if (edge) newEdges.push(edge);
          if (isLeaf) leafNodes.push({ id, label, description: description || '', atomic: true });
        }
        setNodes((nds) => [...nds, ...newNodes]);
        if (newEdges.length) setEdges((eds) => [...eds, ...newEdges]);
        setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, nodeIds: [...t.nodeIds, ...newNodes.map(n => n.id)] } : t));
      }
      if (msg.type === 'done') {
        ws.close();

        // Reflow: count leaves per subtree, assign X by leaf index
        const NODE_W = 200; // node width
        const GAP = 20;     // gap between nodes
        const SLOT = NODE_W + GAP;

        // Count leaves in each subtree
        const leafCount: Record<string, number> = {};
        const allIds = Object.keys(depthMap);
        // Process bottom-up by depth
        const maxDepth = Math.max(...allIds.map(id => depthMap[id] ?? 0));
        for (let d = maxDepth; d >= 0; d--) {
          for (const id of allIds) {
            if ((depthMap[id] ?? 0) !== d) continue;
            const kids = childrenMap[id] || [];
            leafCount[id] = kids.length === 0 ? 1 : kids.reduce((s, k) => s + (leafCount[k] ?? 1), 0);
          }
        }

        // Assign X top-down: each node centered over its leaf slots
        const assignedX: Record<string, number> = {};
        const leafOffset: Record<string, number> = {}; // running leaf offset per node
        assignedX[rootId!] = (leafCount[rootId!] * SLOT) / 2 - SLOT / 2;
        leafOffset[rootId!] = 0;

        // BFS top-down
        const queue2 = [rootId!];
        while (queue2.length) {
          const n = queue2.shift()!;
          const kids = childrenMap[n] || [];
          let offset = (assignedX[n] ?? 0) - ((leafCount[n] ?? 1) * SLOT) / 2 + SLOT / 2;
          for (const k of kids) {
            assignedX[k] = offset + ((leafCount[k] ?? 1) * SLOT) / 2 - SLOT / 2;
            offset += (leafCount[k] ?? 1) * SLOT;
            queue2.push(k);
          }
        }

        setNodes((nds) =>
          nds.map((n) => {
            const x = assignedX[n.id] ?? n.position.x;
            const y = yOffset + (depthMap[n.id] ?? 0) * 220;
            const isLeaf = leafNodes.some(l => l.id === n.id);
            return { ...n, position: { x, y }, data: { ...n.data, state: isLeaf ? 'Coding' : n.data.state } };
          })
        );

        for (const leaf of leafNodes) {
          const meta = nodeMetaMap[leaf.id] || { label: leaf.label, description: '' };
          fetch('http://localhost:3001/workers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: leaf.id, taskLabel: meta.label, taskDescription: meta.description,
              parentId: rootId, siblingCount: leafNodes.length,
              repoUrl: taskRepoUrl || undefined, model: taskModel,
            }),
          }).catch(console.error);
        }
      }
    };
    ws.onerror = () => setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, status: 'failed', error: 'Atomizer connection failed' } : t));
  };

  const repoLabel = (url: string) => url.replace('https://github.com/', '').replace('http://github.com/', '');

  return (
    <div className="flex w-full h-screen" style={{ background: '#0a0a0f' }}>

      {/* Sidebar */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-72 h-full flex flex-col flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
              🌸
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-wide">Bloom</h1>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Visual AI factory</p>
            </div>
          </div>
        </div>

        {/* Repo selector */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <label className="text-xs font-medium mb-2 block" style={{ color: 'rgba(255,255,255,0.4)' }}>
            REPOSITORY
          </label>
          <AnimatePresence mode="wait">
            {addingRepo ? (
              <motion.div key="adding" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-1.5">
                <input
                  autoFocus type="text" value={newRepo}
                  onChange={(e) => setNewRepo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addRepo(); if (e.key === 'Escape') setAddingRepo(false); }}
                  placeholder="github.com/user/repo"
                  className="flex-1 text-xs rounded-lg px-3 py-2 min-w-0 outline-none text-white"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(139,92,246,0.5)', color: 'white' }}
                />
                <button onClick={addRepo} className="text-xs px-3 py-2 rounded-lg font-medium text-white flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>Add</button>
                <button onClick={() => setAddingRepo(false)} className="text-xs px-2 rounded-lg"
                  style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>✕</button>
              </motion.div>
            ) : (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <GlassSelect
                  value={selectedRepo}
                  onChange={(val) => { if (val === '__add__') setAddingRepo(true); else setSelectedRepo(val); }}
                  placeholder="No repo (demo)"
                  options={[
                    { value: '', label: 'No repo (demo)' },
                    ...repos.map((r) => ({ value: r, label: repoLabel(r) })),
                    { value: '__add__', label: '+ Add repo...' },
                  ]}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Model picker */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <label className="text-xs font-medium mb-2 block" style={{ color: 'rgba(255,255,255,0.4)' }}>MODEL</label>
          <GlassSelect
            value={model}
            onChange={setModel}
            options={MODELS.flatMap((g) => g.options)}
          />
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {tasks.length === 0 && (
            <div className="text-center mt-10">
              <p className="text-2xl mb-2">✦</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No tasks yet</p>
            </div>
          )}
          <AnimatePresence>
            {tasks.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-xl p-3"
                style={{
                  background: t.status === 'failed'
                    ? 'rgba(239,68,68,0.08)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${t.status === 'failed' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    t.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                    t.status === 'done' ? 'bg-emerald-400' : 'bg-red-400'
                  }`} />
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {t.status === 'running' ? 'Running' : t.status === 'done' ? 'Done' : 'Failed'}
                  </span>
                  <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {t.nodeIds.length} nodes
                  </span>
                </div>
                <p className="text-sm text-white leading-snug">{t.prompt}</p>
                {t.repoUrl && (
                  <p className="text-xs mt-1 truncate" style={{ color: 'rgba(139,92,246,0.8)' }}>
                    {repoLabel(t.repoUrl)}
                  </p>
                )}
                {t.error && (
                  <p className="text-xs mt-1.5 break-words" style={{ color: 'rgba(239,68,68,0.8)' }}>{t.error}</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Prompt input */}
        <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTask(); } }}
            placeholder="Describe a task..."
            rows={3}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none outline-none text-white placeholder-white/20"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              lineHeight: '1.5',
            }}
            onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,0.5)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          <motion.button
            onClick={runTask}
            disabled={!prompt.trim()}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            Run Task
          </motion.button>
          {nodes.length > 0 && (
            <motion.button
              onClick={() => {
                const tree = nodes.map(n => ({
                  id: n.id,
                  label: n.data.label,
                  state: n.data.state,
                  parentId: edges.find(e => e.target === n.id)?.source ?? null,
                }));
                navigator.clipboard.writeText(JSON.stringify(tree, null, 2));
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="mt-2 w-full py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Copy Node Tree
            </motion.button>
          )}
        </div>
      </motion.div>

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
          style={{ background: 'transparent' }}
        >
          <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.06)" gap={28} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
