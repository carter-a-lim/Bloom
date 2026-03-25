'use client';

import { useCallback, useRef, useState } from 'react';
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

type BlueprintEntry = {
  id: string;
  prompt: string;
  nodeCount: number;
  status: 'generating' | 'done';
};

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
  const [model, setModel] = useState('groq/llama-3.3-70b-versatile');
  const [blueprints, setBlueprints] = useState<BlueprintEntry[]>([]);
  const counter = useRef(0);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)), []
  );

  const generate = () => {
    if (!prompt.trim()) return;
    const taskPrompt = prompt.trim();
    setPrompt('');

    const bpId = `bp-${++counter.current}`;
    const yOffset = counter.current * 440;
    let rootId: string | null = null;

    setBlueprints((bs) => [...bs, { id: bpId, prompt: taskPrompt, nodeCount: 0, status: 'generating' }]);

    const depthMap: Record<string, number> = {};
    const childrenMap: Record<string, string[]> = {};

    const ws = new WebSocket('ws://localhost:8000/ws/atomizer');
    ws.onopen = () => ws.send(JSON.stringify({ prompt: taskPrompt, model }));

    const processNode = (id: string, label: string, description: string, parentId: string | null, atomic: boolean) => {
      if (!parentId) rootId = id;
      depthMap[id] = parentId ? (depthMap[parentId] ?? 0) + 1 : 0;
      if (parentId) childrenMap[parentId] = [...(childrenMap[parentId] || []), id];
      const depth = depthMap[id];
      const node: Node<TaskNodeData> = {
        id, type: 'task',
        position: { x: 400, y: yOffset + depth * 220 },
        data: { label, description: description || '', isLeaf: atomic !== false },
      };
      const edge = parentId ? { id: `e-${parentId}-${id}`, source: parentId, target: id, style: { stroke: 'rgba(255,255,255,0.1)' } } : null;
      return { node, edge };
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'node') {
        const { id, label, description, parentId, atomic } = msg.data;
        const { node, edge } = processNode(id, label, description, parentId, atomic);
        setNodes((nds) => [...nds, node]);
        if (edge) setEdges((eds) => [...eds, edge]);
        setBlueprints((bs) => bs.map((b) => b.id === bpId ? { ...b, nodeCount: b.nodeCount + 1 } : b));
      }

      if (msg.type === 'nodes') {
        const newNodes: Node<TaskNodeData>[] = [];
        const newEdges: Edge[] = [];
        for (const n of msg.data) {
          const { id, label, description, parentId, atomic } = n;
          const { node, edge } = processNode(id, label, description, parentId, atomic);
          newNodes.push(node);
          if (edge) newEdges.push(edge);
        }
        setNodes((nds) => [...nds, ...newNodes]);
        if (newEdges.length) setEdges((eds) => [...eds, ...newEdges]);
        setBlueprints((bs) => bs.map((b) => b.id === bpId ? { ...b, nodeCount: b.nodeCount + newNodes.length } : b));
      }

      if (msg.type === 'done') {
        ws.close();
        setBlueprints((bs) => bs.map((b) => b.id === bpId ? { ...b, status: 'done' } : b));

        // Reflow layout
        const SLOT = 240;
        const leafCount: Record<string, number> = {};
        const allIds = Object.keys(depthMap);
        const maxDepth = Math.max(...allIds.map((id) => depthMap[id] ?? 0));
        for (let d = maxDepth; d >= 0; d--) {
          for (const id of allIds) {
            if ((depthMap[id] ?? 0) !== d) continue;
            const kids = childrenMap[id] || [];
            leafCount[id] = kids.length === 0 ? 1 : kids.reduce((s, k) => s + (leafCount[k] ?? 1), 0);
          }
        }
        const assignedX: Record<string, number> = {};
        assignedX[rootId!] = (leafCount[rootId!] * SLOT) / 2 - SLOT / 2;
        const queue = [rootId!];
        while (queue.length) {
          const n = queue.shift()!;
          const kids = childrenMap[n] || [];
          let offset = (assignedX[n] ?? 0) - ((leafCount[n] ?? 1) * SLOT) / 2 + SLOT / 2;
          for (const k of kids) {
            assignedX[k] = offset + ((leafCount[k] ?? 1) * SLOT) / 2 - SLOT / 2;
            offset += (leafCount[k] ?? 1) * SLOT;
            queue.push(k);
          }
        }
        setNodes((nds) => nds.map((n) => ({
          ...n,
          position: { x: assignedX[n.id] ?? n.position.x, y: yOffset + (depthMap[n.id] ?? 0) * 220 },
        })));
      }
    };

    ws.onerror = () => {
      setBlueprints((bs) => bs.map((b) => b.id === bpId ? { ...b, status: 'done' } : b));
    };
  };

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
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>One prompt. Full blueprint.</p>
            </div>
          </div>
        </div>

        {/* Model picker */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <label className="text-xs font-medium mb-2 block" style={{ color: 'rgba(255,255,255,0.4)' }}>MODEL</label>
          <GlassSelect value={model} onChange={setModel} options={MODELS.flatMap((g) => g.options)} />
        </div>

        {/* Blueprint history */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {blueprints.length === 0 && (
            <div className="text-center mt-10">
              <p className="text-2xl mb-2">✦</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Describe your app below</p>
            </div>
          )}
          <AnimatePresence>
            {[...blueprints].reverse().map((b) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.status === 'generating' ? 'bg-violet-400 animate-pulse' : 'bg-emerald-400'}`} />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {b.status === 'generating' ? 'Designing…' : `${b.nodeCount} nodes`}
                  </span>
                </div>
                <p className="text-sm text-white leading-snug">{b.prompt}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } }}
            placeholder="Describe your app…"
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
            onClick={generate}
            disabled={!prompt.trim()}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            Generate Blueprint
          </motion.button>
          {nodes.length > 0 && (
            <motion.button
              onClick={() => {
                const tree = nodes.map((n) => ({
                  id: n.id,
                  label: n.data.label,
                  description: n.data.description,
                  parentId: edges.find((e) => e.target === n.id)?.source ?? null,
                }));
                navigator.clipboard.writeText(JSON.stringify(tree, null, 2));
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="mt-2 w-full py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Copy Blueprint
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
