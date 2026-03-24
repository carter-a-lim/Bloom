import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

function FlowApp() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);
  const { fitView } = useReactFlow();

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    setNodes([]);
    setEdges([]);

    if (ws.current) {
        ws.current.close();
    }

    ws.current = new WebSocket('ws://localhost:8000/ws/atomizer');

    ws.current.onopen = () => {
      setIsConnected(true);
      ws.current.send(JSON.stringify({ prompt }));
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'node') {
        const { id, label, parentId } = message.data;

        const newNode = {
          id,
          data: { label },
          position: { x: 0, y: 0 },
        };

        setNodes((nds) => {
          const newNodes = [...nds, newNode];

          setEdges((eds) => {
            let newEdges = [...eds];
            if (parentId) {
                newEdges.push({ id: `e${parentId}-${id}`, source: parentId, target: id });
            }

            const layouted = getLayoutedElements(newNodes, newEdges);

            // Schedule the node update to avoid dispatching during render
            setTimeout(() => {
                setNodes(layouted.nodes);
                // After nodes are laid out, fit them into the view
                setTimeout(() => {
                    fitView({ duration: 800 });
                }, 50);
            }, 0);

            return layouted.edges;
          });

          return newNodes;
        });

      } else if (message.type === 'done') {
        setIsConnected(false);
        ws.current.close();
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
    };
  };

  useEffect(() => {
    return () => {
        if (ws.current) {
            ws.current.close();
        }
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px', backgroundColor: '#f0f0f0', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a task..."
          style={{ flexGrow: 1, padding: '5px' }}
          disabled={isConnected}
        />
        <button onClick={handleGenerate} disabled={isConnected || !prompt.trim()}>
          {isConnected ? 'Generating...' : 'Atomize Task'}
        </button>
      </div>
      <div style={{ flexGrow: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Controls />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <FlowApp />
    </ReactFlowProvider>
  );
}

export default App;
