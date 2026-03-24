'use client';

import { useCallback, useState } from 'react';
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

const nodeTypes = {
  task: TaskNode,
};

type TaskState = 'Thinking' | 'Coding' | 'Success' | 'Blocked';

const states: TaskState[] = ['Thinking', 'Coding', 'Success', 'Blocked'];

export default function Canvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [],
  );

  const spawnRootNode = () => {
    const randomState = states[Math.floor(Math.random() * states.length)];
    const newNode: Node<TaskNodeData> = {
      id: `task-${nodes.length + 1}`,
      type: 'task',
      position: { x: 250, y: 100 + nodes.length * 150 },
      data: {
        label: `Root Node ${nodes.length + 1}`,
        state: randomState,
      },
    };

    setNodes((nds) => [...nds, newNode]);
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
          <button
            onClick={spawnRootNode}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow-lg transition-colors"
          >
            New Task
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
